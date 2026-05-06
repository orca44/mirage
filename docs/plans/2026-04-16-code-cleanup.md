# Code Cleanup — Helper Deduplication

**Context:** Across `commands/builtin/<resource>/*.py` and several other
spots, the same tiny helper functions have been copy-pasted dozens of
times. Pre-commit autoflake doesn't catch this because none of the copies
are unused — each file has its own private definition that's used locally.

This plan dedupes the long tail of duplicated helpers without changing
resource-specific behavior or APIs.

______________________________________________________________________

## Inventory (current state)

| Helper                                               | Copies                         | Bytes / copy | Total LOC removed if dedup'd |
| ---------------------------------------------------- | ------------------------------ | ------------ | ---------------------------- |
| `_yield_bytes(data) → AsyncIterator[bytes]`          | **~67**                        | 2            | ~134                         |
| `_wrap_readdir(accessor, path, index, prefix)`       | **~29**                        | 5            | ~145                         |
| `_wrap_stat(accessor, path, index, prefix)`          | **~29**                        | 5            | ~145                         |
| `_read_bytes(accessor, path, index, prefix)`         | **~19**                        | 4            | ~76                          |
| Email-specific: `_extract_folder`, `_build_vfs_path` | 2-3 each                       | 4-7          | ~20                          |
| **Total**                                            | **~150 duplicate definitions** |              | **~520 LOC**                 |

All are mechanical copies of the same body. None has resource-specific
logic — they exist only because each resource command file evolved
independently.

______________________________________________________________________

## Why dedup matters (and why it didn't get done before)

**Why it matters:**

- Future bugs in any helper (e.g. the mistake we found in `\$` escape
  handling) require fixing N copies if duplicated → easy to miss.
- New resource files copy from existing ones → duplication compounds.
- Reading any resource command file, ~30% of the lines are boilerplate
  helpers. Hides the actual command logic.

**Why it didn't get fixed organically:**

- Each helper is small (2-5 lines). Looks "not worth it" individually.
- They're truly private (`_` prefix). Refactor blast radius is large.
- Pre-commit can't catch — every copy IS used in its own file.

______________________________________________________________________

## Goal

One canonical implementation of each helper in a shared location, with
all current callers updated to import it. Zero behavior change.

______________________________________________________________________

## Phase 1 — `_yield_bytes` consolidation (lowest risk)

**Why first:** trivial helper, exact same body in every copy, no
parameters that vary, easy mechanical fix.

**Action:**

1. Promote `mirage/io/stream.py:async_chain` as the canonical
   "wrap bytes as async iterator" tool. (It already does this when called
   with a single bytes arg.)
1. For each of ~67 files:
   - Delete the local `async def _yield_bytes(...)` definition
   - Replace each `_yield_bytes(data)` call with `async_chain(data)`
   - Add `from mirage.io.stream import async_chain` import (most files
     already have other `mirage.io.stream` imports)

**Variant:** if `async_chain` semantics differ in edge cases (it skips
empty bytes; `_yield_bytes` doesn't), introduce a tiny new helper:

```python
# mirage/io/stream.py
async def yield_bytes(data: bytes) -> AsyncIterator[bytes]:
    """Wrap a single bytes blob as an AsyncIterator[bytes]."""
    yield data
```

Decision criterion: if any of the 67 callers depend on yielding empty
bytes, use the named helper; otherwise reuse `async_chain`.

**Effort:** mechanical, ~1 hour. Verify with full test suite after each
resource's files are touched.

**Risk:** low — body is identical. Only worry is import cycles if
`mirage.io.stream` ends up importing back into resources. (It doesn't
today.)

______________________________________________________________________

## Phase 2 — `_wrap_readdir` / `_wrap_stat` consolidation

**Why second:** more callers (~29 each), shared body across resources,
but the function does pull `accessor`-specific `_readdir` / `_stat` —
needs slightly more care.

**Pattern in current copies:**

```python
async def _wrap_readdir(accessor, path, index=None, prefix=""):
    spec = (path if isinstance(path, PathSpec) else PathSpec(
        original=path, directory=path, prefix=prefix))
    return await _readdir(accessor, spec, index)
```

The variable parts are: which `_readdir` to call. So the dedup needs to
take the readdir function as an argument (or use functools.partial at
the call site).

**Action — proposal A (helper takes the fn):**

```python
# mirage/commands/builtin/utils/wrap.py  (new)
from typing import Callable
from mirage.types import PathSpec

async def wrap_readdir(readdir_fn: Callable, accessor, path, index=None,
                      prefix=""):
    spec = path if isinstance(path, PathSpec) else PathSpec(
        original=path, directory=path, prefix=prefix)
    return await readdir_fn(accessor, spec, index)
```

Then each resource's grep does:

```python
from mirage.core.discord.readdir import readdir as _readdir
from mirage.commands.builtin.utils.wrap import wrap_readdir
...
rd = partial(wrap_readdir, _readdir, accessor, index=index, prefix=...)
```

**Action — proposal B (a single utility that takes the path-spec'ifying
shape):** if all the variation is just "path → PathSpec," extract just
that into `to_pathspec(path, prefix)` and let each grep file do its own
`await _readdir(accessor, to_pathspec(path, prefix), index)` inline.
This actually removes the helper entirely — every site becomes one line.

**Recommendation:** **Proposal B**. Cleaner. The wrapper exists only to
do the `isinstance(path, PathSpec) else PathSpec(...)` dance — that's
small enough to inline once you have a `to_pathspec` utility.

**Effort:** ~1.5 hours (29 files for each of readdir + stat).

**Risk:** low-medium. The helpers are short but each call site needs
verification that the inlined version matches.

______________________________________________________________________

## Phase 3 — `_read_bytes` consolidation

Same shape as Phase 2 but ~19 copies. Each resource's `_read_bytes` calls
its own `<resource>_read` function.

**Action:** proposal B again — extract `to_pathspec(path, prefix)` (if
not already done in Phase 2), then inline.

**Effort:** ~1 hour.

______________________________________________________________________

## Phase 4 — Email-specific helpers

`_extract_folder`, `_build_vfs_path` exist in:

- `commands/builtin/email/rg.py`
- `commands/builtin/email/find.py`
- `core/email/search.py` (already has `_build_vfs_path` after our
  earlier refactor)

**Action:** consolidate `_extract_folder` into `core/email/scope.py`
(it's a scope-detection helper). Make `_build_vfs_path` in
`core/email/search.py` the single canonical implementation; both rg.py
and find.py import from there.

**Effort:** ~30 min.

**Risk:** low — already did most of this work in earlier session.

______________________________________________________________________

## Test strategy

1. **After each phase:** run scoped tests for affected resources.
1. **After all 4 phases:** run `tests/workspace + tests/integration + tests/shell + tests/io + tests/commands` (the full sweep — ~1300+
   tests covering pipes/commands).
1. **Spot-check examples:** run `examples/python/example.py`,
   `examples/gcs/gcs.py` since they exercise broad command surface.

If any resource has live integration tests against real APIs (Slack,
Gmail, Notion, GCS), run those too. Otherwise unit + integration is
enough — no behavior change is expected.

______________________________________________________________________

## What we are NOT doing

- ❌ **Renaming command function names** (`grep`, `cat`, etc. stay as-is)
- ❌ **Changing resource APIs** (no new methods on accessors / resources)
- ❌ **Touching `_read_stdin_async`** in `commands/builtin/utils/stream.py`
  — used widely, has slightly more logic, leave alone
- ❌ **Mass-renaming `_yield_bytes` → `yield_bytes`** at every callsite
  in one PR; do it per-phase so blast radius is bounded
- ❌ **Auto-formatting unrelated code** that pre-commit happens to touch

______________________________________________________________________

## Suggested sequencing & PRs

| PR  | Scope                                                 | Files | Risk       |
| --- | ----------------------------------------------------- | ----- | ---------- |
| 1   | `_yield_bytes` → `async_chain` (or new `yield_bytes`) | ~67   | low        |
| 2   | Add `to_pathspec` util, inline `_wrap_readdir`        | ~29   | low-medium |
| 3   | Inline `_wrap_stat`                                   | ~29   | low-medium |
| 4   | Inline `_read_bytes`                                  | ~19   | low        |
| 5   | Email-specific consolidation                          | ~3    | low        |

Each PR independently testable. PRs 2-4 share the `to_pathspec` utility
introduced in PR 2.

______________________________________________________________________

## Out-of-band note

The mirage/io/stream.py module already exposes:

- `async_chain` (variadic byte-source chainer)
- `close_quietly` (best-effort aclose)
- `merge_stdout_stderr` (2>&1 pipe)
- `materialize` (drain to bytes)
- `drain` (drain without accumulating)
- `peek_exit_code`
- `exit_on_empty`, `quiet_match`

Adding a single `yield_bytes` (or just leveraging `async_chain` with one
arg) keeps the surface of this module small and coherent — it's the
canonical "byte-stream utilities" home.

______________________________________________________________________

## Estimate

- Total active work: **~4 hours** if done in one sitting.
- Total LOC removed: **~520** (mostly small functions and their imports).
- Files touched: **~145** (read-only check + 1-3 line edits each).
- Test runs: **~5** (one per phase + one final).

Low-risk, high-yield dedup work. Best done as a focused session, not
mixed with feature work.
