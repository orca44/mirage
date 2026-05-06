# Workspace prefix remap on load

**Context:** The save/load plan introduces an optional `resources=`
override at load time so users can swap in fresh credentials. But what
if the user wants to mount the loaded resource at a *different prefix*
than it was saved with? E.g.:

```python
# saved with /s33
ws = Workspace.load("snap.pkl", resources={"/s33": fresh_resource},
                    prefix_map={"/s33": "/s3"})  # remount as /s3
```

Without a remap pass, every place the workspace stores virtual paths
breaks: cache misses, dirty tracker pointing at dead paths, history
referencing prefixes that no longer exist.

This is a **separate concern from save/load** and gets its own plan.

______________________________________________________________________

## Inventory: where virtual paths live

A workspace holds prefixed virtual paths (e.g., `/s3/data.csv`) in
many places. Each one needs a remap policy:

| Surface                                   | Stored as                     | Remap on load?                   | Notes                                               |
| ----------------------------------------- | ----------------------------- | -------------------------------- | --------------------------------------------------- |
| `_cache._entries` (LRU dict)              | virtual path keys             | ✅                               | obvious — wrong key = miss forever                  |
| `_cache._store.files` (RAM cache backing) | virtual path keys             | ✅                               | same issue                                          |
| Resource `_index` (per-mount)             | virtual path keys             | ✅                               | index cache fingerprints stored under virtual paths |
| `_tracker._inodes`                        | virtual path keys             | ✅                               | dirty tracker uses virtual paths                    |
| `_session_mgr` cwd                        | virtual path                  | ✅ if cwd starts with old prefix | may also be `/` or some other mount                 |
| `_session_mgr` env                        | strings — could contain paths | ❌                               | free-form text, can't reliably rewrite              |
| `_ops.records` (`OpRecord.path`)          | virtual path                  | ✅                               | structured field, easy                              |
| `history.entries[].command`               | raw command string            | ❌                               | free-form, regex rewrite is fragile                 |
| `history.entries[].tree.command`          | raw command string per node   | ❌                               | same                                                |
| `history.entries[].stdout` / `.stdin`     | bytes                         | ❌                               | could contain paths but unsafe to rewrite           |
| Observer log entries                      | structured records            | ✅ if structured                 | mostly mirrors ops records                          |
| `job_table` (finished jobs)               | command strings               | ❌                               | same as history                                     |

**Decision rule for the table:**

- **Structured fields with explicit virtual paths** → rewrite.
- **Free-form text (commands, env values, stdout)** → leave as-is.

Free-form text is left alone because regex-based path rewriting on
arbitrary command strings is unsafe (`/s33` is also a substring of
`/s33b/...`, etc.). History is for inspection, not replay; if the user
remaps, replay against new prefixes is on them.

______________________________________________________________________

## Two design choices

### A. Restrict — no prefix change at load

The `resources=` dict keys MUST match the saved prefixes. Users who
want a rename do it as a separate operation after load.

```python
ws = Workspace.load("snap.pkl", resources={"/s33": fresh_resource})
# loaded at /s33 with new resource; no rewrite happens
```

- ✅ Simplest. Load is purely "rebuild what was saved."
- ✅ Forces users to think about renames as a distinct operation.
- ❌ If they want a different prefix they must call a follow-up method
  (which doesn't exist yet — see option B for that).

### B. Allow — `prefix_map=` parameter at load

```python
ws = Workspace.load(
    "snap.pkl",
    resources={"/s33": fresh_resource},
    prefix_map={"/s33": "/s3"},     # remount as /s3
)
```

Load-time pass walks the inventory above and rewrites structured
fields. Free-form text is left alone (documented).

- ✅ One-step remap.
- ❌ More code, more edge cases.
- ❌ The same logic could be useful at runtime (`ws.rename_mount`),
  which would duplicate effort.

### C. Both — `prefix_map=` for load AND `rename_mount` for runtime

A single internal `_remap_prefix(state, old, new)` function powers
both:

```python
# load-time (during _from_state_dict)
ws = Workspace.load("snap.pkl", resources={...},
                    prefix_map={"/s33": "/s3"})

# runtime
ws.rename_mount("/s33", "/s3")
```

- ✅ Reuses one piece of logic for two use cases.
- ❌ Most code; need to think about runtime safety (active jobs,
  drain tasks holding old paths, etc.).

______________________________________________________________________

## Recommendation

**Phase 1 (with save/load plan): A.** Ship save/load with the
restriction that `resources=` keys match saved prefixes. Document.

**Phase 2 (separate PR, this plan): C.** Implement
`_remap_prefix(state_dict, old, new)`, expose it via load-time
`prefix_map=` AND via `Workspace.rename_mount(old, new)`.

This way save/load lands quickly without prefix-remap complexity
contaminating it, and the remap work happens once but serves both
load-time and runtime renames.

______________________________________________________________________

## Implementation sketch (Phase 2)

### `_remap_prefix(state: dict, old: str, new: str) -> dict`

Pure function. Operates on a state dict (post-`_to_state_dict`,
pre-`_from_state_dict`). Returns a new dict with all structured
virtual-path occurrences rewritten.

```python
def _remap_prefix(state, old, new):
    old = _normalize(old)   # strip trailing slash
    new = _normalize(new)
    out = copy.deepcopy(state)

    # mounts table
    for m in out["mounts"]:
        if _matches(m["prefix"], old):
            m["prefix"] = _replace_prefix(m["prefix"], old, new)

    # dirty inodes
    out["inodes"] = {
        _maybe_replace(p, old, new): v for p, v in out["inodes"].items()
    }

    # cache entries
    for e in out["cache"]["entries"]:
        e["key"] = _maybe_replace(e["key"], old, new)

    # ops records
    for r in out["ops_records"]:
        r["path"] = _maybe_replace(r["path"], old, new)

    # session cwd
    for s in out["sessions"]:
        if s.get("cwd"):
            s["cwd"] = _maybe_replace(s["cwd"], old, new)

    # resource _index keys (each resource's index cache)
    for m in out["mounts"]:
        idx = m.get("index_state")
        if idx is None:
            continue
        idx["entries"] = {
            _maybe_replace(p, old, new): v for p, v in idx["entries"].items()
        }
        idx["dirs"] = {
            _maybe_replace(p, old, new): v for p, v in idx["dirs"].items()
        }

    return out


def _maybe_replace(path: str, old: str, new: str) -> str:
    if path == old or path.startswith(old + "/"):
        return new + path[len(old):]
    return path
```

`_maybe_replace` is the single place where path-rewrite logic lives.
It's intentionally strict: `/s33/x.txt` matches under `old=/s33`, but
`/s33b/x.txt` does **not** (the `+ "/"` boundary).

### Load-time use

In `Workspace.load(path, *, resources=None, prefix_map=None)`:

```python
state = pickle.load(open(path, "rb"))
if prefix_map:
    for old, new in prefix_map.items():
        state = _remap_prefix(state, old, new)
return cls._from_state_dict(state, resources=resources)
```

`prefix_map` is applied BEFORE resource override resolution, so the
`resources=` dict keys can use either old or new prefixes consistently
with what the user just renamed.

### Runtime use

```python
def rename_mount(self, old: str, new: str) -> None:
    if not self.job_table.is_idle():
        raise RuntimeError(
            "rename_mount: workspace has running jobs; wait or kill them first")
    state = self._to_state_dict()
    state = _remap_prefix(state, old, new)
    self._restore_from_state_dict(state)  # in-place restore
```

Hard precondition: no running jobs / drain tasks. Rename is a
disruptive operation; doing it mid-flight risks task-vs-state races.
We require the workspace to be idle.

______________________________________________________________________

## Caveats / open questions

1. **History remains pinned to old prefixes.** A user who replays old
   commands after rename will see "no such mount" errors. This is
   correct behavior — history is a record, not a forward pointer —
   but document it.

1. **Free-form env values ignored.** If an env var holds `/s33/...`,
   it stays. Same reasoning as history. User can `export` again.

1. **Resource index state.** Each resource has its own `_index` cache
   keyed by virtual path. The index dict needs to be in
   `resource.get_state()` so the remap pass can rewrite it. Audit
   resource implementations for this.

1. **Conflict detection.** If `prefix_map={"/s33": "/s3"}` but `/s3`
   is already mounted in the snapshot, the remap creates a collision.
   Reject with a clear error before doing the rewrite.

1. **Trailing slash normalization.** `_normalize` strips trailing
   slash so `"/s3/"` and `"/s3"` mean the same thing. Without this,
   half the paths fail to match.

1. **Multiple remaps in one call.** `prefix_map={"/a": "/b", "/b": "/a"}`
   is a swap. Doing them sequentially with the same function gives the
   wrong result (the second remap acts on already-renamed paths). Two
   options: (a) reject overlapping remaps, (b) use temporary
   placeholder prefixes during the rewrite. (a) is simpler — reject.

1. **Cache backing when redis-backed.** `RedisFileCacheStore` writes
   keys to a real Redis with `key_prefix`. Renaming the mount prefix
   doesn't change the Redis key prefix. Either rename invalidates
   cache (simplest), or we issue Redis SCAN+RENAME (more code, more
   risk). Default: invalidate cache for the renamed mount.

______________________________________________________________________

## Tests

1. **Load with prefix change updates cache keys.** Save with `/s33`,
   load with `prefix_map={"/s33": "/s3"}`, verify `cat /s3/x.txt` is
   a cache hit (not a refetch).

1. **Dirty tracker remapped.** Mark inode dirty, save, load with
   remap, verify dirty tracker entry is now keyed `/s3/...`.

1. **Session cwd remapped.** `cd /s33/data`, save, load with remap,
   verify `pwd` returns `/s3/data`.

1. **History command unchanged.** `cat /s33/x`, save, load with
   remap, verify history still says `cat /s33/x` (not rewritten).

1. **Substring boundary respected.** Save with `/s3` and `/s3-staging`
   both mounted, load with `prefix_map={"/s3": "/prod"}`, verify
   `/s3-staging` paths are NOT rewritten.

1. **Conflict rejected.** `prefix_map={"/a": "/b"}` when `/b` already
   mounted → clear error before any rewrite happens.

1. **Overlapping remap rejected.** `prefix_map={"/a": "/b", "/b": "/a"}`
   → error.

1. **`rename_mount` works at runtime on idle workspace.** Same as
   load-time test but via the runtime API.

1. **`rename_mount` rejects when jobs running.** Background a job,
   try to rename, expect clear error.

______________________________________________________________________

## Estimate

- Phase 2 (this plan): ~250 LOC implementation, ~250 LOC tests.
  ~half a day.

Independent of save/load Phase 1; can be sequenced after.

______________________________________________________________________

## Out of scope

- **Free-form text rewrites** (history, env, stdout). Documented as
  unchanged.
- **Cross-resource remaps** (e.g., `prefix_map={"/s3": "/disk"}`).
  Doesn't make sense — the resource is what owns the data.
- **Renaming a single file across mounts**. That's a `mv`, not a
  remap.
- **Renaming non-existent prefix**. Reject with clear error.
