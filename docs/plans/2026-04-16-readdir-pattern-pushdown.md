# Readdir Pattern Pushdown Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Pass full PathSpec (with pattern) to readdir in all resources so each can optimize server-side filtering.

**Architecture:** Change `resolve_glob` in 11 resources from `readdir(accessor, p.dir, index)` to `readdir(accessor, p, index)`. The other 11 resources already pass `p` directly. Each resource's `readdir` can then use `path.pattern` for server-side filtering. Resources that don't benefit just ignore the pattern field.

**Tech Stack:** Python, async, fnmatch, resource-specific APIs (S3 list_objects_v2, SFTP, GraphQL, SQL)

______________________________________________________________________

## Current State

Two patterns exist in `resolve_glob`:

**Group A — passes `p.dir` (loses pattern):** S3, RAM, Disk, GitHub, Notion, Langfuse, MongoDB, Redis, SSH (9 resources)

**Group B — passes `p` (has pattern):** Discord, Slack, Gmail, Email, Linear, Trello, Telegram, GDrive, GDocs, GSheets, GSlides, GitHub CI, Paperclip (13 resources)

SCOPE_ERROR limits vary: S3/SSH=5000, RAM/Disk/Redis=50000, others=10000.

______________________________________________________________________

### Task 1: Update Group A resolve_glob to pass `p` instead of `p.dir`

**Files to modify:**

- `mirage/core/s3/glob.py`
- `mirage/core/ram/glob.py`
- `mirage/core/disk/glob.py`
- `mirage/core/github/glob.py`
- `mirage/core/notion/glob.py`
- `mirage/core/langfuse/glob.py`
- `mirage/core/mongodb/glob.py`
- `mirage/core/redis/glob.py`
- `mirage/core/ssh/glob.py`

**Change in each file:**

```python
# Before:
entries = await readdir(accessor, p.dir, index)

# After:
entries = await readdir(accessor, p, index)
```

Each resource's `readdir` already accepts `path: PathSpec`. When passed `p.dir`, the PathSpec has `pattern=None`. When passed `p`, the PathSpec has `pattern="*.txt"`. Since `readdir` currently ignores the pattern field, behavior is unchanged — the readdir still lists the directory contents from `path.directory`.

**Step 1:** Update all 9 files (one-line change each).

**Step 2:** Run `uv run pytest --no-cov` — expect all tests pass (no behavior change).

______________________________________________________________________

### Task 2: Update readdir in key resources to use pattern for filtering

Each resource's `readdir` can now see `path.pattern`. Add optional server-side filtering where it helps.

**Important:** `readdir` still returns ALL entries when `path.pattern` is None (normal directory listing). Pattern filtering is purely additive — skip entries that can't match.

#### Task 2a: S3 readdir — prefix extraction

**File:** `mirage/core/s3/readdir.py`

S3 `list_objects_v2` supports `Prefix`. Extract a literal prefix from the glob pattern:

- `data-*.csv` → prefix `data-`
- `*.txt` → no prefix (can't optimize)
- `2024-*` → prefix `2024-`

```python
def _glob_prefix(pattern: str | None) -> str:
    """Extract literal prefix before first glob character."""
    if not pattern:
        return ""
    for i, ch in enumerate(pattern):
        if ch in ("*", "?", "["):
            return pattern[:i]
    return pattern
```

In `readdir`, when pattern exists, combine directory prefix with glob prefix for a tighter `list_objects_v2` call. The fnmatch in `resolve_glob` still does final filtering.

#### Task 2b: SSH readdir — log warning on large directories

**File:** `mirage/core/ssh/readdir.py`

SFTP has no server-side filtering. But we can warn when results exceed a threshold:

```python
if path.pattern and len(entries) > SCOPE_ERROR:
    logger.warning("ssh readdir: %s returned %d entries", path.directory, len(entries))
```

#### Task 2c: Paperclip readdir — SQL WHERE clause

**File:** `mirage/core/paperclip/readdir.py`

At the month level where SQL queries papers, add pattern to the WHERE clause if available.

#### Task 2d: Linear readdir — GraphQL filter

**File:** `mirage/core/linear/readdir.py`

When listing issues and pattern is set, add filter to the GraphQL query.

**Step 1:** Implement 2a (S3 prefix extraction).

**Step 2:** Run S3 tests: `uv run pytest tests/core/s3/ tests/integration/ --no-cov`

**Step 3:** Implement 2b-2d.

**Step 4:** Run full test suite.

______________________________________________________________________

### Task 3: Add SCOPE_ERROR warning to all resources

Currently resources raise `ValueError` when matches exceed SCOPE_ERROR. This crashes the command. Instead, emit a stderr warning and return what we have (truncated).

**Files:** All `mirage/core/*/glob.py` (22 files)

```python
# Before:
if len(matched) > SCOPE_ERROR:
    raise ValueError(f"{p.directory}: {len(matched)} files exceeds limit ({SCOPE_ERROR})")

# After:
if len(matched) > SCOPE_ERROR:
    import logging
    logging.getLogger(__name__).warning(
        "%s: %d matches exceeds limit (%d), truncating",
        p.directory, len(matched), SCOPE_ERROR,
    )
    matched = matched[:SCOPE_ERROR]
```

**Step 1:** Update all resources.

**Step 2:** Run full test suite.

______________________________________________________________________

### Task 4: Add tests

**File:** `tests/core/s3/test_glob_prefix.py`

```python
from mirage.core.s3.readdir import _glob_prefix

def test_glob_prefix_star():
    assert _glob_prefix("*.txt") == ""

def test_glob_prefix_literal():
    assert _glob_prefix("data-*.csv") == "data-"

def test_glob_prefix_year():
    assert _glob_prefix("2024-*") == "2024-"

def test_glob_prefix_none():
    assert _glob_prefix(None) == ""

def test_glob_prefix_no_glob():
    assert _glob_prefix("exact.txt") == "exact.txt"
```

**File:** `tests/workspace/node/test_resolve_globs.py` — add test for full PathSpec passthrough.

**Step 1:** Write tests.

**Step 2:** Run tests: `uv run pytest tests/core/s3/test_glob_prefix.py tests/workspace/node/test_resolve_globs.py --no-cov`

______________________________________________________________________

### Task 5: Add glob sections to examples that lack them

These examples use `find -name` (command-level glob) but not shell-level glob expansion that exercises `resolve_glob`. Add glob sections:

**Files to update:**

- `examples/s3/s3.py` — add `echo /s3/data/*.jsonl`, `ls /s3/data/*.json`, `for f in /s3/data/*.json; do wc -l $f; done`
- `examples/paperclip/paperclip.py` — add `ls /paperclip/biorxiv/2024/01/*.json`
- `examples/email/example_email.py` — add `echo /email/INBOX/*.eml` or similar
- `examples/ssh/ssh.py` — add `echo /ssh/*.txt`, `ls /ssh/*.py`
- `examples/telegram/telegram.py` — add `echo /telegram/groups/*.jsonl` or similar

Each section follows the pattern:

```python
print("\n=== glob: echo /mount/path/*.ext ===")
r = await ws.execute("echo /mount/path/*.ext")
print(await r.stdout_str())

print("\n=== glob: for f in /mount/path/*.ext ===")
r = await ws.execute("for f in /mount/path/*.ext; do echo found: $f; done")
print(await r.stdout_str())
```

______________________________________________________________________

### Task 6: Run ALL resource examples

Run each example to verify no regressions after the readdir change:

```bash
# Group A resources (changed from p.dir to p)
uv run python examples/s3/s3.py
uv run python examples/gcs/gcs.py
uv run python examples/ssh/ssh.py
uv run python examples/github/github.py
uv run python examples/notion/notion.py
uv run python examples/langfuse/demo.py
uv run python examples/mongodb/mongodb.py
uv run python examples/ram/ram.py

# Group B resources (already pass p, verify no regression)
uv run python examples/discord/discord.py
uv run python examples/slack/slack.py
uv run python examples/gmail/gmail.py
uv run python examples/linear/linear.py
uv run python examples/trello/trello.py
uv run python examples/telegram/telegram.py
uv run python examples/gdrive/gdrive.py
uv run python examples/paperclip/paperclip.py
uv run python examples/email/example_email.py

# Cross-mount
uv run python examples/cross/example.py
```

Each example should complete without errors. Check that glob-based commands produce non-empty output.

______________________________________________________________________

## Implementation Order

| Task | What                                             | Files                | Effort |
| ---- | ------------------------------------------------ | -------------------- | ------ |
| 1    | Unify resolve_glob: `p.dir` → `p` in 9 resources | 9 glob.py files      | Small  |
| 2a   | S3 readdir prefix extraction                     | s3/readdir.py        | Small  |
| 2b   | SSH large dir warning                            | ssh/readdir.py       | Small  |
| 2c   | Paperclip SQL filter                             | paperclip/readdir.py | Medium |
| 2d   | Linear GraphQL filter                            | linear/readdir.py    | Medium |
| 3    | SCOPE_ERROR: warn + truncate instead of crash    | 22 glob.py files     | Small  |
| 4    | Unit tests                                       | 2 test files         | Small  |
| 5    | Add glob sections to examples missing them       | 5 example files      | Small  |
| 6    | Run ALL resource examples (18 examples)          | examples/            | Small  |

Task 1 is the unification. Tasks 2a-2d are per-resource optimizations. Task 3 is error handling. Tasks 5-6 are verification across all resources.
