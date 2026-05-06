# Slack Attachments Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Surface Slack file attachments as readable blobs in the Slack VFS under `<channel>/<date>/files/`, with content search push-down via Slack's `search.files` API.

**Architecture:**

- VFS layout shifts from `<date>.jsonl` (file) to `<date>/chat.jsonl` + `<date>/files/<name>__<F-id>.<ext>` (directory).
- A single `_fetch_day` helper in `readdir.py` fetches a day's `conversations.history` once and populates index entries for `chat.jsonl`, `files/`, and every `files/<blob>` in one pass.
- Blob bytes come from `url_private_download` on `files.slack.com` (Bearer auth), stored in a new `extra` field on `IndexEntry`.
- `rg` push-down decides between `search.messages` / `search.files` / both based on whether the path scopes `chat.jsonl`, `files/`, or the day root.

**Tech Stack:** Python 3.12, `aiohttp`, `pydantic`, `pytest-asyncio`. Per CLAUDE.md: no backward compat, all imports at top, no nested functions, paths as `PathSpec`.

**Reference design:** [docs/plans/2026-04-28-slack-attachments-design.md](2026-04-28-slack-attachments-design.md)

**Worktree:** `/Users/zecheng/strukto/mirage/.worktrees/slack-attachments`, branch `feat/slack-attachments`. **All paths in this plan are relative to `python/` inside that worktree.**

______________________________________________________________________

## Pre-flight

Run from the worktree's `python/` directory:

```bash
cd /Users/zecheng/strukto/mirage/.worktrees/slack-attachments/python
uv sync --all-extras --no-extra camel
uv run pytest tests/core/slack/ tests/commands/builtin/slack/ --no-cov -q
```

Expected: 53 passing, 0 failing. If anything's red, stop and investigate before starting Task 1.

**Throughout:** all `pytest` invocations should use `--no-cov -q` (the project has coverage gates that aren't relevant here, and verbose output drowns signal).

______________________________________________________________________

## Task 1: Add `extra` field to IndexEntry

We need to store `url_private_download`, `mimetype`, and `ts` per-file blob. `IndexEntry` currently has no metadata escape hatch. Adding `extra: dict | None = None` is one line + a tiny test.

**Files:**

- Modify: `mirage/cache/index/config.py:18-25`
- Test: `tests/cache/test_index_entry_extra.py` (new)

### Step 1.1 — Write the failing test

Create `tests/cache/test_index_entry_extra.py`:

```python
from mirage.cache.index.config import IndexEntry


def test_index_entry_extra_defaults_to_none():
    entry = IndexEntry(id="x", name="x", resource_type="t")
    assert entry.extra is None


def test_index_entry_extra_round_trip():
    entry = IndexEntry(
        id="F1",
        name="report",
        resource_type="slack/file",
        extra={"url": "https://files.slack.com/x", "mimetype": "application/pdf"},
    )
    assert entry.extra == {
        "url": "https://files.slack.com/x",
        "mimetype": "application/pdf",
    }


def test_index_entry_extra_serializes():
    entry = IndexEntry(
        id="F1",
        name="report",
        resource_type="slack/file",
        extra={"url": "u"},
    )
    raw = entry.model_dump_json()
    assert '"extra"' in raw
    restored = IndexEntry.model_validate_json(raw)
    assert restored.extra == {"url": "u"}
```

### Step 1.2 — Run, confirm fail

```bash
uv run pytest tests/cache/test_index_entry_extra.py --no-cov -q
```

Expected: 3 errors with `AttributeError` or `ValidationError` — `extra` field doesn't exist.

### Step 1.3 — Implement

Edit `mirage/cache/index/config.py:18-25`. Add `extra: dict | None = None` after `size`:

```python
class IndexEntry(BaseModel):
    id: str
    name: str
    resource_type: str
    remote_time: str = ""
    index_time: str = ""
    vfs_name: str = ""
    size: int | None = None
    extra: dict | None = None
```

### Step 1.4 — Run, confirm pass

```bash
uv run pytest tests/cache/test_index_entry_extra.py --no-cov -q
```

Expected: 3 passing.

Also run the full cache test suite to confirm we didn't break Redis/RAM serialization:

```bash
uv run pytest tests/cache/ --no-cov -q
```

Expected: all green.

### Step 1.5 — Commit

```bash
git add mirage/cache/index/config.py tests/cache/test_index_entry_extra.py
git commit -m "feat(cache): add extra dict field to IndexEntry"
```

______________________________________________________________________

## Task 2: Scope detection for new layout

The current `detect_scope` recognizes depth-3 `<date>.jsonl` as the leaf. New layout has depth-3 `<date>/` (dir), depth-4 `<date>/chat.jsonl` and `<date>/files/`, depth-5 `<date>/files/<blob>`. Glob support: `<date>/files/*.pdf`, `<date>/chat.jsonl`, `<channel>/*/chat.jsonl`.

**Files:**

- Modify: `mirage/core/slack/scope.py`
- Test: `tests/core/slack/test_scope.py` (existing — update + extend)

### Step 2.1 — Update existing tests for new layout

In `tests/core/slack/test_scope.py`, change every `<date>.jsonl` reference:

- `test_specific_jsonl_file` → rename to `test_specific_chat_jsonl` and update path:

  ```python
  def test_specific_chat_jsonl():
      scope = detect_scope(
          _gs("/slack/channels/general__C1/2026-04-10/chat.jsonl",
              prefix="/slack"))
      assert scope.use_native is False
      assert scope.date_str == "2026-04-10"
      assert scope.channel_name == "general"
      assert scope.channel_id == "C1"
  ```

- `test_channel_glob_jsonl` → update directory path:

  ```python
  def test_channel_glob_jsonl():
      spec = PathSpec(
          original="/slack/channels/general__C1/*/chat.jsonl",
          directory="/slack/channels/general__C1/",
          pattern="*/chat.jsonl",
          resolved=False,
          prefix="/slack",
      )
      scope = detect_scope(spec)
      assert scope.use_native is True
      assert scope.channel_name == "general"
      assert scope.channel_id == "C1"
  ```

- All `coalesce_*` tests: replace `2026-01-{N:02d}.jsonl` → `2026-01-{N:02d}/chat.jsonl`.

### Step 2.2 — Add new test cases

Append to `tests/core/slack/test_scope.py`:

```python
def test_date_dir():
    scope = detect_scope(
        _gs("/slack/channels/general__C1/2026-04-10", prefix="/slack"))
    assert scope.use_native is True
    assert scope.date_str == "2026-04-10"
    assert scope.channel_name == "general"
    assert scope.channel_id == "C1"
    assert scope.target == "date"


def test_files_dir():
    scope = detect_scope(
        _gs("/slack/channels/general__C1/2026-04-10/files", prefix="/slack"))
    assert scope.use_native is True
    assert scope.date_str == "2026-04-10"
    assert scope.target == "files"


def test_specific_file_blob():
    scope = detect_scope(
        _gs("/slack/channels/general__C1/2026-04-10/files/report__F1.pdf",
            prefix="/slack"))
    assert scope.use_native is False
    assert scope.date_str == "2026-04-10"
    assert scope.target == "files"


def test_glob_files_in_day():
    spec = PathSpec(
        original="/slack/channels/general__C1/2026-04-10/files/*.pdf",
        directory="/slack/channels/general__C1/2026-04-10/files/",
        pattern="*.pdf",
        resolved=False,
        prefix="/slack",
    )
    scope = detect_scope(spec)
    assert scope.use_native is True
    assert scope.target == "files"


def test_chat_jsonl_target():
    scope = detect_scope(
        _gs("/slack/channels/general__C1/2026-04-10/chat.jsonl",
            prefix="/slack"))
    assert scope.target == "messages"
```

### Step 2.3 — Run, confirm fail

```bash
uv run pytest tests/core/slack/test_scope.py --no-cov -q
```

Expected: existing tests fail because old depth-3 `.jsonl` paths no longer match; new tests fail because `target` attribute doesn't exist.

### Step 2.4 — Implement

Edit `mirage/core/slack/scope.py`:

1. Add `target: str | None = None` to `SlackScope` dataclass. Valid values: `"date"`, `"messages"`, `"files"`, `None`.
1. Rewrite `detect_scope` to recognize:
   - depth-3 `<date>` (no extension, ISO-format date) → `use_native=True`, `target="date"`, `date_str` set.
   - depth-4 `<date>/chat.jsonl` → `use_native=False`, `target="messages"`, `date_str` set.
   - depth-4 `<date>/files` → `use_native=True`, `target="files"`, `date_str` set.
   - depth-5 `<date>/files/<blob>` → `use_native=False`, `target="files"`, `date_str` set.
   - Glob `<date>/files/*` (pattern) → `use_native=True`, `target="files"`.
   - Glob `*/chat.jsonl` at channel level → handled in the existing `path.pattern.endswith(".jsonl")` branch.
1. Update `coalesce_scopes`: also coalesce `target` (return `None` if mixed).

Date detection helper — anything matching `^\d{4}-\d{2}-\d{2}$`:

```python
import re

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
```

Sketch of the rewritten path-shape branch:

```python
parts = key.split("/")
root = parts[0]
# ... existing root handling for users / unknown ...

if root not in ("channels", "dms"):
    return SlackScope(use_native=False, resource_path=key)

if len(parts) == 1:
    return SlackScope(use_native=True, container=root, resource_path=key)

if len(parts) == 2:
    name, cid = _split_dirname(parts[1])
    return SlackScope(
        use_native=True,
        channel_name=name,
        channel_id=cid,
        container=root,
        resource_path=key,
    )

if len(parts) == 3 and _DATE_RE.match(parts[2]):
    name, cid = _split_dirname(parts[1])
    return SlackScope(
        use_native=True,
        channel_name=name,
        channel_id=cid,
        container=root,
        date_str=parts[2],
        target="date",
        resource_path=key,
    )

if len(parts) == 4 and parts[3] == "chat.jsonl" and _DATE_RE.match(parts[2]):
    name, cid = _split_dirname(parts[1])
    return SlackScope(
        use_native=False,
        channel_name=name,
        channel_id=cid,
        container=root,
        date_str=parts[2],
        target="messages",
        resource_path=key,
    )

if len(parts) == 4 and parts[3] == "files" and _DATE_RE.match(parts[2]):
    name, cid = _split_dirname(parts[1])
    return SlackScope(
        use_native=True,
        channel_name=name,
        channel_id=cid,
        container=root,
        date_str=parts[2],
        target="files",
        resource_path=key,
    )

if len(parts) == 5 and parts[3] == "files" and _DATE_RE.match(parts[2]):
    name, cid = _split_dirname(parts[1])
    return SlackScope(
        use_native=False,
        channel_name=name,
        channel_id=cid,
        container=root,
        date_str=parts[2],
        target="files",
        resource_path=key,
    )

return SlackScope(use_native=False, resource_path=key)
```

Glob branch at top — keep but generalize:

```python
if path.pattern:
    dir_key = path.directory.strip("/")
    if prefix:
        dir_key = dir_key.removeprefix(prefix.strip("/") + "/")
    parts = dir_key.split("/") if dir_key else []
    if len(parts) >= 2 and parts[0] in ("channels", "dms"):
        name, cid = _split_dirname(parts[1])
        target = None
        date_str = None
        if len(parts) == 2:
            target = None
        elif len(parts) == 3 and _DATE_RE.match(parts[2]):
            target = "date"
            date_str = parts[2]
        elif len(parts) == 4 and parts[3] == "files" and _DATE_RE.match(parts[2]):
            target = "files"
            date_str = parts[2]
        return SlackScope(
            use_native=True,
            channel_name=name,
            channel_id=cid,
            container=parts[0],
            date_str=date_str,
            target=target,
            resource_path=dir_key,
        )
```

Update `coalesce_scopes` final assignment to include `target=first.target` if all match, else `None`.

### Step 2.5 — Run, confirm pass

```bash
uv run pytest tests/core/slack/test_scope.py --no-cov -q
```

Expected: all green.

### Step 2.6 — Commit

```bash
git add mirage/core/slack/scope.py tests/core/slack/test_scope.py
git commit -m "feat(slack): scope detection for date dir + files/ layout"
```

______________________________________________________________________

## Task 3: Date dir directory listing in readdir

Channel-level listing currently produces `<date>.jsonl` filenames. Switch to `<date>` (no extension), and add depth-3 logic that returns `[chat.jsonl, files/]` for any date dir.

**Files:**

- Modify: `mirage/core/slack/readdir.py`
- Test: `tests/core/slack/test_readdir.py` (existing — update + extend)

### Step 3.1 — Update existing tests

In `tests/core/slack/test_readdir.py`:

- `test_readdir_channel_dates` — change assertions to `endswith(now.strftime('%Y-%m-%d'))` (no `.jsonl`):
  ```python
  assert all(not r.endswith(".jsonl") for r in result)
  assert all(r.startswith("/channels/general__C001/") for r in result)
  assert result[0].endswith(now.strftime('%Y-%m-%d'))
  ```
- `test_readdir_channel_dates_with_created` — same fix.
- `test_readdir_channel_dates_cached_in_entries` — same.

### Step 3.2 — Add new test for date dir listing

Append to `tests/core/slack/test_readdir.py`:

```python
@pytest.mark.asyncio
async def test_readdir_date_dir_returns_chat_and_files(accessor, index):
    # Pre-seed: channel exists, date dir exists in index.
    await index.set_dir("/channels", [
        ("general__C001",
         IndexEntry(id="C001", name="general",
                    resource_type="slack/channel", vfs_name="general__C001",
                    remote_time="1700000000")),
    ])
    await index.set_dir("/channels/general__C001", [
        ("2026-04-10",
         IndexEntry(id="C001:2026-04-10", name="2026-04-10",
                    resource_type="slack/date_dir", vfs_name="2026-04-10")),
    ])
    # Stub the day fetch — empty messages.
    with patch("mirage.core.slack.readdir._fetch_day",
               new_callable=AsyncMock,
               return_value=None):
        result = await readdir(
            accessor,
            PathSpec(original="/channels/general__C001/2026-04-10",
                     directory="/channels/general__C001/2026-04-10"),
            index=index)
    assert sorted(result) == [
        "/channels/general__C001/2026-04-10/chat.jsonl",
        "/channels/general__C001/2026-04-10/files",
    ]
```

### Step 3.3 — Run, confirm fail

```bash
uv run pytest tests/core/slack/test_readdir.py --no-cov -q
```

Expected: existing tests fail (`.jsonl` mismatch); new test fails (`_fetch_day` doesn't exist, depth-3 branch missing).

### Step 3.4 — Implement

Edit `mirage/core/slack/readdir.py`:

**(a)** Change `_channel_dirname` is unchanged. Find the date-listing branch (currently lines 150-190 returning `f"{d}.jsonl"`). Update:

```python
parts = key.split("/")
if len(parts) == 2 and parts[0] in ("channels", "dms"):
    # ... lookup logic unchanged ...
    entries = []
    names = []
    for d in dates:
        entry = IndexEntry(
            id=f"{lookup.entry.id}:{d}",
            name=d,
            resource_type="slack/date_dir",
            vfs_name=d,
        )
        entries.append((d, entry))
        names.append(f"{prefix}/{key}/{d}")
    await index.set_dir(virtual_key, entries)
    return names
```

(Removed `.jsonl` suffix; changed `resource_type` to `slack/date_dir`.)

**(b)** Add a new depth-3 branch immediately after:

```python
if len(parts) == 3 and parts[0] in ("channels", "dms"):
    if index is None:
        raise FileNotFoundError(path)
    cached = await index.list_dir(virtual_key)
    if cached.entries is not None:
        return cached.entries
    # Bootstrap parent if needed.
    parent_vk = prefix + "/" + parts[0] + "/" + parts[1]
    parent_lookup = await index.get(parent_vk)
    if parent_lookup.entry is None:
        parent = PathSpec(
            original=prefix + "/" + parts[0] + "/" + parts[1],
            directory=prefix + "/" + parts[0] + "/" + parts[1],
            prefix=prefix,
        )
        await readdir(accessor, parent, index)
        parent_lookup = await index.get(parent_vk)
    if parent_lookup.entry is None:
        raise FileNotFoundError(path)
    channel_id = parent_lookup.entry.id
    date_str = parts[2]
    await _fetch_day(accessor, channel_id, date_str, virtual_key, index)
    cached = await index.list_dir(virtual_key)
    if cached.entries is not None:
        return [f"{prefix}/{key}/{n}" for n in cached.entries]
    raise FileNotFoundError(path)
```

**(c)** Add `_fetch_day` stub at the bottom of the file (full implementation in Task 4):

```python
async def _fetch_day(
    accessor: SlackAccessor,
    channel_id: str,
    date_str: str,
    date_vkey: str,
    index: IndexCacheStore,
) -> None:
    # Populates index entries for chat.jsonl and files/ under date_vkey.
    # Real impl in Task 4 fetches conversations.history and walks files[].
    chat_entry = IndexEntry(
        id=f"{channel_id}:{date_str}:chat",
        name="chat.jsonl",
        resource_type="slack/chat_jsonl",
        vfs_name="chat.jsonl",
    )
    files_entry = IndexEntry(
        id=f"{channel_id}:{date_str}:files",
        name="files",
        resource_type="slack/files_dir",
        vfs_name="files",
    )
    await index.set_dir(date_vkey, [
        ("chat.jsonl", chat_entry),
        ("files", files_entry),
    ])
```

(The stub is enough to pass the new test — it doesn't actually fetch yet. Task 4 fills it in.)

### Step 3.5 — Run, confirm pass

```bash
uv run pytest tests/core/slack/test_readdir.py --no-cov -q
```

Expected: all green.

### Step 3.6 — Commit

```bash
git add mirage/core/slack/readdir.py tests/core/slack/test_readdir.py
git commit -m "feat(slack): readdir returns date dirs with chat.jsonl + files/"
```

______________________________________________________________________

## Task 4: Wire `_fetch_day` to real history fetch

Now `_fetch_day` actually calls `conversations.history`, walks every message's `files[]`, and populates `files/` index entries with `url_private_download` in `extra`. Also caches the chat.jsonl bytes (so a subsequent `cat chat.jsonl` doesn't refetch).

**Files:**

- Modify: `mirage/core/slack/readdir.py`
- Modify: `mirage/core/slack/history.py` (extract pagination so both `_fetch_day` and `get_history_jsonl` can share)
- Test: `tests/core/slack/test_readdir.py`, `tests/core/slack/test_files.py` (new)

### Step 4.1 — Failing test

Create `tests/core/slack/test_files.py`:

```python
from unittest.mock import AsyncMock, patch

import pytest

from mirage.accessor.slack import SlackAccessor
from mirage.cache.index import IndexEntry, RAMIndexCacheStore
from mirage.core.slack.readdir import readdir
from mirage.resource.slack.config import SlackConfig
from mirage.types import PathSpec


@pytest.fixture
def config():
    return SlackConfig(token="xoxb-test")


@pytest.fixture
def accessor(config):
    return SlackAccessor(config=config)


@pytest.fixture
def index():
    return RAMIndexCacheStore()


@pytest.fixture
def messages_with_files():
    return [
        {
            "type": "message",
            "user": "U1",
            "ts": "1712707200.0",
            "text": "here's the report",
            "files": [{
                "id": "F1ABC",
                "name": "report.pdf",
                "title": "report.pdf",
                "filetype": "pdf",
                "mimetype": "application/pdf",
                "size": 4096,
                "url_private_download":
                    "https://files.slack.com/files-pri/T1-F1ABC/download/report.pdf",
                "timestamp": 1712707200,
            }],
        },
        {
            "type": "message",
            "user": "U2",
            "ts": "1712707260.0",
            "text": "no file here",
        },
    ]


@pytest.mark.asyncio
async def test_files_dir_listing_from_messages(
    accessor, index, messages_with_files
):
    await index.set_dir("/channels", [
        ("general__C001", IndexEntry(
            id="C001", name="general",
            resource_type="slack/channel", vfs_name="general__C001",
            remote_time="1700000000")),
    ])
    await index.set_dir("/channels/general__C001", [
        ("2026-04-10", IndexEntry(
            id="C001:2026-04-10", name="2026-04-10",
            resource_type="slack/date_dir", vfs_name="2026-04-10")),
    ])
    with patch("mirage.core.slack.readdir._fetch_messages_for_day",
               new_callable=AsyncMock,
               return_value=messages_with_files):
        result = await readdir(
            accessor,
            PathSpec(
                original="/channels/general__C001/2026-04-10/files",
                directory="/channels/general__C001/2026-04-10/files"),
            index=index,
        )
    assert result == [
        "/channels/general__C001/2026-04-10/files/report__F1ABC.pdf"
    ]


@pytest.mark.asyncio
async def test_files_dir_empty_on_no_attachments(accessor, index):
    await index.set_dir("/channels", [
        ("general__C001", IndexEntry(
            id="C001", name="general",
            resource_type="slack/channel", vfs_name="general__C001",
            remote_time="1700000000")),
    ])
    await index.set_dir("/channels/general__C001", [
        ("2026-04-10", IndexEntry(
            id="C001:2026-04-10", name="2026-04-10",
            resource_type="slack/date_dir", vfs_name="2026-04-10")),
    ])
    no_file_msgs = [
        {"type": "message", "user": "U1", "ts": "1712707200.0", "text": "hi"}
    ]
    with patch("mirage.core.slack.readdir._fetch_messages_for_day",
               new_callable=AsyncMock,
               return_value=no_file_msgs):
        result = await readdir(
            accessor,
            PathSpec(
                original="/channels/general__C001/2026-04-10/files",
                directory="/channels/general__C001/2026-04-10/files"),
            index=index,
        )
    assert result == []


@pytest.mark.asyncio
async def test_file_blob_index_entry_stores_url(
    accessor, index, messages_with_files
):
    await index.set_dir("/channels", [
        ("general__C001", IndexEntry(
            id="C001", name="general",
            resource_type="slack/channel", vfs_name="general__C001",
            remote_time="1700000000")),
    ])
    await index.set_dir("/channels/general__C001", [
        ("2026-04-10", IndexEntry(
            id="C001:2026-04-10", name="2026-04-10",
            resource_type="slack/date_dir", vfs_name="2026-04-10")),
    ])
    with patch("mirage.core.slack.readdir._fetch_messages_for_day",
               new_callable=AsyncMock,
               return_value=messages_with_files):
        await readdir(
            accessor,
            PathSpec(
                original="/channels/general__C001/2026-04-10/files",
                directory="/channels/general__C001/2026-04-10/files"),
            index=index,
        )
    blob = await index.get(
        "/channels/general__C001/2026-04-10/files/report__F1ABC.pdf")
    assert blob.entry is not None
    assert blob.entry.id == "F1ABC"
    assert blob.entry.size == 4096
    assert blob.entry.extra is not None
    assert blob.entry.extra["mimetype"] == "application/pdf"
    assert "url_private_download" in blob.entry.extra
```

### Step 4.2 — Run, confirm fail

```bash
uv run pytest tests/core/slack/test_files.py --no-cov -q
```

Expected: 3 failures.

### Step 4.3 — Implement

Edit `mirage/core/slack/history.py` — extract a low-level fetch:

```python
async def fetch_messages_for_day(
    config: SlackConfig,
    channel_id: str,
    date_str: str,
) -> list[dict]:
    """Fetch all messages for a date as parsed dicts.

    Args:
        config (SlackConfig): Slack credentials.
        channel_id (str): channel ID.
        date_str (str): date in YYYY-MM-DD format.

    Returns:
        list[dict]: messages sorted by ts ascending.
    """
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    dt = dt.replace(tzinfo=timezone.utc)
    oldest = str(dt.timestamp())
    latest = str(dt.replace(hour=23, minute=59, second=59).timestamp())

    messages: list[dict] = []
    cursor: str | None = None
    while True:
        params: dict = {
            "channel": channel_id,
            "oldest": oldest,
            "latest": latest,
            "limit": 200,
            "inclusive": "true",
        }
        if cursor:
            params["cursor"] = cursor
        data = await slack_get(config, "conversations.history", params=params)
        messages.extend(data.get("messages", []))
        if not data.get("has_more"):
            break
        cursor = (data.get("response_metadata", {}).get("next_cursor", ""))
        if not cursor:
            break
    messages.sort(key=lambda m: float(m.get("ts", "0")))
    return messages


async def get_history_jsonl(
    config: SlackConfig,
    channel_id: str,
    date_str: str,
) -> bytes:
    """Fetch channel messages for a specific date as JSONL.

    Args:
        config (SlackConfig): Slack credentials.
        channel_id (str): channel ID.
        date_str (str): date in YYYY-MM-DD format.

    Returns:
        bytes: JSONL-encoded messages.
    """
    messages = await fetch_messages_for_day(config, channel_id, date_str)
    lines = [json.dumps(m, ensure_ascii=False) for m in messages]
    return ("\n".join(lines) + "\n").encode() if lines else b""
```

(Both functions live in the same file, no circular imports.)

Edit `mirage/core/slack/readdir.py` `_fetch_day` and add `_fetch_messages_for_day`:

```python
from mirage.core.slack.history import fetch_messages_for_day
from mirage.utils.sanitize import sanitize_name


def _file_blob_name(file_meta: dict) -> str:
    raw_name = file_meta.get("name") or file_meta.get("title") or "file"
    fid = file_meta["id"]
    if "." in raw_name:
        stem, _, ext = raw_name.rpartition(".")
        return f"{sanitize_name(stem)}__{fid}.{ext}"
    return f"{sanitize_name(raw_name)}__{fid}"


async def _fetch_messages_for_day(
    accessor: SlackAccessor,
    channel_id: str,
    date_str: str,
) -> list[dict]:
    return await fetch_messages_for_day(accessor.config, channel_id, date_str)


async def _fetch_day(
    accessor: SlackAccessor,
    channel_id: str,
    date_str: str,
    date_vkey: str,
    index: IndexCacheStore,
) -> None:
    messages = await _fetch_messages_for_day(accessor, channel_id, date_str)
    chat_entry = IndexEntry(
        id=f"{channel_id}:{date_str}:chat",
        name="chat.jsonl",
        resource_type="slack/chat_jsonl",
        vfs_name="chat.jsonl",
    )
    files_entry = IndexEntry(
        id=f"{channel_id}:{date_str}:files",
        name="files",
        resource_type="slack/files_dir",
        vfs_name="files",
    )
    await index.set_dir(date_vkey, [
        ("chat.jsonl", chat_entry),
        ("files", files_entry),
    ])
    file_entries: list[tuple[str, IndexEntry]] = []
    for msg in messages:
        for fmeta in msg.get("files", []) or []:
            if not fmeta.get("id"):
                continue
            blob_name = _file_blob_name(fmeta)
            file_entries.append((blob_name, IndexEntry(
                id=fmeta["id"],
                name=fmeta.get("title", fmeta.get("name", "")),
                resource_type="slack/file",
                vfs_name=blob_name,
                size=fmeta.get("size"),
                remote_time=str(fmeta.get("timestamp", "")),
                extra={
                    "mimetype": fmeta.get("mimetype", ""),
                    "url_private_download":
                        fmeta.get("url_private_download", ""),
                    "channel_id": channel_id,
                    "date": date_str,
                },
            )))
    await index.set_dir(date_vkey + "/files", file_entries)
```

Also add a depth-4 `files/` branch in `readdir`:

```python
if (len(parts) == 4 and parts[0] in ("channels", "dms")
        and parts[3] == "files"):
    if index is None:
        raise FileNotFoundError(path)
    cached = await index.list_dir(virtual_key)
    if cached.entries is not None:
        return [f"{prefix}/{key}/{n}" for n in cached.entries]
    # Bootstrap via date-dir readdir → triggers _fetch_day.
    date_path = PathSpec(
        original=prefix + "/" + "/".join(parts[:3]),
        directory=prefix + "/" + "/".join(parts[:3]),
        prefix=prefix,
    )
    await readdir(accessor, date_path, index)
    cached = await index.list_dir(virtual_key)
    if cached.entries is not None:
        return [f"{prefix}/{key}/{n}" for n in cached.entries]
    raise FileNotFoundError(path)
```

### Step 4.4 — Run, confirm pass

```bash
uv run pytest tests/core/slack/test_files.py tests/core/slack/test_readdir.py tests/core/slack/test_history.py --no-cov -q
```

Expected: all green.

### Step 4.5 — Commit

```bash
git add mirage/core/slack/readdir.py mirage/core/slack/history.py tests/core/slack/test_files.py
git commit -m "feat(slack): _fetch_day populates files/ from message attachments"
```

______________________________________________________________________

## Task 5: read.py for chat.jsonl and blob downloads

`read` currently handles depth-3 `<date>.jsonl`. Update to depth-4 `<date>/chat.jsonl`, and add a new branch for depth-5 file blobs.

**Files:**

- Modify: `mirage/core/slack/read.py`
- Create: `mirage/core/slack/files.py` (blob download helper)
- Test: `tests/core/slack/test_read.py` (existing — update + extend)

### Step 5.1 — Update existing read tests

Open `tests/core/slack/test_read.py` and replace any `<date>.jsonl` paths with `<date>/chat.jsonl`. Specifically: every test using `2026-04-10.jsonl` etc.

### Step 5.2 — Add new test for blob download

Append:

```python
@pytest.mark.asyncio
async def test_read_file_blob(accessor, index):
    # Pre-seed index with file entry carrying url_private_download.
    await index.set_dir("/channels", [
        ("general__C001", IndexEntry(
            id="C001", name="general",
            resource_type="slack/channel", vfs_name="general__C001")),
    ])
    await index.set_dir("/channels/general__C001/2026-04-10/files", [
        ("report__F1.pdf", IndexEntry(
            id="F1", name="report.pdf",
            resource_type="slack/file", vfs_name="report__F1.pdf",
            size=4096,
            extra={
                "mimetype": "application/pdf",
                "url_private_download": "https://files.slack.com/x/report.pdf",
                "channel_id": "C001",
                "date": "2026-04-10",
            })),
    ])
    with patch("mirage.core.slack.files.download_file",
               new_callable=AsyncMock,
               return_value=b"%PDF-1.4 fake bytes"):
        data = await read(
            accessor,
            PathSpec(
                original="/channels/general__C001/2026-04-10/files/report__F1.pdf",
                directory="/channels/general__C001/2026-04-10/files/report__F1.pdf"),
            index=index,
        )
    assert data == b"%PDF-1.4 fake bytes"
```

### Step 5.3 — Run, confirm fail

```bash
uv run pytest tests/core/slack/test_read.py --no-cov -q
```

Expected: existing tests fail (path mismatch), new test fails (no `files.py` module).

### Step 5.4 — Implement

Create `mirage/core/slack/files.py`:

```python
import aiohttp

from mirage.resource.slack.config import SlackConfig


async def download_file(config: SlackConfig, url: str) -> bytes:
    """Download a Slack-hosted file blob.

    Args:
        config (SlackConfig): Slack credentials.
        url (str): Slack file URL (typically url_private_download).

    Returns:
        bytes: raw file content.
    """
    headers = {"Authorization": f"Bearer {config.token}"}
    async with aiohttp.ClientSession() as session:
        async with session.get(url, headers=headers) as resp:
            resp.raise_for_status()
            return await resp.read()
```

Edit `mirage/core/slack/read.py`. Replace the depth-3 `.jsonl` branch with depth-4 `<date>/chat.jsonl`, then add depth-5 file blob:

```python
import json

from mirage.accessor.slack import SlackAccessor
from mirage.cache.index import IndexCacheStore
from mirage.core.slack.files import download_file
from mirage.core.slack.history import get_history_jsonl
from mirage.core.slack.users import get_user_profile
from mirage.types import PathSpec


async def read(
    accessor: SlackAccessor,
    path: PathSpec,
    index: IndexCacheStore = None,
) -> bytes:
    if isinstance(path, str):
        path = PathSpec(original=path, directory=path)
    prefix = path.prefix if isinstance(path, PathSpec) else ""
    raw = path.original if isinstance(path, PathSpec) else path
    if prefix and raw.startswith(prefix):
        raw = raw[len(prefix):] or "/"
    key = raw.strip("/")
    parts = key.split("/")

    if (len(parts) == 4 and parts[0] in ("channels", "dms")
            and parts[3] == "chat.jsonl"):
        parent_key = f"{parts[0]}/{parts[1]}"
        if index is None:
            raise FileNotFoundError(key)
        virtual_key = prefix + "/" + parent_key
        lookup = await index.get(virtual_key)
        if lookup.entry is None:
            raise FileNotFoundError(key)
        channel_id = lookup.entry.id
        date_str = parts[2]
        return await get_history_jsonl(accessor.config, channel_id, date_str)

    if (len(parts) == 5 and parts[0] in ("channels", "dms")
            and parts[3] == "files"):
        if index is None:
            raise FileNotFoundError(key)
        virtual_key = prefix + "/" + key
        lookup = await index.get(virtual_key)
        if lookup.entry is None or not lookup.entry.extra:
            raise FileNotFoundError(key)
        url = lookup.entry.extra.get("url_private_download")
        if not url:
            raise FileNotFoundError(key)
        return await download_file(accessor.config, url)

    if len(parts) == 2 and parts[0] == "users":
        if index is None:
            raise FileNotFoundError(key)
        virtual_key = prefix + "/" + key
        lookup = await index.get(virtual_key)
        if lookup.entry is None:
            raise FileNotFoundError(key)
        user = await get_user_profile(accessor.config, lookup.entry.id)
        return json.dumps(user, ensure_ascii=False).encode()

    raise FileNotFoundError(key)
```

### Step 5.5 — Run, confirm pass

```bash
uv run pytest tests/core/slack/test_read.py --no-cov -q
```

Expected: all green.

### Step 5.6 — Commit

```bash
git add mirage/core/slack/read.py mirage/core/slack/files.py tests/core/slack/test_read.py
git commit -m "feat(slack): read chat.jsonl and download file blobs"
```

______________________________________________________________________

## Task 6: stat.py for new entries

`stat` needs to return correct types for: depth-3 date dir, depth-4 chat.jsonl, depth-4 files/, depth-5 file blob (with mimetype-based file type).

**Files:**

- Modify: `mirage/core/slack/stat.py`
- Test: `tests/core/slack/test_stat.py` (existing — update + extend)

### Step 6.1 — Update existing stat tests for new layout

Replace any `<date>.jsonl` paths with `<date>/chat.jsonl`.

### Step 6.2 — Add new test cases

Append:

```python
@pytest.mark.asyncio
async def test_stat_date_dir(accessor, index):
    await index.set_dir("/channels/general__C001", [
        ("2026-04-10", IndexEntry(
            id="C001:2026-04-10", name="2026-04-10",
            resource_type="slack/date_dir", vfs_name="2026-04-10")),
    ])
    s = await stat(accessor,
                   PathSpec(original="/channels/general__C001/2026-04-10",
                            directory="/channels/general__C001/2026-04-10"),
                   index=index)
    assert s.type == FileType.DIRECTORY


@pytest.mark.asyncio
async def test_stat_chat_jsonl(accessor, index):
    s = await stat(
        accessor,
        PathSpec(
            original="/channels/general__C001/2026-04-10/chat.jsonl",
            directory="/channels/general__C001/2026-04-10/chat.jsonl"),
        index=index)
    assert s.type == FileType.TEXT


@pytest.mark.asyncio
async def test_stat_files_dir(accessor, index):
    s = await stat(
        accessor,
        PathSpec(original="/channels/general__C001/2026-04-10/files",
                 directory="/channels/general__C001/2026-04-10/files"),
        index=index)
    assert s.type == FileType.DIRECTORY


@pytest.mark.asyncio
async def test_stat_file_blob_pdf(accessor, index):
    await index.set_dir("/channels/general__C001/2026-04-10/files", [
        ("report__F1.pdf", IndexEntry(
            id="F1", name="report",
            resource_type="slack/file", vfs_name="report__F1.pdf",
            size=4096,
            extra={"mimetype": "application/pdf",
                   "url_private_download": "u",
                   "channel_id": "C001", "date": "2026-04-10"})),
    ])
    s = await stat(
        accessor,
        PathSpec(
            original="/channels/general__C001/2026-04-10/files/report__F1.pdf",
            directory="/channels/general__C001/2026-04-10/files/report__F1.pdf"),
        index=index)
    assert s.type == FileType.PDF
    assert s.size == 4096


@pytest.mark.asyncio
async def test_stat_file_blob_text(accessor, index):
    await index.set_dir("/channels/general__C001/2026-04-10/files", [
        ("notes__F2.txt", IndexEntry(
            id="F2", name="notes", resource_type="slack/file",
            vfs_name="notes__F2.txt", size=128,
            extra={"mimetype": "text/plain", "url_private_download": "u",
                   "channel_id": "C001", "date": "2026-04-10"})),
    ])
    s = await stat(
        accessor,
        PathSpec(
            original="/channels/general__C001/2026-04-10/files/notes__F2.txt",
            directory="/channels/general__C001/2026-04-10/files/notes__F2.txt"),
        index=index)
    assert s.type == FileType.TEXT
```

### Step 6.3 — Run, confirm fail

```bash
uv run pytest tests/core/slack/test_stat.py --no-cov -q
```

### Step 6.4 — Implement

Edit `mirage/core/slack/stat.py`:

```python
from mirage.accessor.slack import SlackAccessor
from mirage.cache.index import IndexCacheStore
from mirage.types import FileStat, FileType, PathSpec

VIRTUAL_DIRS = {"", "channels", "dms", "users"}

_MIMETYPE_TO_FILETYPE = {
    "application/pdf": FileType.PDF,
    "application/zip": FileType.ZIP,
    "application/gzip": FileType.GZIP,
    "image/png": FileType.IMAGE_PNG,
    "image/jpeg": FileType.IMAGE_JPEG,
    "image/gif": FileType.IMAGE_GIF,
    "application/json": FileType.JSON,
}


def _file_type_from_mimetype(mimetype: str) -> FileType:
    if mimetype in _MIMETYPE_TO_FILETYPE:
        return _MIMETYPE_TO_FILETYPE[mimetype]
    if mimetype.startswith("text/"):
        return FileType.TEXT
    return FileType.BINARY


async def stat(
    accessor: SlackAccessor,
    path: PathSpec,
    index: IndexCacheStore = None,
) -> FileStat:
    if isinstance(path, str):
        path = PathSpec(original=path, directory=path)
    prefix = path.prefix if isinstance(path, PathSpec) else ""
    raw = path.original if isinstance(path, PathSpec) else path
    if prefix and raw.startswith(prefix):
        raw = raw[len(prefix):] or "/"
    key = raw.strip("/")

    if key in VIRTUAL_DIRS:
        name = key if key else "/"
        return FileStat(name=name, type=FileType.DIRECTORY)

    parts = key.split("/")
    virtual_key = prefix + "/" + key

    if len(parts) == 2 and parts[0] in ("channels", "dms"):
        if index is None:
            raise FileNotFoundError(path)
        lookup = await index.get(virtual_key)
        if lookup.entry is None:
            raise FileNotFoundError(path)
        return FileStat(
            name=lookup.entry.vfs_name or lookup.entry.name,
            type=FileType.DIRECTORY,
            extra={"channel_id": lookup.entry.id},
        )

    if len(parts) == 2 and parts[0] == "users":
        if index is None:
            raise FileNotFoundError(path)
        lookup = await index.get(virtual_key)
        if lookup.entry is None:
            raise FileNotFoundError(path)
        return FileStat(
            name=lookup.entry.vfs_name or lookup.entry.name,
            type=FileType.JSON,
            extra={"user_id": lookup.entry.id},
        )

    if len(parts) == 3 and parts[0] in ("channels", "dms"):
        return FileStat(name=parts[2], type=FileType.DIRECTORY)

    if (len(parts) == 4 and parts[0] in ("channels", "dms")
            and parts[3] == "chat.jsonl"):
        return FileStat(name="chat.jsonl", type=FileType.TEXT)

    if (len(parts) == 4 and parts[0] in ("channels", "dms")
            and parts[3] == "files"):
        return FileStat(name="files", type=FileType.DIRECTORY)

    if (len(parts) == 5 and parts[0] in ("channels", "dms")
            and parts[3] == "files"):
        if index is None:
            raise FileNotFoundError(path)
        lookup = await index.get(virtual_key)
        if lookup.entry is None:
            raise FileNotFoundError(path)
        mimetype = (lookup.entry.extra or {}).get("mimetype", "")
        return FileStat(
            name=lookup.entry.vfs_name or lookup.entry.name,
            type=_file_type_from_mimetype(mimetype),
            size=lookup.entry.size,
            extra={"file_id": lookup.entry.id},
        )

    raise FileNotFoundError(path)
```

### Step 6.5 — Run, confirm pass

```bash
uv run pytest tests/core/slack/test_stat.py --no-cov -q
```

### Step 6.6 — Commit

```bash
git add mirage/core/slack/stat.py tests/core/slack/test_stat.py
git commit -m "feat(slack): stat for date dir, chat.jsonl, files/, and blobs"
```

______________________________________________________________________

## Task 7: search_files API + result formatter

Add `search.files` push-down — mirrors `search.messages`. New helper functions in `core/slack/search.py`.

**Files:**

- Modify: `mirage/core/slack/search.py`
- Test: `tests/core/slack/test_search_files.py` (new)

### Step 7.1 — Failing test

Create `tests/core/slack/test_search_files.py`:

```python
import json
from unittest.mock import AsyncMock, patch

import pytest

from mirage.core.slack.scope import SlackScope
from mirage.core.slack.search import (build_query, format_file_grep_results,
                                      search_files)
from mirage.resource.slack.config import SlackConfig


@pytest.mark.asyncio
async def test_search_files_calls_correct_endpoint():
    config = SlackConfig(token="xoxb", search_token="xoxp")
    fake_response = {
        "ok": True,
        "files": {"matches": []},
    }
    with patch("mirage.core.slack.search.slack_get",
               new_callable=AsyncMock,
               return_value=fake_response) as mock:
        await search_files(config, "report")
    args, kwargs = mock.call_args
    assert args[1] == "search.files"
    assert kwargs["params"]["query"] == "report"
    assert kwargs["token"] == "xoxp"


def test_format_file_grep_results_renders_paths():
    raw_payload = {
        "files": {
            "matches": [
                {
                    "id": "F1ABC",
                    "name": "report.pdf",
                    "title": "Q4 Report",
                    "filetype": "pdf",
                    "channels": ["C001"],
                    "timestamp": 1712707200,
                },
            ],
        },
    }
    raw = json.dumps(raw_payload).encode()
    scope = SlackScope(use_native=True, container="channels",
                       channel_name="general", channel_id="C001",
                       target="files")
    lines = format_file_grep_results(raw, scope, "/slack")
    assert len(lines) == 1
    line = lines[0]
    assert "files/" in line
    assert "F1ABC" in line
    assert "[file]" in line
    assert "Q4 Report" in line


def test_build_query_unchanged_for_files():
    scope = SlackScope(use_native=True, container="channels",
                       channel_name="eng", channel_id="C1",
                       target="files")
    assert build_query("foo", scope) == "in:#eng foo"
```

### Step 7.2 — Run, confirm fail

```bash
uv run pytest tests/core/slack/test_search_files.py --no-cov -q
```

### Step 7.3 — Implement

Edit `mirage/core/slack/search.py` — append:

```python
async def search_files(
    config: SlackConfig,
    query: str,
    count: int = 20,
) -> bytes:
    """Search files across workspace via Slack's search.files API.

    Args:
        config (SlackConfig): Slack credentials.
        query (str): search query.
        count (int): max results.

    Returns:
        bytes: JSON response.
    """
    params = {"query": query, "count": count, "sort": "timestamp"}
    data = await slack_get(
        config,
        "search.files",
        params=params,
        token=config.search_token,
    )
    return json.dumps(data, ensure_ascii=False).encode()


def format_file_grep_results(
    raw: bytes,
    scope: SlackScope,
    prefix: str,
) -> list[str]:
    payload = json.loads(raw.decode())
    matches = payload.get("files", {}).get("matches", []) or []
    lines: list[str] = []
    for f in matches:
        fid = f.get("id", "")
        title = (f.get("title") or f.get("name") or fid)
        raw_name = f.get("name") or title
        if "." in raw_name:
            stem, _, ext = raw_name.rpartition(".")
            blob_name = f"{stem}__{fid}.{ext}"
        else:
            blob_name = f"{raw_name}__{fid}"
        ts = f.get("timestamp", 0)
        try:
            date_str = datetime.fromtimestamp(
                float(ts), tz=timezone.utc).date().isoformat()
        except (TypeError, ValueError):
            date_str = ""
        ch_ids = f.get("channels", []) or []
        ch_id = ch_ids[0] if ch_ids else (scope.channel_id or "")
        ch_name = scope.channel_name or ""
        container = scope.container or "channels"
        dirname = f"{ch_name}__{ch_id}" if ch_id else ch_name
        path = (f"{prefix}/{container}/{dirname}/{date_str}/files/{blob_name}"
                if date_str else
                f"{prefix}/{container}/{dirname}/files/{blob_name}")
        lines.append(f"{path}:[file] {title}")
    return lines
```

### Step 7.4 — Run, confirm pass

```bash
uv run pytest tests/core/slack/test_search_files.py --no-cov -q
```

### Step 7.5 — Commit

```bash
git add mirage/core/slack/search.py tests/core/slack/test_search_files.py
git commit -m "feat(slack): search.files API and grep result formatter"
```

______________________________________________________________________

## Task 8: rg push-down chooses messages/files/both

Update `commands/builtin/slack/rg.py` so that:

- Scope target `"messages"` → only `search.messages`.
- Scope target `"files"` → only `search.files`.
- Scope target `None`/`"date"` (channel root or whole-day) → both, concatenated.

**Files:**

- Modify: `mirage/commands/builtin/slack/rg.py`
- Test: `tests/commands/builtin/slack/test_rg_files.py` (new)

### Step 8.1 — Failing test

Create `tests/commands/builtin/slack/test_rg_files.py`:

```python
from unittest.mock import AsyncMock, patch

import pytest

from mirage.accessor.slack import SlackAccessor
from mirage.cache.index import RAMIndexCacheStore
from mirage.commands.builtin.slack.rg import rg
from mirage.resource.slack.config import SlackConfig
from mirage.types import PathSpec


@pytest.fixture
def accessor():
    return SlackAccessor(config=SlackConfig(token="xoxb", search_token="xoxp"))


@pytest.fixture
def index():
    return RAMIndexCacheStore()


@pytest.mark.asyncio
async def test_rg_messages_only_when_chat_jsonl(accessor, index):
    msgs_payload = b'{"messages":{"matches":[]}}'
    with (
        patch("mirage.commands.builtin.slack.rg.search_messages",
              new_callable=AsyncMock,
              return_value=msgs_payload) as mock_msgs,
        patch("mirage.commands.builtin.slack.rg.search_files",
              new_callable=AsyncMock) as mock_files,
    ):
        await rg(
            accessor,
            paths=[PathSpec(
                original="/channels/general__C001/2026-04-10/chat.jsonl",
                directory="/channels/general__C001/2026-04-10/chat.jsonl",
                prefix="",
            )],
            *("foo",),
            index=index,
        )
    assert mock_msgs.await_count == 1
    assert mock_files.await_count == 0


@pytest.mark.asyncio
async def test_rg_files_only_when_files_dir(accessor, index):
    files_payload = b'{"files":{"matches":[]}}'
    with (
        patch("mirage.commands.builtin.slack.rg.search_messages",
              new_callable=AsyncMock) as mock_msgs,
        patch("mirage.commands.builtin.slack.rg.search_files",
              new_callable=AsyncMock,
              return_value=files_payload) as mock_files,
    ):
        await rg(
            accessor,
            paths=[PathSpec(
                original="/channels/general__C001/2026-04-10/files",
                directory="/channels/general__C001/2026-04-10/files",
                prefix="",
            )],
            *("foo",),
            index=index,
        )
    assert mock_msgs.await_count == 0
    assert mock_files.await_count == 1


@pytest.mark.asyncio
async def test_rg_both_when_channel_or_day_root(accessor, index):
    msgs_payload = b'{"messages":{"matches":[]}}'
    files_payload = b'{"files":{"matches":[]}}'
    with (
        patch("mirage.commands.builtin.slack.rg.search_messages",
              new_callable=AsyncMock,
              return_value=msgs_payload) as mock_msgs,
        patch("mirage.commands.builtin.slack.rg.search_files",
              new_callable=AsyncMock,
              return_value=files_payload) as mock_files,
    ):
        await rg(
            accessor,
            paths=[PathSpec(
                original="/channels/general__C001/2026-04-10",
                directory="/channels/general__C001/2026-04-10",
                prefix="",
            )],
            *("foo",),
            index=index,
        )
    assert mock_msgs.await_count == 1
    assert mock_files.await_count == 1
```

(Note: keyword-arg `texts` may need `texts=("foo",)` instead of positional unpacking — check the function signature in rg.py and adjust.)

### Step 8.2 — Run, confirm fail

```bash
uv run pytest tests/commands/builtin/slack/test_rg_files.py --no-cov -q
```

### Step 8.3 — Implement

Edit `mirage/commands/builtin/slack/rg.py`. Replace the current `if scope.use_native:` block (lines 80-94) with target-aware routing:

```python
from mirage.core.slack.search import (build_query, format_file_grep_results,
                                      format_grep_results, search_files,
                                      search_messages)

# ... inside rg(), after scope detection ...

if scope.use_native:
    file_prefix = paths[0].prefix or ""
    query = build_query(pattern_str, scope)
    target = getattr(scope, "target", None)
    do_msgs = target in (None, "date", "messages")
    do_files = target in (None, "date", "files")
    lines: list[str] = []
    err: Exception | None = None
    try:
        if do_msgs:
            raw = await search_messages(accessor.config, query,
                                        count=max_count or 100)
            lines.extend(format_grep_results(raw, scope, file_prefix))
        if do_files:
            raw_f = await search_files(accessor.config, query,
                                       count=max_count or 100)
            lines.extend(format_file_grep_results(raw_f, scope, file_prefix))
    except Exception as exc:
        err = exc
    if err is None:
        if not lines:
            return b"", IOResult(exit_code=1)
        return ("\n".join(lines) + "\n").encode(), IOResult()
    logger.warning(
        "slack search push-down failed (%s); "
        "falling back to per-file scan", err)
```

(Falls through to existing per-file scan on error, same as before.)

### Step 8.4 — Run, confirm pass

```bash
uv run pytest tests/commands/builtin/slack/test_rg_files.py --no-cov -q
```

### Step 8.5 — Commit

```bash
git add mirage/commands/builtin/slack/rg.py tests/commands/builtin/slack/test_rg_files.py
git commit -m "feat(slack): rg routes to search.messages/search.files by scope target"
```

______________________________________________________________________

## Task 9: Update prompt

**Files:**

- Modify: `mirage/resource/slack/prompt.py`

### Step 9.1 — Edit

Replace contents of `mirage/resource/slack/prompt.py`:

```python
PROMPT = """\
{prefix}
  channels/
    <channel-name>__<channel-id>/
      <yyyy-mm-dd>/
        chat.jsonl                # messages for that date
        files/                    # attachments shared that day (may be empty)
          <name>__<F-id>.<ext>    # cat to download bytes
  dms/
    <user-name>__<dm-id>/
      <yyyy-mm-dd>/
        chat.jsonl
        files/
          <name>__<F-id>.<ext>
  users/
    <username>__<user-id>.json    # user profile
  Always ls directories first to discover exact names (they include IDs).
  Messages are JSONL — use jq to extract fields like .text, .user, .ts, .files.
  rg over files/ uses Slack's server-side file content search — works on
  PDFs, Word docs, code snippets that Slack has indexed."""

WRITE_PROMPT = """\
  Write commands:
    slack-post-message <channel-path> "message"
    slack-reply-to-thread <message-path> "reply" """
```

### Step 9.2 — Smoke import + commit

```bash
uv run python -c "from mirage.resource.slack.prompt import PROMPT, WRITE_PROMPT; print(len(PROMPT), len(WRITE_PROMPT))"
```

Expected: prints two non-zero ints.

```bash
git add mirage/resource/slack/prompt.py
git commit -m "docs(slack): update prompt for date dir + files/ layout"
```

______________________________________________________________________

## Task 10: Wire `_resolve_glob` for new paths

`mirage/core/slack/glob.py` calls `readdir` and filters by pattern. With nested directories, glob patterns like `<channel>/*/chat.jsonl` need to recurse one level. Verify by tracing the existing logic.

**Files:**

- Inspect: `mirage/core/slack/glob.py`
- Test: `tests/core/slack/test_glob.py` (new) — only if any glob path needs change

### Step 10.1 — Trace + write a smoke test

Create `tests/core/slack/test_glob.py`:

```python
from unittest.mock import AsyncMock, patch

import pytest

from mirage.accessor.slack import SlackAccessor
from mirage.cache.index import IndexEntry, RAMIndexCacheStore
from mirage.core.slack.glob import resolve_glob
from mirage.resource.slack.config import SlackConfig
from mirage.types import PathSpec


@pytest.fixture
def accessor():
    return SlackAccessor(config=SlackConfig(token="xoxb"))


@pytest.fixture
def index():
    return RAMIndexCacheStore()


@pytest.mark.asyncio
async def test_resolve_glob_files_pdf(accessor, index):
    await index.set_dir("/channels/general__C001/2026-04-10/files", [
        ("a__F1.pdf", IndexEntry(
            id="F1", name="a", resource_type="slack/file",
            vfs_name="a__F1.pdf",
            extra={"mimetype": "application/pdf",
                   "url_private_download": "u",
                   "channel_id": "C001", "date": "2026-04-10"})),
        ("b__F2.txt", IndexEntry(
            id="F2", name="b", resource_type="slack/file",
            vfs_name="b__F2.txt",
            extra={"mimetype": "text/plain",
                   "url_private_download": "u",
                   "channel_id": "C001", "date": "2026-04-10"})),
    ])
    spec = PathSpec(
        original="/channels/general__C001/2026-04-10/files/*.pdf",
        directory="/channels/general__C001/2026-04-10/files/",
        pattern="*.pdf",
        resolved=False,
        prefix="",
    )
    matched = await resolve_glob(accessor, [spec], index=index)
    assert len(matched) == 1
    assert matched[0].original.endswith("a__F1.pdf")
```

### Step 10.2 — Run

```bash
uv run pytest tests/core/slack/test_glob.py --no-cov -q
```

If green: glob already works for the nested layout (it just calls `readdir` on the parent and filters — no special-casing of `.jsonl` patterns).

If failing: investigate. Most likely the test passes with existing code because `resolve_glob` is layout-agnostic. If it fails, fix and add a step to commit the change.

### Step 10.3 — Commit

```bash
git add tests/core/slack/test_glob.py
git commit -m "test(slack): glob resolves files/ patterns with new layout"
```

______________________________________________________________________

## Task 11: Final integration check

Verify the full Slack resource imports cleanly, no circular imports, end-to-end suite green, pre-commit clean.

### Step 11.1 — Import smoke test

```bash
uv run python -c "
from mirage.core.slack.scope import detect_scope, coalesce_scopes, SlackScope
from mirage.core.slack.readdir import readdir, _fetch_day, _file_blob_name
from mirage.core.slack.read import read
from mirage.core.slack.stat import stat, _file_type_from_mimetype
from mirage.core.slack.files import download_file
from mirage.core.slack.search import search_messages, search_files, format_file_grep_results
from mirage.commands.builtin.slack.rg import rg
from mirage.resource.slack.slack import SlackResource
print('ok')
"
```

Expected: prints `ok`.

### Step 11.2 — Full slack test suite

```bash
uv run pytest tests/core/slack/ tests/commands/builtin/slack/ --no-cov -q
```

Expected: all green. Should now be more than the original 53 (added ~15 new tests).

### Step 11.3 — Cross-check no other tests broke

```bash
uv run pytest --no-cov -q
```

Expected: all green. If anything red is unrelated to slack, file a separate issue. If something slack-adjacent broke (e.g. fingerprint/index tests touching `extra`), fix it as part of this branch.

### Step 11.4 — Pre-commit

From repo root (`/Users/zecheng/strukto/mirage/.worktrees/slack-attachments`):

```bash
cd ..
./python/.venv/bin/pre-commit run --all-files
```

Expected: all green. Fix any formatting/lint issues and re-stage.

### Step 11.5 — Final commit (only if pre-commit modified anything)

```bash
git add -A
git commit -m "chore(slack): pre-commit fixes"
```

______________________________________________________________________

## Task 12: Wrap-up — finishing-a-development-branch

Once tests + pre-commit are green, invoke `superpowers:finishing-a-development-branch` to decide between merge / PR / cleanup. Don't push to remote until the user confirms.

______________________________________________________________________

## Notes for the executing engineer

- **Coverage warnings during pytest:** the project has coverage gates configured in `pyproject.toml`. Always pass `--no-cov` for fast inner-loop iteration. Final integration run can drop the flag to confirm coverage didn't drop.
- **`uv run` warning about VIRTUAL_ENV:** ignore the `does not match the project environment path` warning — it's harmless and `uv` ignores the env var as it says.
- **PathSpec construction:** when building paths in tests, both `original` and `directory` are required. The convention is `directory=path` for files (point at the file itself) and `directory=path` for dirs.
- **Don't add inline comments.** Per CLAUDE.md, code should explain itself. Only add comments where the WHY is non-obvious.
- **No nested functions, no lazy imports.** Keep all imports at module top; refactor if a circular dep appears.
- **Mock at the right layer.** Tests above mock `_fetch_messages_for_day` and `slack_get` rather than `aiohttp.ClientSession` — keeps tests resilient to HTTP-layer changes.

______________________________________________________________________

## Out-of-scope (do not implement)

- File uploads / writes to `files/`.
- Thumbnails / file previews.
- Cross-channel file dedup (each channel sees its own copy).
- TS port — Python only.
- `files.info` enrichment for files referenced but missing from history payload.
