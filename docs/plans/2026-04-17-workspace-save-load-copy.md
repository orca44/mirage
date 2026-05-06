# Workspace save / load / copy

**Context:** Today `Workspace.persist()` / `hydrate()` cover ~half of what
an agent needs to resume identically. Cache is the biggest gap — without
it, "resuming" pays full network costs on the first round of reads.
Forking a workspace (e.g., for speculative execution or parallel agent
exploration) has no API at all today.

This plan adds first-class **save / load / copy** for `Workspace`.
Format: a **tar archive** containing one **JSON manifest** plus **raw
binary side-files** for bytes (cache entries, RAM/Disk/Redis content).
Pickle is intentionally not used — JSON+tar is portable across
languages (TS, Go, Rust can all read it) and inspectable with standard
tools (`tar tf snap.tar`, `jq < manifest.json`).

______________________________________________________________________

## Goals

1. **`ws.save(path)` / `Workspace.load(path, resources=...)`** — round-trip
   a workspace to a `.tar` (or `.tar.gz`). After load, the workspace
   behaves identically to the saved one for any subsequent command.
1. **`ws.copy()`** — produce an independent workspace with the same
   state. Writes to the copy do not affect the original (for local
   backends). For remote backends with shared physical storage (S3
   bucket, GDrive folder), the storage is still shared.
1. **`copy.deepcopy(ws)`** — works via `__deepcopy__` that delegates to
   `copy()`.

`copy()` does NOT round-trip through the tar format — it works directly
on the in-memory state dict (deepcopy). Tar is only for save/load.

**Copy is deep, never shallow.** A shallow `Workspace` copy would
share `_cache`, `_session_mgr`, `_tracker`, resources, history etc.
with the original — every "copy" would be an alias. Useless.

```python
def copy(self): ...                    # deep semantics — the only useful kind
def __deepcopy__(self, memo): return self.copy()
def __copy__(self):
    raise NotImplementedError(
        "Workspace has no useful shallow copy — "
        "use ws.copy() or copy.deepcopy(ws)."
    )
```

`copy.copy(ws)` raises rather than silently producing a broken
workspace.

______________________________________________________________________

## Why tar + JSON manifest (and not pickle, not raw JSON)

| Format                              | Inspectable              | Portable to TS/Go/Rust              | RCE-safe on load | Streaming-friendly                       | Bytes-friendly                          |
| ----------------------------------- | ------------------------ | ----------------------------------- | ---------------- | ---------------------------------------- | --------------------------------------- |
| Pickle                              | no                       | no                                  | **no**           | no                                       | yes (native)                            |
| JSON only                           | yes                      | yes                                 | yes              | no                                       | no — bytes need base64 (33% bloat)      |
| MessagePack                         | partial (binary)         | yes                                 | yes              | partial                                  | yes (native)                            |
| **Tar + JSON manifest + raw blobs** | **yes** (tar tools + jq) | **yes** (any tar lib + JSON parser) | **yes**          | **yes** (tar streams, JSON parses small) | **yes** (raw bytes as files inside tar) |

Tar+JSON gives us all four "yes" columns. The tradeoff is ~200 LOC of
bundling code instead of ~50 LOC of `pickle.dump`. Acceptable for the
properties gained — especially **OpenAI Agents compatibility** (their
sandbox state is also tar-shaped).

______________________________________________________________________

## Backend serialization policy

Each backend snapshots **all of its content that can't be reconstructed
elsewhere**. Cloud-backend credentials are explicitly redacted with the
sentinel string `"<REDACTED>"`; the loader must re-supply them via the
`resources=` override.

| Backend                                                                                 | What's in the snapshot                                                          | `needs_override` at load?                                    |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **RAM**                                                                                 | full files dict + dirs, bytes as side-files                                     | no                                                           |
| **Disk**                                                                                | full file-tree contents, files preserved at their relative paths inside the tar | no (default = fresh tmpdir; caller can override target root) |
| **Redis**                                                                               | all keys-with-prefix + values as side-files                                     | yes (caller supplies target Redis URL)                       |
| **S3 / GCS / R2 / OCI / Supabase**                                                      | bucket + region; creds replaced with `"<REDACTED>"`                             | yes (caller supplies fresh creds)                            |
| **GDrive / Gmail / Gdocs / Gsheets / Gslides**                                          | client_id; secret + refresh_token replaced with `"<REDACTED>"`                  | yes                                                          |
| **Discord / Slack / Telegram / Notion / Linear / Trello / GitHub / Langfuse / MongoDB** | endpoint config; token replaced with `"<REDACTED>"`                             | yes                                                          |
| **SSH**                                                                                 | host; key replaced with `"<REDACTED>"`                                          | yes                                                          |

| Cache backend         | What's in the snapshot                                                  |
| --------------------- | ----------------------------------------------------------------------- |
| `RAMFileCacheStore`   | full entries metadata in manifest + bytes as side-files                 |
| `RedisFileCacheStore` | full content dump, same shape as RAM (caller supplies target Redis URL) |

### `needs_override=True` semantics

When loading a snapshot, the user MUST supply a fresh Resource for every
mount where `needs_override=True`. If any are missing from `resources=`,
**load fails fast** with a single `ValueError` listing all missing
prefixes.

Why per backend:

- **Cloud / token resources** — credentials were stripped at save; the
  saved state alone can't authenticate. Caller supplies fresh creds.
- **Redis** — saved data is in the tar but the target URL is unknown
  at load time (the original Redis may not be reachable from the load
  machine). Caller specifies where to write the data back.
- **Disk** — optional, not required. Default behavior creates a fresh
  tmpdir per disk mount and writes the snapshotted file tree into it.
  Caller can override by supplying `DiskResource(root="/where/i/want")`
  in `resources=` and the load_state writes there instead.

### Redaction sentinel: `"<REDACTED>"`

Each resource's `get_state()` replaces sensitive fields with the
literal string `"<REDACTED>"` rather than `None`. Reasons:

- Distinguishes "deliberately stripped" from "legitimately empty"
- Greppable in raw bytes (the cred-leak test does
  `assert b"<REDACTED>" in archive_bytes` and `assert b"<actual key chars>" not in archive_bytes`)
- Self-documenting if someone inspects manifest.json

______________________________________________________________________

## API

```python
# disk
ws.save("snap.tar")                          # uncompressed
ws.save("snap.tar.gz", compress="gz")        # gzipped tar

ws = Workspace.load(
    "snap.tar",
    resources={
        "/s3":    S3Resource(config=S3Config(... fresh creds ...)),
        "/redis": RedisResource(url="redis://prod:6379/0"),
        "/gdrive": GoogleDriveResource(config=GoogleDriveConfig(...)),
    },
)

# in-memory copy (no overrides needed — same machine, same creds)
ws2 = ws.copy()
ws2 = copy.deepcopy(ws)   # same path internally
```

`resources=` is the override dict. Keys are saved prefixes, values are
fully-constructed Resource instances with whatever fresh creds /
endpoints the loader wants to use.

**Override resolution rules:**

1. If a saved mount has `needs_override=True` and no entry in
   `resources=`, load fails fast with a clear list of missing prefixes.
1. If `resources=` has an entry, that resource replaces what would
   have been reconstructed from the saved state. The resource's
   *runtime* state takes precedence over what was saved.
1. The resource's `_index` cache from the saved state is **dropped**
   when overridden — fresh resource, fresh index. Avoids stale
   metadata pointing at a different bucket.

______________________________________________________________________

## Tar layout

```
snap.tar
├── manifest.json                   # full metadata; bytes replaced with {"__file": ...} refs
├── mounts/                         # content-bearing mounts get a subtree here
│   ├── 0/                          # mount index 0 — RAM resource
│   │   └── files/
│   │       ├── 0.bin               # one file per RAM file (path is in manifest)
│   │       └── 1.bin
│   ├── 1/                          # mount index 1 — Disk resource
│   │   └── files/                  # tree-preserving for disk
│   │       ├── a.txt
│   │       └── sub/
│   │           └── b.txt
│   └── 2/                          # mount index 2 — Redis resource
│       └── data/
│           ├── 0.bin               # one file per Redis value (key in manifest)
│           └── 1.bin
└── cache/
    └── blobs/
        ├── 0.bin                   # cache entry bytes
        └── 1.bin
```

Two conventions used here:

- **RAM and Redis** use **numbered blobs** (`0.bin`, `1.bin`, ...) with
  the original key/path stored in manifest.json. Numbered blobs because
  the keys may be arbitrary strings that don't translate cleanly to
  filesystem paths.
- **Disk** uses **tree-preserving** layout — files appear at their
  original relative path inside the tar. This makes
  `tar -xf snap.tar -C /somewhere` give you a usable directory tree
  (useful for OpenAI Agents-style tooling that wants to extract the
  raw fs).

Both are referenced from the manifest the same way: `{"__file": "<tar-relative-path>"}`.

______________________________________________________________________

## Manifest schema

```jsonc
{
  "version": 1,
  "mirage_version": "0.1.0",
  "created_at": "2026-04-17T10:00:00Z",

  "mounts": [
    {
      "prefix": "/scratch",                                  // index 0
      "mode": "WRITE",
      "consistency": "LAZY",
      "resource_class": "mirage.resource.ram.RAMResource",
      "resource_state": {
        "files": {
          // key = path inside the RAM resource; relative to the RAM
          // resource's own root (always "/", since RAM is rootless)
          "/a.txt":     {"__file": "mounts/0/files/0.bin"},
          "/sub/b.txt": {"__file": "mounts/0/files/1.bin"}
        },
        "dirs": ["/sub"],
        "needs_override": false
      }
    },
    {
      "prefix": "/work",                                     // index 1
      "resource_class": "mirage.resource.disk.DiskResource",
      "resource_state": {
        "files": {
          // key = path RELATIVE to the original disk root, e.g. if
          // saved DiskResource had root="/tmp/disk1" and a file at
          // "/tmp/disk1/data/a.txt", the key is "data/a.txt".
          // The tar path mirrors the relative key (tree-preserved).
          "data/a.txt": {"__file": "mounts/1/files/data/a.txt"},
          "sub/b.txt":  {"__file": "mounts/1/files/sub/b.txt"}
        },
        "needs_override": false
      }
    },
    {
      "prefix": "/r",                                        // index 2
      "resource_class": "mirage.resource.redis.RedisResource",
      "resource_state": {
        "key_prefix": "mirage:fs:",
        "data": {
          "/a.txt":     {"__file": "mounts/2/data/0.bin"},
          "/sub/b.txt": {"__file": "mounts/2/data/1.bin"}
        },
        "dirs": ["/sub"],
        "needs_override": true
      }
    },
    {
      "prefix": "/s3",                                       // index 3
      "resource_class": "mirage.resource.s3.S3Resource",
      "resource_state": {
        "config": {
          "bucket": "my-bucket",
          "region": "us-east-1",
          "aws_access_key_id":     "<REDACTED>",
          "aws_secret_access_key": "<REDACTED>"
        },
        "redacted_fields": ["aws_access_key_id", "aws_secret_access_key"],
        "needs_override": true
      }
    }
  ],

  "sessions": [/* session.to_dict() */],
  "default_session_id": "default",
  "default_agent_id": "default",
  "current_agent_id": "default",

  "inodes": {/* path: inode.model_dump() */},

  "cache": {
    "limit": 536870912,
    "max_drain_bytes": null,
    "size": 12345,
    "entries": [
      {
        "key": "/s3/data.csv",
        "data": {"__file": "cache/blobs/0.bin"},
        "fingerprint": "etag-abc",
        "ttl": null,
        "cached_at": 1729001234
      }
    ]
  },

  "history": [/* execution_record.to_dict() */],
  "jobs":    [/* finished_job.to_dict() */],
  "sync_policy": "STAGED"
}
```

### `{"__file": <path>}` placeholder

- The only special form in the manifest. Walks of the manifest
  resolve every `{"__file": <path>}` dict to the bytes read from
  `<path>` inside the tar.
- A `dict` with exactly the key `"__file"` (and no other keys) is
  treated as a placeholder. Anything else is a regular dict.
- The placeholder always points to a file that exists in the tar —
  manifest correctness is checked at load time.

### Plain-types-only rule for the manifest

Every value in the manifest (and every nested value) must be one of:
`dict`, `list`, `str`, `int`, `float`, `bool`, `None`, **plus the
`{"__file": ...}` placeholder for bytes**. No raw `bytes`, no `set`,
no dataclasses, no Pydantic models — all of those go through `to_dict`
or get replaced with placeholders before serialization.

This is what makes the manifest portable to TS/Go/Rust without
language-specific decoding.

______________________________________________________________________

## Implementation

### Layered functions

```python
# in mirage/workspace/snapshot.py (new file)

def to_state_dict(ws: Workspace) -> dict:
    """Build the in-memory state dict. Bytes are kept as raw bytes."""
    ...

def from_state_dict(state: dict, resources: dict | None = None) -> Workspace:
    """Reconstruct a Workspace from an in-memory state dict."""
    ...

def split_manifest_and_blobs(state: dict) -> tuple[dict, dict[str, bytes]]:
    """
    Walk the state dict. Replace every bytes value with a
    {'__file': '<auto-path>'} placeholder. Returns (manifest, blobs)
    where blobs is {tar_path: bytes_data}.
    """
    ...

def resolve_manifest(manifest: dict, blob_reader) -> dict:
    """
    Walk the manifest. Replace every {'__file': p} placeholder with
    the bytes read by blob_reader(p). Returns a state dict ready
    for from_state_dict.
    """
    ...

def write_tar(path: str | Path, manifest: dict, blobs: dict[str, bytes],
              *, compress: str | None = None) -> None:
    """Write manifest.json + every blob to a tar archive."""
    ...

def read_tar(path: str | Path) -> dict:
    """Open tar, parse manifest.json, resolve all placeholders, return
    state dict."""
    ...
```

### Workspace methods

```python
class Workspace:
    def save(self, path, *, compress=None):
        state = to_state_dict(self)
        manifest, blobs = split_manifest_and_blobs(state)
        write_tar(path, manifest, blobs, compress=compress)

    @classmethod
    def load(cls, path, *, resources=None):
        state = read_tar(path)
        return from_state_dict(state, resources=resources)

    def copy(self):
        state = to_state_dict(self)
        return from_state_dict(copy.deepcopy(state))

    def __deepcopy__(self, memo):
        return self.copy()
```

### Per-backend `get_state()` / `load_state()`

Each resource implements its own pair. The state dict shape is up to
the resource — only the contract that "this round-trips" matters.

| Resource          | `get_state()`                                                                                                      | `load_state(state)`                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| RAMResource       | `{"files": {...}, "dirs": {...}, "needs_override": false}`                                                         | populate `_store.files`, `_store.dirs`                                                                                        |
| DiskResource      | walk root, return `{"files": {rel_path: bytes, ...}, "needs_override": false}`                                     | use `self._root` (set at construction) — caller-controlled if overridden, fresh tmpdir if not — write every (rel_path, bytes) |
| RedisResource     | SCAN keys, MGET values, return `{"key_prefix": ..., "data": {path: bytes}, "dirs": [...], "needs_override": true}` | requires URL via override; pipeline-SET every (path, bytes) under the new key_prefix                                          |
| S3Resource et al. | dump bucket/region/etc.; cred fields → `"<REDACTED>"`; mark `needs_override=True`                                  | only ever called when override is present; saved state is metadata only                                                       |

______________________________________________________________________

## Subtleties to settle as we go

1. **Snapshot size + memory during save.** Disk- and Redis-by-content
   can produce large tars. Default implementation buffers each blob in
   memory before writing to the tar. For multi-GB mounts add a streaming
   variant later (the tar format is naturally streamable).

1. **Disk on load: where do files land?** Default = fresh tmpdir per
   disk mount. Caller can supply a root via `resources={"/work": DiskResource(root="/where/i/want")}`. The `load_state` writes the
   snapshotted file tree into whichever root the constructed resource
   has.

1. **Redis on load.** `needs_override=True` for Redis means caller
   supplies `RedisResource(url=..., key_prefix=...)` in `resources=`.
   The loader pipeline-SETs the dumped data into that instance.
   **Important:** if the target Redis already has keys with the same
   prefix, the load *adds* (overwrites per-key). Pre-flush is the
   caller's responsibility; document.

1. **Mid-save consistency for Redis.** SCAN+MGET is not atomic — a
   writer could mutate keys mid-snapshot. Acceptable for v1; document
   "quiesce before save".

1. **Resource `get_state()` audit.** Today's `get_state()` doesn't do
   redaction at all. Audit + retrofit each resource as PR 1.

1. **Cred redaction is a real check.** Test inspects the raw tar bytes
   and asserts no real cred string appears, only `"<REDACTED>"`.

1. **Cache copied independently in `copy()`.** Each fork has its own
   cache from the moment of split. (`copy()` doesn't dump+restore
   Redis content though — see point 14.)

1. **Cache freshness on `load()`.** Loaded cache entries keep their
   `cached_at` and `fingerprint`. Under `LAZY` consistency they're
   served as-is. Under `ALWAYS` they're revalidated on next read. No
   special handling needed.

1. **Override drops saved index.** When caller supplies an override
   resource for a mount, the saved `_index` for that mount is dropped.
   Fresh resource, fresh index. Avoids stale metadata pointing at a
   different bucket / OAuth user.

1. **Resource class re-import.** `resource_class` is a dotted string;
   loading does `importlib.import_module + getattr`. Workspaces saved
   on one machine load on another only if the same resource classes
   are installed. Document.

1. **Tar safety on load.** `tarfile.extractall` is a known
   [path-traversal vulnerability](https://docs.python.org/3/library/tarfile.html#tarfile.TarFile.extractall)
   when given untrusted archives. We don't use `extractall` — we
   only `extractfile` named entries from the manifest. Still, validate
   every `__file` reference against an allowlist of safe names
   (no `..`, no absolute paths, must be inside expected subtrees).

1. **Job-table renumbering.** After load, what's the next job id?
   Default: `max(finished_jobs) + 1`.

1. **History cap.** A 100-entry history with materialized stdouts can
   be MB-scale. `save()` honors current `history.max_entries`.

1. **Override for `copy()`.** `copy()` doesn't take overrides — same
   process, same creds. **For `copy()` specifically, Redis and S3
   resources should `share` the underlying storage** (both copies see
   the same Redis/S3 state). Saving and re-loading in-process when
   nothing changed is wasted work. This is a divergence between
   `copy()` and `save→load` semantics — call it out.

1. **Compression.** Default uncompressed (transparency). Optional
   `compress="gz"` parameter for `save()`; `load()` auto-detects from
   file magic bytes.

______________________________________________________________________

## Tests

1. **RAM round trip.** Write files, run `cat`, save, load, re-run
   `cat`, assert identical stdout and cache hit count.
1. **Disk round trip.** Write files into `DiskResource(root=tmp1)`,
   save, load (default fresh tmpdir), assert `ls`/`cat` see same
   files in the new location. Original tmp1 unaffected.
1. **Disk round trip with override root.** Same as 2 but caller
   supplies `DiskResource(root=tmp2)` via `resources=`; assert files
   land in tmp2.
1. **Redis round trip.** Write keys, save, load with
   `resources={"/r": RedisResource(url=fresh_url, key_prefix="t:")}`,
   assert keys appear under new prefix in fresh Redis.
1. **S3 round trip.** Workspace with mocked S3 mount, save, load with
   override providing fresh mock client, exercise read/write.
1. **`needs_override` enforcement.** Save workspace with S3 mount,
   call `Workspace.load(path)` without `resources=`, expect
   `ValueError` mentioning the missing prefix.
1. **`needs_override` enforcement — multi.** Save workspace with S3 +
   GDrive + Redis mounts; call load with no overrides; expect single
   error listing all three missing prefixes.
1. **Cred redaction in raw bytes.** Save S3 mount, read raw tar bytes,
   assert no real cred string is present anywhere; assert
   `b"<REDACTED>"` IS present.
1. **Override drops saved index.** Save workspace with S3 mount that
   has `_index` populated, load with override S3 resource, assert the
   new mount's `_index` starts empty.
1. **`copy()` independence on RAM.** `echo hi > /a.txt`, copy,
   `echo bye > /a.txt` in copy, assert original still reads `hi`.
1. **`copy()` independence of cache.** Cache a file, copy, mutate
   cache in copy, assert original cache unchanged.
1. **`copy()` shares Redis backend.** Workspace with Redis mount;
   copy; write through copy; assert original sees the new key.
   (Confirms `copy()` doesn't dump+re-load Redis content.)
1. **Finished jobs survive, pending dropped.**
1. **History round trip.**
1. **`copy.deepcopy(ws)` works.**
1. **Round trip preserves `max_drain_bytes`.**
1. **Manifest is valid JSON.** Open the saved tar, extract
   `manifest.json`, assert `json.loads` works and the result has the
   expected top-level keys.
1. **Tar path-traversal defense.** Hand-craft a tar where
   manifest.json references `{"__file": "../../etc/passwd"}`.
   `Workspace.load` rejects with a clear error before reading
   anything.
1. **Compressed save/load round trip.** `save(path, compress="gz")`,
   `load(path)` (auto-detects), full round trip works.
1. **Disk file tree is tar-extractable.** Save a workspace with disk
   mount, manually `tar -xf snap.tar -C /somewhere`, assert the disk
   files appear at `/somewhere/mounts/<idx>/files/...` with original
   contents and tree structure.

______________________________________________________________________

## Suggested sequencing

| PR  | Scope                                                                                                                                                  | Risk   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 1   | Audit + retrofit each resource's `get_state` / `load_state`: full content for RAM/Disk/Redis, redaction + `needs_override` for cloud/token resources   | medium |
| 2   | New `mirage/workspace/snapshot.py` module: `to_state_dict`, `from_state_dict`, `split_manifest_and_blobs`, `resolve_manifest`, `write_tar`, `read_tar` | medium |
| 3   | Workspace methods: `save`, `load`, `copy`, `__deepcopy__`, `__copy__` (raises). Include path-traversal defense and `needs_override` enforcement        | medium |
| 4   | Tests (round-trip per backend, override enforcement, cred redaction in raw bytes, copy independence, manifest validity, compressed mode)               | low    |
| 5   | Per-resource examples: extend each `examples/<resource>/<resource>.py` with a "Persistence" section demonstrating save/load/copy/deepcopy + cleanup    | low    |

PR 1 is the heaviest piece — touching every resource — instead of an
afterthought. PR 2 is pure-Python module with no Mirage dependencies
beyond `Workspace` types. PR 3 wires it up. PR 4 verifies via unit
tests. PR 5 verifies end-to-end against real resource APIs.

______________________________________________________________________

## Per-resource examples (PR 5)

Each existing `examples/<resource>/<resource>.py` gets a new section at
the end demonstrating the persistence APIs. Same template across all
resources, parameterized by what the resource needs:

```python
# ── persistence: save / load / copy / deepcopy ──────────────────────
import copy as _copy
import tempfile, os

print("\n=== PERSISTENCE ===\n")

# 1. save to tar, load back
with tempfile.NamedTemporaryFile(suffix=".tar", delete=False) as f:
    snap_path = f.name
try:
    ws.save(snap_path)
    print(f"  saved → {snap_path} ({os.path.getsize(snap_path)} bytes)")

    # for cloud/token resources: must supply fresh resource via resources=
    loaded_ws = Workspace.load(
        snap_path,
        resources={
            "/<prefix>": <ResourceClass>(config=<freshly-built config>),
        },
    )
    print(f"  loaded back, mounts: {[m.prefix for m in loaded_ws.mounts()]}")

    # exercise loaded workspace to confirm it works
    r = await loaded_ws.execute("ls /<prefix>")
    print(f"  loaded ws ls exit={r.exit_code}")

    # 2. copy() — independent workspace
    copied = ws.copy()
    print(f"  copy() → mounts: {[m.prefix for m in copied.mounts()]}")
    # mutate copy, assert original unchanged (where applicable for local backends)

    # 3. copy.deepcopy() — same as copy()
    deep = _copy.deepcopy(ws)
    print(f"  deepcopy() → mounts: {[m.prefix for m in deep.mounts()]}")

    # 4. shallow copy must raise
    try:
        _copy.copy(ws)
        print("  ✗ shallow copy should have raised")
    except NotImplementedError as e:
        print(f"  ✓ shallow copy raises: {e}")
finally:
    os.unlink(snap_path)
```

### Coverage matrix

| Example file                       | Resource class       | `resources=` override at load     | Expected `needs_override` |
| ---------------------------------- | -------------------- | --------------------------------- | ------------------------- |
| `examples/ram/ram.py`              | RAMResource          | none                              | no                        |
| `examples/disk/disk.py`            | DiskResource         | optional `DiskResource(root=...)` | no                        |
| `examples/redis_resource/redis.py` | RedisResource        | required (fresh URL)              | yes                       |
| `examples/s3/s3.py`                | S3Resource           | required (fresh creds)            | yes                       |
| `examples/r2/r2.py`                | R2Resource           | required                          | yes                       |
| `examples/gcs/gcs.py`              | GCSResource          | required                          | yes                       |
| `examples/oci/oci.py`              | OCIResource          | required                          | yes                       |
| `examples/gdrive/gdrive.py`        | GoogleDriveResource  | required (refresh token)          | yes                       |
| `examples/gmail/example.py`        | GmailResource        | required                          | yes                       |
| `examples/gdocs/gdocs.py`          | GoogleDocsResource   | required                          | yes                       |
| `examples/gsheets/gsheets.py`      | GoogleSheetsResource | required                          | yes                       |
| `examples/gslides/gslides.py`      | GoogleSlidesResource | required                          | yes                       |
| `examples/slack/slack.py`          | SlackResource        | required (token)                  | yes                       |
| `examples/discord/discord.py`      | DiscordResource      | required                          | yes                       |
| `examples/telegram/telegram.py`    | TelegramResource     | required                          | yes                       |
| `examples/notion/notion.py`        | NotionResource       | required                          | yes                       |
| `examples/linear/linear.py`        | LinearResource       | required                          | yes                       |
| `examples/trello/trello.py`        | TrelloResource       | required                          | yes                       |
| `examples/github/github.py`        | GitHubResource       | required                          | yes                       |
| `examples/email/example_email.py`  | EmailResource        | required                          | yes                       |
| `examples/langfuse/langfuse.py`    | LangfuseResource     | required                          | yes                       |
| `examples/mongodb/mongodb.py`      | MongoDBResource      | required                          | yes                       |
| `examples/ssh/ssh.py`              | SSHResource          | required                          | yes                       |
| `examples/cross/example.py`        | mixed                | per-prefix, mixed                 | mixed                     |

All cloud/token examples re-use the existing `.env.development` for
the load-time creds — no new cred handling needed.

### Key invariants each example asserts

For each resource example:

1. **save → load → execute round-trip works** (load returns a usable
   workspace that responds correctly to a basic command).
1. **`copy()` returns a Workspace with the same mounts** (sanity
   check on the construction).
1. **`copy.deepcopy(ws)` works** (same as #2 via stdlib path).
1. **`copy.copy(ws)` raises `NotImplementedError`** (the explicit
   guardrail).
1. **For local backends only (RAM, Disk):** mutating the copy does
   NOT affect the original. (Skip for cloud — both copies share the
   same bucket.)
1. **For Redis:** mutating the copy DOES affect the original
   (shared instance). Document explicitly so users aren't surprised.
1. **Cleanup**: snapshot tar is deleted in a `finally` block. For
   Redis/S3 round-trips that wrote test data, clean it up.

### Cross-mount example (`examples/cross/example.py`)

Special case — exercises the multi-resource override path:

```python
loaded_ws = Workspace.load(
    snap_path,
    resources={
        "/s3":     S3Resource(config=...),
        "/gdrive": GoogleDriveResource(config=...),
        "/slack":  SlackResource(config=...),
        # "/ram"  intentionally omitted — no override required
    },
)
```

This is the most useful demo because it shows the realistic case
where multiple cloud resources each need fresh creds at load.

______________________________________________________________________

## Out of scope (explicit non-goals)

- **Pickle format.** Not used. JSON+tar is the only on-disk format.
- **Streaming save / incremental snapshots.** v1 buffers each blob in
  memory before writing to the tar. If multi-GB mounts become common,
  add a streaming variant — the tar layout doesn't change.
- **Format migration across mirage versions.** v1 has `version: 1` and
  refuses to load anything else. Migrations come when needed.
- **Partial load.** Useful but not v1. Add as
  `load(path, *, include_cache=True, include_history=True)` flags later.
- **Tar integrity checks** beyond `tarfile`'s built-in. No checksums
  in the manifest; if you want integrity, gzip it (gzip has a CRC) or
  sign the tar separately.
- **Side-by-side pickle support.** No. JSON+tar only. Adding pickle
  later is easy if needed; not adding now keeps the surface small.
- **Re-encrypting redacted fields.** Snapshots have `<REDACTED>`
  literally, not encrypted ciphertext. If a snapshot needs to ship
  with reusable creds, that's a different feature (envelope-encrypted
  creds with a separate key).
- **OpenAI Agents-shaped manifest.** We use our own JSON schema. If
  someone wants to import a Mirage snapshot into OpenAI Agents (or
  vice versa), that's a separate adapter layer that maps between
  schemas.

______________________________________________________________________

## Estimate

- PR 1 (resource audit + retrofit): ~30 resources × ~10–30 LOC each.
  ~300–500 LOC. ~4 hours.
- PR 2 (snapshot module): ~250 LOC. ~3 hours.
- PR 3 (Workspace wiring + safety checks): ~150 LOC. ~2 hours.
- PR 4 (tests): ~500 LOC across ~20 test functions. ~3 hours.
- PR 5 (per-resource examples): ~24 examples × ~40 LOC each. Mostly
  copy-paste of the same template. ~3 hours.

Total: ~2 days. PR 5 catches anything PR 4 misses by exercising the
real resource APIs end-to-end (similar to the `examples/s3/s3.py` mv
test we wrote — that one surfaced the GCS write bug that no unit test
would have caught).
