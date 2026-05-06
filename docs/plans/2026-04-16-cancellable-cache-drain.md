# Phase 2b — Cancellable Cache Drain (Opt-In)

**Context:** When `cat /gcs/big.jsonl | head -n 1` runs over a cacheable
file, the pipe finishes after one line — but a background task keeps
downloading the rest of the file to populate the cache. For a 10 GB
file the user only wanted to peek at, that's 10 GB of wasted bandwidth.

**Goal:** add an opt-in policy that cancels a background drain when it
clearly exceeds what the user asked for. Default behavior is unchanged
(always drain, cache stays useful).

______________________________________________________________________

## Current code

| File                                                                              | What it does                                                                                                                                                                         |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`cache/file/io.py:apply_io`](mirage/cache/file/io.py)                            | Wraps unconsumed streams in `CachableAsyncIterator`, spawns `_background_drain` task per cacheable path                                                                              |
| [`cache/file/io.py:_background_drain`](mirage/cache/file/io.py)                   | Calls `it.drain()` to drain the rest, writes to cache. Cancellable via `task.cancel()`; already triggered at workspace shutdown ([workspace.py:190](mirage/workspace/workspace.py)). |
| [`io/cachable_iterator.py:CachableAsyncIterator`](mirage/io/cachable_iterator.py) | Wraps an `AsyncIterator[bytes]`. Tracks `_buffer`, `_exhausted`, `drain_event`. Has `drain()` method.                                                                                |

Workspace shutdown already cancels all in-flight drains. **What's
missing:** a mid-flight cancel based on a budget (size or ratio).

______________________________________________________________________

## Design decisions

### 1. Threshold metric: bytes-drained, not file-size-ratio

**Why:** resources don't always know file size up front (HTTP chunked
transfer, dynamic queries). A simple "stop after N bytes if downstream
hasn't fully consumed" rule works without needing `stat`.

**Tunable:** `max_drain_bytes` (e.g. `100_000_000`). If the drain task
has already pulled this many bytes AND the stream isn't exhausted,
cancel.

### 2. Configuration home: `CacheConfig`

Already the natural place. Add one field:

```python
class CacheConfig(BaseModel):
    type: CacheType = CacheType.RAM
    limit: str | int = "512MB"
    max_drain_bytes: int | None = None   # ← new; None = always drain
```

### 3. Cancel point: inside `_background_drain`, between chunks

Don't pre-decide based on stat. Let the drain start, and stop it when
it crosses the budget. Why:

- No stat call needed
- Naturally handles "small file → fully drains" without policy
- Naturally handles "huge file → drains up to budget then stops"

### 4. Behavior on cancel: discard the partial buffer, don't half-cache

If we drained partway and then cancelled, **don't** write the partial
data to cache (that would corrupt future reads). Just log and exit.

### 5. Default: None (current behavior)

Opt-in only. Existing users see no change.

______________________________________________________________________

## File-by-file changes

### `mirage/cache/file/config.py`

```python
class CacheConfig(BaseModel):
    type: CacheType = CacheType.RAM
    limit: str | int = "512MB"
    max_drain_bytes: int | None = None
```

### `mirage/io/cachable_iterator.py`

Already tracks `_buffer`. Add a tiny helper:

```python
@property
def consumed_bytes(self) -> int:
    return sum(len(c) for c in self._buffer)
```

(Or maintain a running counter incremented in `__anext__` and `drain`
to avoid re-summing on every check.)

### `mirage/cache/file/io.py`

Pass the threshold through to `_background_drain`:

```python
async def apply_io(cache, io):
    ...
    elif isinstance(data, CachableAsyncIterator):
        if data.exhausted:
            await cache.set(path, b"".join(data._buffer))
        else:
            ...
            max_bytes = getattr(cache, "max_drain_bytes", None)
            task = asyncio.create_task(
                _background_drain(cache, path, data, max_bytes))
            ...

async def _background_drain(cache, path, it, max_bytes=None):
    """Drain unconsumed stream into cache.

    If max_bytes is set and the drain exceeds it without exhausting
    the source, cancel and skip caching for this read.
    """
    try:
        if max_bytes is None:
            materialized = await it.drain()
            await cache.add(path, materialized)
            return
        chunks = list(it._buffer)
        async for chunk in it._source:
            chunks.append(chunk)
            it._buffer.append(chunk)
            total = sum(len(c) for c in chunks)
            if total > max_bytes:
                logger.info(
                    "cache drain budget exceeded for %s "
                    "(%d > %d), skipping cache fill",
                    path, total, max_bytes)
                it._exhausted = True
                it.drain_event.set()
                return
        it._exhausted = True
        it.drain_event.set()
        await cache.add(path, b"".join(chunks))
    except asyncio.CancelledError:
        logger.warning("background drain cancelled for %s", path)
    except Exception:
        logger.warning("background drain failed for %s", path,
                       exc_info=True)
```

### `mirage/cache/file/ram.py` and `mirage/cache/file/redis.py`

Both already have `_drain_tasks: dict[str, asyncio.Task]`. Add a
public field:

```python
self.max_drain_bytes: int | None = None
```

Set in `__init__` from the config.

### `mirage/workspace/workspace.py`

In `__init__`, after building the cache store, propagate the field:

```python
if cache and cache.max_drain_bytes is not None:
    self._cache.max_drain_bytes = cache.max_drain_bytes
```

(Or, cleaner: pass it into the cache store's constructor.)

______________________________________________________________________

## Tests

New file: `tests/cache/test_cache_drain_threshold.py`

| Test                                                | What it checks                                                                                        |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `test_drain_runs_to_completion_when_threshold_none` | Default behavior unchanged: full drain into cache                                                     |
| `test_drain_cancelled_above_threshold`              | Set `max_drain_bytes=100`, source has 1000 bytes consumed-by-downstream=10 → drain stops, cache empty |
| `test_partial_drain_below_threshold_caches`         | Threshold=100, source=80 bytes → drain completes, cache populated                                     |
| `test_drain_cancel_logged`                          | After threshold-cancel, an INFO log appears                                                           |
| `test_workspace_propagates_threshold`               | `Workspace(..., cache=CacheConfig(max_drain_bytes=N))` sets the field on `_cache`                     |

Each test uses an in-memory async iterator producing controllable byte
counts. No real resource needed.

______________________________________________________________________

## Examples (verification)

Add a small section to [`examples/gcs/gcs.py`](examples/gcs/gcs.py):

```python
print("\n=== drain threshold demo ===")
ws_capped = Workspace(
    {"/gcs": GCSResource(config)},
    mode=MountMode.READ,
    cache=CacheConfig(max_drain_bytes=10_000),  # 10 KB
)
r = await ws_capped.execute(
    "cat /gcs/data/example.jsonl | head -n 1")
# After this returns, the background drain should have aborted
# at ~10 KB instead of pulling the entire 10 MB file.
print(f"  exit={r.exit_code}")
print("  (check logs: 'cache drain budget exceeded')")
await ws_capped.close()
```

This is a soft demonstration — the bandwidth saving isn't directly
visible, but the log line + `ops_summary()` byte count shows the
truncated download.

______________________________________________________________________

## Risk + rollback

**Risk:** low.

- Behavior change is opt-in; default = None preserves current behavior
- Existing `_background_drain` tests still pass (max_bytes=None branch
  takes the same code path)
- Cancel-by-budget is simpler than cancel-by-stat (no race against
  upstream stat calls)

**Rollback:** revert one PR. No schema changes, no migration.

______________________________________________________________________

## What we are NOT doing

- ❌ Cancel-by-time (e.g. "drain for max 5 sec") — overlapping concept
  but harder to reason about. Bytes is more predictable.
- ❌ Auto-detect "user wanted just one line" by inspecting downstream
  command. Too magical.
- ❌ Per-path overrides (e.g. always cache `*.json` regardless).
  Defer until needed.
- ❌ A `cache.drain_priority` knob (e.g. defer-vs-cancel). YAGNI.

______________________________________________________________________

## Estimate

| Change                                         | Effort    |
| ---------------------------------------------- | --------- |
| Config field + propagation                     | 30 min    |
| `_background_drain` rewrite (with budget loop) | 45 min    |
| `consumed_bytes` accessor                      | 15 min    |
| 5 unit tests                                   | 1 hr      |
| Example demo                                   | 30 min    |
| Lint + verify full sweep                       | 15 min    |
| **Total**                                      | **~3 hr** |

Single focused session. Ship as one PR.

______________________________________________________________________

## Out-of-scope follow-ups

These would extend the design but aren't required for the basic feature:

1. **Per-mount drain budget** — `Mount(..., cache_drain_bytes=...)`
   override. Useful when one resource is faster/cheaper than another.
1. **Drain priority** — defer (let it run when idle) vs. cancel
   (stop now). Single budget knob is enough for v1.
1. **Stat-aware policy** — if file-size known upfront and exceeds
   threshold, skip drain immediately without spawning the task.
   Optimization, not correctness.
