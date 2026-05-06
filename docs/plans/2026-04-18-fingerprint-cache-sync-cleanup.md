# Fingerprint Cache + Sync Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the dead `DirtyTracker` + `SyncPolicy` staging machinery, and wire up fingerprint-based cache freshness for backends that have cheap fingerprints (S3, GCS, R2, Disk, GitHub, SSH). Backends without cheap fingerprints (Slack, Discord, Notion, Linear, Telegram, Gmail, Google Drive, Google Sheets/Docs/Slides, Trello, MongoDB, Email) keep LAZY-only semantics.

**Architecture:**

- File cache already stores `fingerprint` strings on entries and exposes `is_fresh(key, remote_fp)`. Neither is called today — `Workspace.dispatch` and the read path ignore freshness.
- Writes already go through the ops layer directly to the backend (eager write-through). `DirtyTracker.on_read/on_write` are never called and `sync()` is always a no-op.
- **Fix:** (a) delete the staging scaffolding; (b) add a unified `FileStat.fingerprint` field populated by backends that support cheap fingerprint retrieval; (c) change the cache-read path so that on `ConsistencyPolicy.ALWAYS` it calls the backend's `stat` (cheap HEAD/stat/API) and compares with the cached fingerprint, serving the cache only if fresh.
- `ConsistencyPolicy.LAZY` (default) keeps current behavior: serve cached bytes without any network round-trip.
- Backends that return `fingerprint=None` (Slack, Discord, etc.) fall back to LAZY regardless of the policy setting.

**Tech Stack:** Python 3.12, pytest, `uv`, pydantic v2, asyncio.

______________________________________________________________________

## Context Reference

**Current write-through flow (do not break):**

- Shell redirect `>` → `handle_redirect` ([mirage/workspace/executor/redirect.py:127](mirage/workspace/executor/redirect.py#L127)) → `Workspace.dispatch("write", …)` → `mount.execute_op("write", …)` → backend's `write` op (eager `PutObject`/filesystem write).
- After Bug 1's fix, `Workspace.dispatch` invalidates file cache for write ops.

**Dead code to remove:**

- `DirtyTracker` class — [mirage/workspace/tracker.py](mirage/workspace/tracker.py) (entire file).
- `SyncPolicy` enum — [mirage/workspace/types.py:10-13](mirage/workspace/types.py#L10-L13).
- `SyncResult` model — [mirage/workspace/types.py:26-35](mirage/workspace/types.py#L26-L35).
- `Inode` model — [mirage/workspace/types.py:17-23](mirage/workspace/types.py#L17-L23) (only used by DirtyTracker).
- `Workspace._tracker` — [mirage/workspace/workspace.py:92](mirage/workspace/workspace.py#L92).
- `Workspace._sync_policy`, `_close_sync_part` staging branch, `sync()`, `atexit.register` — [mirage/workspace/workspace.py](mirage/workspace/workspace.py) (sections at lines 62, 93-94, 102-103, 208-220, 344-359).
- `_coerce_sync_policy` in [mirage/config.py:23-28](mirage/config.py#L23-L28), `sync_policy` field at [mirage/config.py:142](mirage/config.py#L142), snapshot config/state references.
- All remaining `SyncResult` imports in snapshot code.

**Fingerprint sources per backend:**

| Backend                                                                                      | Existing fingerprint | Where in `stat()`                                                            | Cost                       |
| -------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------- | -------------------------- |
| S3                                                                                           | `ETag` from `HEAD`   | `extra["etag"]` ([core/s3/stat.py:75](mirage/core/s3/stat.py#L75))           | 1 HEAD (~10 ms)            |
| GCS                                                                                          | `ETag`               | returns similar `extra["etag"]` (verify during task)                         | 1 HEAD                     |
| R2                                                                                           | `ETag`               | S3-compatible path                                                           | 1 HEAD                     |
| GitHub                                                                                       | blob SHA             | `extra["sha"]` ([core/github/stat.py:29](mirage/core/github/stat.py#L29))    | 1 API (often index-cached) |
| Disk                                                                                         | `mtime`              | `modified` ISO string ([core/disk/stat.py:35](mirage/core/disk/stat.py#L35)) | 1 stat syscall             |
| SSH                                                                                          | `mtime`              | similar to disk (verify)                                                     | 1 SFTP stat                |
| RAM                                                                                          | N/A (in-process)     | no fingerprint needed — single source of truth                               | —                          |
| Redis                                                                                        | N/A                  | keyed store, freshness from server                                           | —                          |
| Slack/Discord/Notion/Linear/Telegram/Gmail/GDrive/Gsheets/Gdocs/Gslides/Trello/MongoDB/Email | none cheap           | —                                                                            | —                          |

The plan uses a single string field `FileStat.fingerprint` that each backend's `stat` populates (or leaves `None`). The cache compares string-to-string, agnostic to whether it's an ETag, mtime ISO, or blob SHA.

______________________________________________________________________

## Phase 1 — Remove Dead Sync/Dirty Code

Independent of fingerprint work. Safe to ship on its own. No behavior change (everything was already dead).

### Task 1.1: Verify no production code reads `_tracker` outside `Workspace`

**Files:**

- Read only: `mirage/`

**Step 1: Grep**

```bash
rg "_tracker|DirtyTracker|SyncResult|SyncPolicy|sync_policy" mirage/ --type py
```

**Step 2: Confirm output**

Expected: matches only in `workspace/workspace.py`, `workspace/types.py`, `workspace/tracker.py`, `workspace/snapshot/state.py`, `workspace/snapshot/config.py`, `config.py`. No uses in `ops/`, `commands/`, `resource/`, `shell/`, `fuse/`, `core/`.

**Step 3: Commit (nothing to commit; this is a gate)**

If there are hits outside the expected modules, stop and update this plan before proceeding.

______________________________________________________________________

### Task 1.2: Delete `DirtyTracker` and `Inode`

**Files:**

- Delete: `mirage/workspace/tracker.py`
- Modify: `mirage/workspace/types.py` (remove `Inode`, `SyncResult`, `SyncPolicy`; keep `ExecutionNode`, `ExecutionRecord`)
- Modify: `mirage/workspace/workspace.py` (drop `_tracker`, `_sync_policy`, `_close_sync_part` staging branch, `sync()`, `atexit.register`, `from .tracker import DirtyTracker`, `from .types import SyncPolicy, SyncResult`)
- Test: existing tests at `tests/workspace/` must still pass

**Step 1: Write the failing test that protects the cleanup**

```python
# tests/workspace/test_no_sync_scaffolding.py
def test_workspace_has_no_sync_attribute():
    from mirage.workspace import Workspace
    assert not hasattr(Workspace, "sync"), (
        "Workspace.sync() was a no-op (DirtyTracker always empty); "
        "should be removed in Phase 1 cleanup.")


def test_sync_policy_enum_removed():
    import mirage.workspace.types as t
    assert not hasattr(t, "SyncPolicy"), "SyncPolicy removed in Phase 1."
    assert not hasattr(t, "SyncResult"), "SyncResult removed in Phase 1."
    assert not hasattr(t, "Inode"), "Inode removed in Phase 1."


def test_dirty_tracker_module_removed():
    import importlib
    try:
        importlib.import_module("mirage.workspace.tracker")
    except ModuleNotFoundError:
        return
    raise AssertionError("mirage.workspace.tracker should be deleted.")
```

**Step 2: Run it to confirm failure**

```bash
uv run pytest tests/workspace/test_no_sync_scaffolding.py -v
```

Expected: 3 failures (attributes still exist).

**Step 3: Delete `tracker.py`**

```bash
rm mirage/workspace/tracker.py
```

**Step 4: Remove from `types.py`**

In `mirage/workspace/types.py`, delete the `Inode` class (lines ~17-23), `SyncResult` class (lines ~26-35), and `SyncPolicy` enum (lines ~10-13). Keep `ExecutionNode` and `ExecutionRecord`.

**Step 5: Remove from `workspace.py`**

In `mirage/workspace/workspace.py`:

1. Remove the import: `from mirage.workspace.tracker import DirtyTracker` (line 43).
1. In the import at line 44-45, remove `SyncPolicy, SyncResult` (keep `ExecutionNode, ExecutionRecord`).
1. Remove `import atexit` (line 2) — no longer needed.
1. In `__init__` signature (line ~62), remove `sync_policy: SyncPolicy = SyncPolicy.STAGED,`.
1. In `__init__` body, delete:
   - `self._tracker = DirtyTracker()` (line ~92)
   - `self._sync_policy = (SyncPolicy.NONE if mode == MountMode.READ else sync_policy)` (lines ~93-94)
   - `if self._sync_policy == SyncPolicy.STAGED: atexit.register(self._close_sync_part)` (lines ~102-103)
1. In `_close_sync_part`, delete the staging branch `if self._sync_policy == SyncPolicy.STAGED: return self.sync()` and change return type to `None`. Keep fuse close and cache drain cancellation. Rename to `_close_parts` since there's no sync anymore.
1. In `close`, remove the `results` return value — just `await self._cache.clear()`; return `None`.
1. Delete the entire `sync(self, path=None)` method (lines ~344-359).
1. In `_from_state` (around line 288), remove `sync_policy=args.sync_policy,` from the constructor call.

**Step 6: Run the cleanup tests**

```bash
uv run pytest tests/workspace/test_no_sync_scaffolding.py -v
```

Expected: 3 pass.

**Step 7: Run the full workspace suite to catch regressions**

```bash
uv run pytest tests/workspace/ tests/shell/ tests/commands/ tests/integration/ -q
```

Expected: all pass. If any test references `ws.sync()`, `SyncResult`, `SyncPolicy`, or `sync_policy=`, remove that usage (tests were passing `SyncPolicy.NONE` after Bug 2 cleanup — that kwarg now needs deleting too).

**Step 8: Remove `sync_policy` kwarg from all test files**

```bash
rg "sync_policy=SyncPolicy\.NONE" tests/ examples/ -l
```

For each file, remove the `sync_policy=SyncPolicy.NONE,` line and the `SyncPolicy` import if it becomes unused. Do not change anything else.

**Step 9: Re-run tests**

```bash
uv run pytest tests/workspace/ tests/shell/ tests/commands/ tests/integration/ -q
```

Expected: all pass.

**Step 10: Commit**

```bash
git add mirage/workspace/types.py mirage/workspace/workspace.py tests/workspace/test_no_sync_scaffolding.py tests/ examples/
git rm mirage/workspace/tracker.py
git commit -m "refactor: remove dead DirtyTracker and SyncPolicy staging code"
```

______________________________________________________________________

### Task 1.3: Remove `sync_policy` from config and snapshots

**Files:**

- Modify: `mirage/config.py` (drop `_coerce_sync_policy` function at lines 23-28, `sync_policy` field at line 142, `field_validator` at lines 157-160, any dict entries at line 183)
- Modify: `mirage/workspace/snapshot/config.py` (drop `sync_policy` field)
- Modify: `mirage/workspace/snapshot/state.py` (drop `StateKey.SYNC_POLICY` usage at lines 66 and 119; remove from `MountArgs` construction)
- Modify: `mirage/types.py` (drop `StateKey.SYNC_POLICY` enum value at line 154 if it exists)

**Step 1: Find all references**

```bash
rg "sync_policy|SYNC_POLICY" mirage/ --type py
```

**Step 2: Write a test that snapshots round-trip without sync_policy**

Locate an existing snapshot round-trip test (likely `tests/workspace/snapshot/` — verify). Add:

```python
def test_snapshot_round_trip_no_sync_policy(tmp_path):
    from mirage.resource.ram import RAMResource
    from mirage.workspace import Workspace
    ws = Workspace({"/data": RAMResource()})
    target = tmp_path / "snap.tar"
    ws.save(str(target))
    restored = Workspace.load(str(target))
    assert restored is not None
```

**Step 3: Run test to confirm it passes (no regression)**

```bash
uv run pytest tests/workspace/snapshot/ -v -k round_trip_no_sync
```

Expected: pass (snapshots already ignore the field after Task 1.2, but this locks it in).

**Step 4: Remove field from config and snapshot**

Edit the three files listed above. Remove every occurrence of `sync_policy` and `SYNC_POLICY`.

**Step 5: Re-run full suite**

```bash
uv run pytest -q
```

Expected: all pass.

**Step 6: Commit**

```bash
git add mirage/config.py mirage/workspace/snapshot/ mirage/types.py tests/workspace/snapshot/
git commit -m "refactor: drop sync_policy from config and snapshot schema"
```

______________________________________________________________________

## Phase 2 — End-to-End Spike (Disk + RAM)

**Purpose:** Prove the full fingerprint round-trip works against the two backends that are cheapest to exercise — disk (has a real mtime-based fingerprint) and RAM (no fingerprint, must fall back to LAZY cleanly). If this phase validates the design, Phase 3 rolls out the same pattern to S3, GitHub, SSH. If it reveals design flaws, we fix them here before fanning out.

**Deliverable at end of Phase 2:** A disk-backed workspace where `ConsistencyPolicy.ALWAYS` correctly re-fetches after external file mutation, and a RAM-backed workspace that silently falls back to LAZY (no pointless stat calls).

### Task 2.1: Add `fingerprint` field to `FileStat`

**Files:**

- Modify: `mirage/types.py:25-32` (add field)
- Test: `tests/test_types.py` (create if absent)

**Step 1: Write the failing test**

```python
# tests/test_types.py (add this test; create file if needed)
from mirage.types import FileStat, FileType


def test_file_stat_has_fingerprint_field():
    st = FileStat(name="x", type=FileType.FILE, fingerprint="abc123")
    assert st.fingerprint == "abc123"


def test_file_stat_fingerprint_defaults_none():
    st = FileStat(name="x", type=FileType.FILE)
    assert st.fingerprint is None
```

**Step 2: Run to confirm failure**

```bash
uv run pytest tests/test_types.py -v
```

Expected: FAIL (`fingerprint` not a FileStat field).

**Step 3: Add the field**

In `mirage/types.py`, in the `FileStat` class, add `fingerprint: str | None = None` after `modified`.

**Step 4: Run to confirm pass**

```bash
uv run pytest tests/test_types.py -v
```

Expected: pass.

**Step 5: Commit**

```bash
git add mirage/types.py tests/test_types.py
git commit -m "feat: add FileStat.fingerprint field"
```

______________________________________________________________________

### Task 2.2: Populate `fingerprint` in Disk `stat`

**Files:**

- Modify: `mirage/core/disk/stat.py`
- Test: `tests/core/disk/test_stat_fingerprint.py` (create)

**Step 1: Write the failing test**

```python
# tests/core/disk/test_stat_fingerprint.py
import asyncio

from mirage.accessor.disk import DiskAccessor
from mirage.core.disk.stat import stat
from mirage.types import PathSpec


def test_disk_stat_returns_fingerprint_from_mtime(tmp_path):
    p = tmp_path / "f.txt"
    p.write_bytes(b"hi")
    accessor = DiskAccessor(root=str(tmp_path))
    scope = PathSpec(original="/f.txt", directory="/")
    result = asyncio.run(stat(accessor, scope))
    assert result.fingerprint is not None
    # fingerprint == the modified ISO string
    assert result.fingerprint == result.modified
```

**Step 2: Run to confirm failure**

```bash
uv run pytest tests/core/disk/test_stat_fingerprint.py -v
```

Expected: FAIL.

**Step 3: Populate fingerprint**

In `mirage/core/disk/stat.py`, after computing `modified`, set `fingerprint=modified` on the returned `FileStat`. Apply to both the directory and file return paths (or only the file path — directories don't need fingerprint for cache freshness).

**Step 4: Run to confirm pass**

```bash
uv run pytest tests/core/disk/test_stat_fingerprint.py -v
```

Expected: pass.

**Step 5: Commit**

```bash
git add mirage/core/disk/stat.py tests/core/disk/test_stat_fingerprint.py
git commit -m "feat(disk): populate FileStat.fingerprint from mtime"
```

______________________________________________________________________

### Task 2.3: Wire `ConsistencyPolicy` into `Workspace.dispatch`

This is the core wiring. After this task, the design is either validated or broken — Task 2.4's integration test proves which.

**Scope:** file reads only. The fingerprint check applies when the **file cache** has a hit for the path. Directory listings go through the **index cache**, which already has its own TTL-based freshness system — they are not touched by this task.

**Files:**

- Modify: `mirage/workspace/workspace.py` — store `self._consistency` on the instance; update the read-op branch of `dispatch()` to call backend `stat` and compare against cached fingerprint when `consistency == ALWAYS`.

**Step 1: Verify `consistency` is accepted in `__init__`**

```bash
rg "consistency" mirage/workspace/workspace.py | head -20
```

Expected: `consistency: ConsistencyPolicy = ConsistencyPolicy.LAZY,` is in the signature (already there today).

**Step 2: Store it on the instance**

In `mirage/workspace/workspace.py`, inside `__init__`, add after the other instance-attribute assignments:

```python
self._consistency = consistency
```

**Step 3: Update `Workspace.dispatch` read branch**

Replace the current read-op branch (the `if op in _DISPATCH_READ_OPS:` block, added in Bug 1's fix) with:

```python
if op in _DISPATCH_READ_OPS:
    cached = await self._cache.get(path.original)
    if cached is not None:
        if self._consistency == ConsistencyPolicy.ALWAYS:
            try:
                stat = await mount.execute_op("stat", path.original)
            except FileNotFoundError:
                await self._cache.remove(path.original)
                raise
            if stat.fingerprint is not None:
                fresh = await self._cache.is_fresh(
                    path.original, stat.fingerprint)
                if not fresh:
                    await self._cache.remove(path.original)
                    cached = None
        if cached is not None:
            return cached, IOResult(reads={path.original: cached})
```

Ensure `ConsistencyPolicy` is imported at the top of the file (it already is via `mirage.types`).

**Step 4: Run existing workspace suite to confirm no regression**

```bash
uv run pytest tests/workspace/ -q
```

Expected: all pass. `LAZY` is default, `stat.fingerprint` is `None` for everything except disk at this point, so `ALWAYS` falls through to serving cached bytes.

**Step 5: Commit**

```bash
git commit -am "feat: wire ConsistencyPolicy.ALWAYS fingerprint check in Workspace.dispatch"
```

______________________________________________________________________

### Task 2.4: Spike integration test — Disk + RAM prove the design

**Purpose:** Prove end-to-end that `ALWAYS` refetches on a real fingerprint mismatch (Disk), and that backends without fingerprint (RAM) fall through to LAZY cleanly. If either case fails, Phase 3 does not start.

**Files:**

- Create: `tests/workspace/test_fingerprint_spike.py`

**Step 1: Write the spike integration test**

```python
# tests/workspace/test_fingerprint_spike.py
import asyncio
import time

from mirage.resource.disk import DiskResource
from mirage.resource.ram import RAMResource
from mirage.types import ConsistencyPolicy, MountMode, PathSpec
from mirage.workspace import Workspace


def test_disk_always_refetches_after_external_mutation(tmp_path):
    root = tmp_path / "disk"
    root.mkdir()
    (root / "file.txt").write_bytes(b"v1")

    resource = DiskResource(root=str(root))
    ws = Workspace(
        {"/data": (resource, MountMode.WRITE)},
        mode=MountMode.WRITE,
        consistency=ConsistencyPolicy.ALWAYS,
    )

    async def run() -> tuple[bytes, bytes]:
        io1 = await ws.execute("cat /data/file.txt")
        first = await io1.stdout_bytes()

        # Simulate an external writer mutating the file.
        # Sleep to guarantee mtime changes on low-resolution filesystems.
        time.sleep(1.1)
        (root / "file.txt").write_bytes(b"v2")

        io2 = await ws.execute("cat /data/file.txt")
        second = await io2.stdout_bytes()
        return first, second

    first, second = asyncio.run(run())
    assert first == b"v1", "first read should return original bytes"
    assert second == b"v2", (
        "ALWAYS consistency must refetch from disk after mtime changed; "
        "got stale cache instead")


def test_disk_lazy_keeps_stale_cache_after_external_mutation(tmp_path):
    root = tmp_path / "disk"
    root.mkdir()
    (root / "file.txt").write_bytes(b"v1")

    resource = DiskResource(root=str(root))
    ws = Workspace(
        {"/data": (resource, MountMode.WRITE)},
        mode=MountMode.WRITE,
        consistency=ConsistencyPolicy.LAZY,
    )

    async def run() -> tuple[bytes, bytes]:
        io1 = await ws.execute("cat /data/file.txt")
        first = await io1.stdout_bytes()
        time.sleep(1.1)
        (root / "file.txt").write_bytes(b"v2")
        io2 = await ws.execute("cat /data/file.txt")
        second = await io2.stdout_bytes()
        return first, second

    first, second = asyncio.run(run())
    assert first == b"v1"
    # LAZY may serve stale bytes — this documents the trade-off, not a bug.
    assert second in (b"v1", b"v2"), (
        "LAZY is allowed to serve cached bytes; just confirming we don't crash")


def test_ram_falls_back_to_lazy_when_fingerprint_absent():
    # RAM has no fingerprint. Under ALWAYS, the dispatch should see
    # stat.fingerprint is None and serve the cached bytes — no pointless
    # round-trip, no error.
    resource = RAMResource()
    resource._store.files["/file.txt"] = b"v1"
    ws = Workspace(
        {"/data": (resource, MountMode.WRITE)},
        mode=MountMode.WRITE,
        consistency=ConsistencyPolicy.ALWAYS,
    )

    async def run() -> bytes:
        io1 = await ws.execute("cat /data/file.txt")
        return await io1.stdout_bytes()

    data = asyncio.run(run())
    assert data == b"v1", (
        "RAM read under ALWAYS must succeed (no fingerprint → LAZY fallback)")
```

**Step 2: Run the spike**

```bash
uv run pytest tests/workspace/test_fingerprint_spike.py -v
```

Expected behavior by test:

- `test_disk_always_refetches_after_external_mutation` — **this is the success gate**. If it passes, the design works end-to-end. If it fails, stop and fix `Workspace.dispatch` / `is_fresh` / `core/disk/stat.py` before proceeding.
- `test_disk_lazy_keeps_stale_cache_after_external_mutation` — always passes (documents the LAZY trade-off).
- `test_ram_falls_back_to_lazy_when_fingerprint_absent` — proves RAM behavior is not broken by the ALWAYS path.

**Step 3: If spike passes, commit. If it fails, debug until it passes, then commit.**

```bash
git add tests/workspace/test_fingerprint_spike.py
git commit -m "test: spike — disk+RAM fingerprint round-trip proves design"
```

**Step 4: Gate**

If the spike passed, Phase 3 can start. If not, revise the design in Task 2.3 before moving on.

______________________________________________________________________

## Phase 3 — Rollout To Remaining Backends

With the spike validated, roll out fingerprint population to the rest of the fingerprint-capable backends (S3, GitHub, SSH, GDrive) and confirm the rest (Redis, Slack, Discord, Notion, Linear, Telegram, Gmail, etc.) fall through to LAZY behavior cleanly.

### Task 3.1: Populate `fingerprint` in S3 `stat`

**Files:**

- Modify: `mirage/core/s3/stat.py`
- Test: `tests/core/s3/test_stat_fingerprint.py` (create)

**Step 1: Write the failing test**

```python
# tests/core/s3/test_stat_fingerprint.py
import asyncio
from contextlib import ExitStack

from mirage.accessor.s3 import S3Accessor
from mirage.core.s3.stat import stat
from mirage.resource.s3 import S3Config
from mirage.types import PathSpec
from tests.integration.s3_mock import patch_s3_multi


def test_s3_stat_returns_fingerprint_from_etag():
    store = {"foo.txt": b"hello"}
    stack = ExitStack()
    stack.enter_context(patch_s3_multi({"test-bucket": store}))
    try:
        config = S3Config(
            bucket="test-bucket",
            region="us-east-1",
            aws_access_key_id="fake",
            aws_secret_access_key="fake",
        )
        accessor = S3Accessor(config)
        scope = PathSpec(original="/foo.txt", directory="/")
        result = asyncio.run(stat(accessor, scope, index=None))
        assert result.fingerprint is not None
        assert result.fingerprint == result.extra.get("etag")
    finally:
        stack.close()
```

**Step 2: Run to confirm failure**

```bash
uv run pytest tests/core/s3/test_stat_fingerprint.py -v
```

**Step 3: Populate fingerprint in `core/s3/stat.py`**

In the `head_object` success path, set `fingerprint=resp.get("ETag", "").strip('"') or None` on the returned `FileStat`. In the index-cache fast path, leave `fingerprint=None` for now and add a comment `# TODO: propagate ETag into IndexCacheEntry so this fast path can carry fingerprint too.`

**Step 4: Commit**

```bash
git add mirage/core/s3/stat.py tests/core/s3/test_stat_fingerprint.py
git commit -m "feat(s3): populate FileStat.fingerprint from ETag"
```

Note: GCS and R2 reuse S3's op family — verify in Task 3.5's matrix.

______________________________________________________________________

### Task 3.2: Populate `fingerprint` in GitHub `stat`

**Files:**

- Modify: `mirage/core/github/stat.py`
- Test: `tests/core/github/test_stat_fingerprint.py` (create)

**Step 1: Write the failing test**

Seed a fake `IndexCacheStore` with an entry whose `id` is a blob SHA (e.g., `"a1b2c3d4"`) and call `stat`. Assert `result.fingerprint == "a1b2c3d4"`.

**Step 2: Add `fingerprint=result.entry.id` to the file return path in `github/stat.py`** (around line 25-30).

**Step 3: Commit**

```bash
git add mirage/core/github/stat.py tests/core/github/test_stat_fingerprint.py
git commit -m "feat(github): populate FileStat.fingerprint from blob SHA"
```

______________________________________________________________________

### Task 3.3: Populate `fingerprint` in SSH `stat`

**Files:**

- Modify: `mirage/core/ssh/stat.py`
- Test: `tests/core/ssh/test_stat_fingerprint.py` (only if SSH mocks exist; otherwise document as TODO and skip)

**Step 1: Verify SSH stat returns mtime today.** Open `mirage/core/ssh/stat.py` and confirm the pattern matches disk (SFTP stat returns mtime-like timestamp).

**Step 2: Populate `fingerprint=modified` same as disk.**

**Step 3: Commit**

```bash
git add mirage/core/ssh/stat.py
git commit -m "feat(ssh): populate FileStat.fingerprint from SFTP mtime"
```

______________________________________________________________________

### Task 3.4: Populate `fingerprint` in Google Drive `stat`

**Files:**

- Modify: `mirage/core/gdrive/stat.py`
- Test: `tests/core/gdrive/test_stat_fingerprint.py` (create; use the existing gdrive fake if one exists in `tests/integration/gdrive_mock.py`)

**Step 1: Verify what Drive returns.** Drive files have `modifiedTime` (ISO string) and often `md5Checksum` for non-Google-native files. Native Google Docs/Sheets/Slides lack a checksum but have `modifiedTime`. Choose precedence: `md5Checksum` first, then `modifiedTime`, then `None`.

**Step 2: Write the failing test**

```python
# tests/core/gdrive/test_stat_fingerprint.py
# Use tests/integration/gdrive_mock.FakeGDrive to seed a file with md5Checksum.
# Call stat, assert result.fingerprint == md5Checksum.
```

**Step 3: Populate in `mirage/core/gdrive/stat.py`** — `fingerprint=md5 or modified or None`.

**Step 4: Commit**

```bash
git add mirage/core/gdrive/stat.py tests/core/gdrive/test_stat_fingerprint.py
git commit -m "feat(gdrive): populate FileStat.fingerprint from md5Checksum/modifiedTime"
```

______________________________________________________________________

### Task 3.5: Cross-backend matrix verification

Confirm the full story works across representative backends: ram, disk, redis, s3, gdrive, slack, discord.

- **Fingerprint-capable** (stat returns non-None fingerprint): disk, s3, gdrive.
- **Fingerprint-absent** (stat returns fingerprint=None): ram, redis, slack, discord. For these, `ALWAYS` silently falls back to LAZY.

**Files:**

- Create: `tests/integration/test_fingerprint_matrix.py`

**Step 1: Write a parametrized test**

Use the existing integration conftest helpers (`make_s3_ws`, `make_memory_ws`, `make_disk_ws`, gdrive mock, redis URL, slack/discord mocks if present). Parametrize over backend kind:

```python
# tests/integration/test_fingerprint_matrix.py — sketch
import pytest


FINGERPRINT_CAPABLE = ["disk", "s3", "gdrive"]
FINGERPRINT_ABSENT = ["ram", "redis", "slack", "discord"]


@pytest.mark.parametrize("backend", FINGERPRINT_CAPABLE)
def test_always_refetches_on_external_mutation(backend):
    # Seed initial file, read via mirage (caches), mutate externally,
    # read again under ConsistencyPolicy.ALWAYS, assert fresh bytes.
    ...


@pytest.mark.parametrize("backend", FINGERPRINT_ABSENT)
def test_always_falls_back_to_lazy_without_fingerprint(backend):
    # Set up workspace with ALWAYS, read a cached path, confirm no error
    # and no pointless network call (spy on the stat op — it may still
    # be invoked, but must return fingerprint=None without raising).
    ...
```

For slack/discord, the "mutation" concept may not map cleanly — those backends expose messages, not files. For them, simply assert: cached reads under ALWAYS don't error, and stat calls return `fingerprint=None`. No correctness claim beyond "doesn't break."

For redis, the current RedisResource uses Redis as the storage backend; fingerprint-absent behavior mirrors RAM.

**Step 2: Skip backends that require network credentials.** Use `pytest.mark.skipif` for gdrive if credentials aren't set up locally; rely on CI env where they are.

**Step 3: Run the matrix**

```bash
uv run pytest tests/integration/test_fingerprint_matrix.py -v
```

Expected: every parametrized case passes or skips cleanly.

**Step 4: Commit**

```bash
git add tests/integration/test_fingerprint_matrix.py
git commit -m "test: cross-backend fingerprint/consistency matrix"
```

______________________________________________________________________

### Task 3.6: Wire fingerprint into the cache-set path (IOResult.fingerprints)

Right now Task 2.3 reads fingerprint from the cache during freshness check, but cache entries are still stored with `fingerprint=None` because nothing populates it on `cache.set`. Fix that.

**Files:**

- Modify: `mirage/io/__init__.py` (or wherever `IOResult` lives) — add `fingerprints: dict[str, str] = {}` field.
- Modify: `mirage/cache/file/io.py` — in `apply_io`, when setting cache, pull `fingerprint = io.fingerprints.get(path)` and pass to `cache.set`.
- Modify: read-side commands that opt a path into `IOResult.cache` — populate `IOResult.fingerprints[path]` from the `FileStat` they've already looked up. Start with `commands/builtin/*/cat.py` for disk and s3.

**Step 1: Add field to IOResult; run existing tests to ensure default empty dict doesn't break anything.**

**Step 2: Update `apply_io` to plumb fingerprint into `cache.set(..., fingerprint=...)`.**

**Step 3: Update one command (disk `cat`) to populate `fingerprints[path]`. Validate via a new test.**

**Step 4: Commit.**

**Step 5: Repeat step 3 for each remaining cache-opting command, one commit per command family.** This is mechanical once the pattern is proven for disk.

______________________________________________________________________

### Task 3.7: Update docs

**Files:**

- Modify: `docs/python/design/file_cache.mdx` — update "Freshness" section so it describes actual behavior.
- Modify: `docs/python/design/recall.mdx` — update the comparison table.

**Step 1: Revise the docs** to accurately state:

- File cache uses `FileStat.fingerprint` from the backend when `ConsistencyPolicy.ALWAYS` is set.
- Backends that provide it: S3/GCS/R2 (ETag), Disk (mtime), GitHub (blob SHA), SSH (mtime), GDrive (md5Checksum / modifiedTime).
- Backends without a cheap fingerprint (RAM, Redis, Slack, Discord, Notion, Linear, Telegram, Gmail, Google Docs/Sheets/Slides, Trello, MongoDB, Email) fall back to LAZY freshness regardless of policy — the cache serves whatever it has until a local write invalidates it.
- Default policy remains `LAZY`. Users opt into per-read fingerprint checks by passing `consistency=ConsistencyPolicy.ALWAYS` to `Workspace(...)`.

**Step 2: Commit**

```bash
git add docs/python/design/
git commit -m "docs: accurate fingerprint-capability table and ConsistencyPolicy behavior"
```

______________________________________________________________________

## Phase 4 — Final Verification

### Task 4.1: Multi-writer integration test (S3)

Two separate `Workspace` instances sharing the same mocked S3 bucket. Write through A, read through B under `ConsistencyPolicy.ALWAYS`, assert B sees A's new content. Do the same under `LAZY` and assert B may see the old content (documenting the trade-off, not a bug).

**Files:**

- Create: `tests/integration/test_fingerprint_multi_writer.py`

**Step 1: Write the integration test** — two workspaces, shared S3 mock.

**Step 2: Commit**

```bash
git add tests/integration/test_fingerprint_multi_writer.py
git commit -m "test: multi-writer cache consistency under ALWAYS vs LAZY"
```

______________________________________________________________________

### Task 4.2: Run pre-commit and full suite

**Step 1:**

```bash
pre-commit run --all-files
```

Fix any formatting/linting.

**Step 2:**

```bash
uv run pytest -q
```

Expected: all pass, no new skips.

**Step 3: Verify imports clean**

```bash
uv run python -c "
import mirage
import mirage.workspace
import mirage.workspace.workspace
import mirage.cache.file
import mirage.config
"
```

Expected: no ImportError, no complaints.

**Step 4: Smoke test the S3 repro from the bug investigation**

```bash
uv run python /tmp/mirage_s3_writeback_test.py
```

Expected: all three scenarios (A/B/C) still show correct bytes on S3.

______________________________________________________________________

## Out Of Scope (Future Work)

- Adding fingerprint to `IndexCacheEntry` for S3 so the `stat` fast-path can return a fingerprint too (currently falls back to `None` on index-cache hits). This is a real follow-up but not required for correctness.
- Verifying GCS/R2 — they reuse S3's op family and should get fingerprint support transparently, but each needs its own integration test.
- Adding optional TTL on file cache entries for remote backends as a *cheaper* alternative to fingerprint checks, for users who prefer bounded staleness without the extra HEAD round-trip.
- Extending the matrix to GitHub / SSH / Notion / Linear / Gmail once basic fingerprint or no-fingerprint behavior is confirmed.

______________________________________________________________________

## Testing Strategy Summary

**Spike (Phase 2.4):** Disk (real mtime fingerprint) + RAM (no fingerprint, LAZY fallback). This is the gate — design is either validated here or revised before rollout.

**Per-backend unit tests (Phase 3.1-3.4):** one test per backend's `stat` confirms fingerprint is populated (or confirmed None for non-capable backends).

**Cross-backend matrix (Phase 3.5):** parametrized over `ram`, `disk`, `redis`, `s3`, `gdrive`, `slack`, `discord`:

- Fingerprint-capable (disk, s3, gdrive) — ALWAYS refetches after external mutation.
- Fingerprint-absent (ram, redis, slack, discord) — ALWAYS falls back to LAZY without errors.

**Multi-writer integration (Phase 4.1):** two workspaces against the same mocked S3 bucket validate cache-coherency story under ALWAYS vs LAZY.

**Regression:** `tests/workspace/`, `tests/shell/`, `tests/commands/`, `tests/integration/` all green before each commit.

## Commit Granularity

- One commit per task (1.2, 1.3, 2.1, 2.2, ...) — each a self-contained, reviewable unit.
- **Phase 1** (cleanup) merges before Phase 2 starts — it has no behavior change and unblocks review.
- **Phase 2** (spike) lands as 4 commits and ends with a **gate**. Do not start Phase 3 until Task 2.4 passes.
- **Phase 3** (rollout) commits incrementally, one backend per task. The matrix test (3.5) lands after all stat-population tasks. The IOResult.fingerprints wiring (3.6) lands per command family.
- **Phase 4** (verification) is 2 commits: multi-writer test, then pre-commit + full suite.
