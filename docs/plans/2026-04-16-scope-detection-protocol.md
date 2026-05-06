# Native Search Dispatch in Grep — Slack, Gmail, Notion

**Goal:** Make grep delegate to resource-native search APIs for Slack, Gmail, and Notion, the same way Discord/MongoDB/GitHub/Email already do. Skip downloading content when the resource can search server-side.

**Non-goals:**

- No shared `ScopeAware` Protocol. Each resource's grep imports from its own `core/<name>/`.
- No taxonomy of scope levels (file/container/root). Each resource's scope dataclass has whatever fields it needs; the only convention is a `use_native: bool` attribute.
- No abstraction in `mirage/resource/` or in `mirage/commands/builtin/helpers/`.

______________________________________________________________________

## Reference implementations (no changes)

| Resource | Where dispatch lives                                                                       |
| -------- | ------------------------------------------------------------------------------------------ |
| Discord  | `commands/builtin/discord/grep/grep.py:128` — `detect_scope` + `search_guild`              |
| MongoDB  | `commands/builtin/mongodb/grep/grep.py:157` — `detect_scope` + `$text` `search_collection` |
| GitHub   | `commands/builtin/github/grep/grep.py:154` — `search_code`                                 |
| Email    | `commands/builtin/email/grep/grep.py:249` — IMAP `search_messages`                         |

Same pattern repeats across the three new resources below.

______________________________________________________________________

## Per-resource work

### 1. Slack

**Existing:** `core/slack/search.py:search_messages(config, query, count)` returns formatted JSON bytes.
**Missing:** scope detection + grep dispatch.

**New file `core/slack/scope.py`:**

```python
@dataclass
class SlackScope:
    use_native: bool
    channel_name: str | None = None  # for /channels/{name}/*.jsonl

def detect_scope(path: PathSpec) -> SlackScope:
    # /channels/{name}/2026-04-10.jsonl  → use_native=False  (specific file)
    # /channels/{name}/                  → use_native=True   (channel scope)
    # /channels/                         → use_native=True   (workspace scope)
    # /                                  → use_native=True   (workspace scope)
```

**Modify `commands/builtin/slack/grep/grep.py`:** at the top of `grep()`, after parsing flags and before `resolve_glob`, add:

```python
if paths:
    scope = detect_scope(paths[0])
    if scope.use_native:
        result = await search_messages(accessor.config, pattern, count=max_count or 100)
        return _format_search_results(result, prefix), IOResult()
    # fall through to readdir + grep (existing code unchanged)
```

Add a small `_format_search_results()` helper that turns `search_messages` JSON bytes into grep-style `path:line` output (mirror Discord's `_format_search_results` shape).

### 2. Gmail

**Existing:** `core/gmail/messages.py:list_messages(token_manager, query=...)` returns message stubs (need to fetch each message body separately).
**Missing:** scope detection, search wrapper, grep dispatch.

**New file `core/gmail/scope.py`:**

```python
@dataclass
class GmailScope:
    use_native: bool
    label_id: str | None = None  # for /{label}/*.gmail.json

def detect_scope(path: PathSpec) -> GmailScope:
    # /{label}/{message_id}.gmail.json  → use_native=False
    # /{label}/                         → use_native=True   (label scope)
    # /                                 → use_native=True   (mailbox scope)
```

**New file `core/gmail/search.py`:**

```python
async def search_messages(
    token_manager: TokenManager,
    query: str,
    label_id: str | None = None,
    max_results: int = 50,
) -> bytes:
    """List → fetch → format. Returns grep-style path:body bytes."""
```

**Modify `commands/builtin/gmail/grep/grep.py`:** same 5-line dispatch pattern.

### 3. Notion

**Existing:** `core/notion/search.py:search_page_content(config, query)` returns `list[SearchResult]`.
`core/notion/scope.py` exists for a different concept (`count_scope` → file-count threshold). Add `detect_scope` to the same file.

**Extend `core/notion/scope.py`:**

```python
@dataclass
class NotionScope:
    use_native: bool
    page_id: str | None = None  # for /pages/{id}/page.json

def detect_scope(path: PathSpec) -> NotionScope:
    # /pages/{id}/page.json   → use_native=False
    # /pages/                 → use_native=True
    # /                       → use_native=True
```

**Modify `commands/builtin/notion/grep/grep.py`:** same pattern. Add a `_format_search_results()` that turns `list[SearchResult]` into `path:title` lines.

______________________________________________________________________

## Implementation order

1. **Slack** — smallest. `search_messages` already returns bytes; only the format step is new.
1. **Gmail** — needs both `scope.py` and `search.py`; `search.py` does the list→fetch→format.
1. **Notion** — extend existing `scope.py`; `search_page_content` already returns structured results.

______________________________________________________________________

## Verification

For each resource:

- Read the existing grep file and trace what changes
- Add `detect_scope` unit tests covering: file path, container path, root path
- Add a grep integration test that exercises the native-search branch
- Run scoped tests only (per project rule):
  ```
  uv run pytest tests/core/<name> tests/commands/builtin/<name>
  ```

After all three resources are wired:

- `pre-commit run --all-files`
- Spot-check examples for each resource

______________________________________________________________________

## What we are NOT building

- No `mirage/resource/scope.py`
- No `ScopeAware` Protocol / `runtime_checkable` / `isinstance` dispatch
- No `mirage/commands/builtin/helpers/scope_grep.py`
- No cross-resource `SearchScope` taxonomy
