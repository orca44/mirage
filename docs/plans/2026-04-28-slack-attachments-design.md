# Slack Attachments — Design

**Date:** 2026-04-28
**Status:** Locked, ready for implementation
**Goal:** Surface Slack file attachments as readable blobs in the Slack VFS, with content-search push-down via `search.files`.

______________________________________________________________________

## Why

Today the Slack resource exposes messages but not the files attached to them. Each message JSON in `chat.jsonl` already carries a `files: [...]` array with metadata (id, name, mimetype, size, `url_private_download`), but agents have no way to read the actual bytes or grep across attachment contents. Slack already indexes text-bearing attachments (PDFs, Word, code snippets, posts, markdown) server-side via `search.files`, so we get full-text search on attachments for free if we surface them.

______________________________________________________________________

## Filesystem layout

```
channels/<name>__<C-id>/
  <yyyy-mm-dd>/                    ← date directory (was <yyyy-mm-dd>.jsonl)
    chat.jsonl                     ← messages, JSONL (incl. inline files[] metadata)
    files/                         ← always present, may be empty
      <name>__<F-id>.<ext>         ← blob, fetched on read

dms/<name>__<D-id>/
  <yyyy-mm-dd>/
    chat.jsonl
    files/
      <name>__<F-id>.<ext>

users/
  <name>__<U-id>.json
```

**Breaking change:** `<yyyy-mm-dd>.jsonl` (depth-3 file) becomes `<yyyy-mm-dd>/chat.jsonl` (depth-3 dir + depth-4 file). Per CLAUDE.md, no backward compat is required.

**File naming:** `<sanitized-title>__<F-id>.<ext>`. Slack file IDs (`F012ABC`) are stable and unique; this matches the existing `name__id` convention used for channels, DMs, and users — zero collisions, no rename logic.

**Empty `files/`:** always present, even on file-less days. The day's history fetch is paid regardless, and a stable directory simplifies scope/glob/stat code.

______________________________________________________________________

## Data flow & API cost

| Operation                         | Behavior                                                                                                              | API cost                                                |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `ls channels/foo__C1/`            | Existing (date dirs, listed lazily)                                                                                   | 1 `conversations.history` (limit=1) for latest_ts       |
| `ls <date>/`                      | Index lookup → `[chat.jsonl, files/]`                                                                                 | 0 (after first day fetch)                               |
| `cat <date>/chat.jsonl` (cold)    | Paginated `conversations.history` for the day; populates **both** chat content and `files/` index entries in one pass | 1 paginated call (typically 1–3 pages)                  |
| `ls <date>/files/` (cold)         | Same single fetch as above; entries derived from inline `files[]`                                                     | 1 paginated call (or 0 if `chat.jsonl` already fetched) |
| `cat <date>/files/foo__F1.pdf`    | HTTP GET `url_private_download` (Bearer auth) on `files.slack.com`                                                    | 1 blob fetch                                            |
| `rg pat <date>/chat.jsonl`        | Existing `search.messages` push-down                                                                                  | 1 search call                                           |
| `rg pat <date>/files/`            | New `search.files` push-down                                                                                          | 1 search call                                           |
| `rg pat <date>/` (date or higher) | Both `search.messages` + `search.files`, results merged                                                               | 2 search calls                                          |

**Key invariant:** the day-dir history fetch happens *at most once per day per session*. It populates index entries for `chat.jsonl`, `files/`, and every `files/<blob>` in a single pass. All subsequent `ls`/`stat` calls on anything inside that date are index hits.

______________________________________________________________________

## Module changes

### `core/slack/scope.py`

Replace depth-3 `<date>.jsonl` detection with:

- depth-3 `<date>/` → date directory.
- depth-4 `<date>/chat.jsonl` → JSONL messages file (use_native=False; bytes served by `read.py`).
- depth-4 `<date>/files/` → files directory.
- depth-5 `<date>/files/<name>__<Fid>.<ext>` → file blob.

`coalesce_scopes` continues to scope-by-channel; new logic detects when scope is restricted to `chat.jsonl` only, `files/` only, or both — needed by `rg.py` to choose the right push-down.

### `core/slack/readdir.py`

- Channel dir (depth-2) — unchanged shape; lists *date dirs* (no `.jsonl` suffix). Update `vfs_name`/filename construction at the date-listing branch.
- Date dir (depth-3, new) — returns `[chat.jsonl, files/]` from cache, or bootstraps via `_fetch_day(channel_id, date_str)`.
- `files/` dir (depth-4, new) — returns cached entries; bootstrapped lazily via `_fetch_day` if cold.
- New helper `_fetch_day` — single source of truth for paginated `conversations.history` for one day. Walks every message, extracts `files[]`, populates:
  - chat content cache (consumed by `read.py`)
  - index entry for `<date>/chat.jsonl` (`resource_type="slack/chat_jsonl"`)
  - index entry for `<date>/files/` (`resource_type="slack/files_dir"`)
  - index entries for each blob (`resource_type="slack/file"`, `extra={mimetype, size, url_private_download, ts}`)

### `core/slack/read.py`

- depth-4 `<date>/chat.jsonl` → existing `get_history_jsonl` path; cache result.
- depth-5 `<date>/files/<blob>` (new) → look up `url_private_download` from index entry's `extra`, HTTP GET with Bearer token, return raw bytes. Note: hits `files.slack.com`, not `slack.com/api`; response is not JSON; do not call `.json()`.
- depth-2 `users/<file>.json` → unchanged.

### `core/slack/stat.py`

- depth-3 `<date>/` → `FileType.DIRECTORY`.
- depth-4 `<date>/chat.jsonl` → `FileType.TEXT`.
- depth-4 `<date>/files/` → `FileType.DIRECTORY`.
- depth-5 `<date>/files/<blob>` → `FileType.TEXT` for text mimetypes (`text/*`, `application/json`, etc.), `FileType.BINARY` otherwise. Size from index `extra`.

### `core/slack/search.py`

- New `search_files(config, query, count=20) -> bytes` — mirrors `search_messages`, hits `search.files` endpoint, same `search_token`.
- New `format_file_grep_results(raw, scope, prefix) -> list[str]` — formats hits as `<path>:[file] <title> — <preview>`.
- `build_query` unchanged (same scope operators apply: `in:#channel`, `in:@user`, `from:@user`, `after:`, `before:`).

### `commands/builtin/slack/rg.py`

Push-down decision tree (replaces current single-branch logic at [rg.py:80-94](python/mirage/commands/builtin/slack/rg.py#L80-L94)):

```
detect scope.target ∈ {messages_only, files_only, both}
if messages_only: search.messages (existing)
if files_only:    search.files (new)
if both:          search.messages + search.files; concat results
```

Scope target detection — based on whether the path explicitly contains `/chat.jsonl`, `/files/`, or neither (i.e., scopes the whole date or whole channel). When neither is specified, default is **both**.

`_collect_files` (the per-file scan fallback) keeps its current `.json|.jsonl` filter — file blobs are never grepped client-side; their content search is exclusively server-side via `search.files`.

### `resource/slack/prompt.py`

Update layout and add note about `files/`:

```
channels/
  <channel-name>__<channel-id>/
    <yyyy-mm-dd>/
      chat.jsonl                   # messages for that date
      files/                       # attachments shared that day (may be empty)
        <name>__<F-id>.<ext>       # cat to download bytes
```

Add: "rg over `files/` uses Slack's server-side file content search — works on PDFs, docs, code snippets that Slack has indexed."

______________________________________________________________________

## Index entry types (new)

| `resource_type`    | `id`                  | `extra`                                                        |
| ------------------ | --------------------- | -------------------------------------------------------------- |
| `slack/date_dir`   | `<C-id>:<yyyy-mm-dd>` | —                                                              |
| `slack/chat_jsonl` | `<C-id>:<yyyy-mm-dd>` | —                                                              |
| `slack/files_dir`  | `<C-id>:<yyyy-mm-dd>` | —                                                              |
| `slack/file`       | `<F-id>`              | `{mimetype, size, url_private_download, ts, channel_id, date}` |

Existing `slack/history` resource_type is replaced by `slack/chat_jsonl` (different shape; no migration needed).

______________________________________________________________________

## Tests

### Update

- `tests/core/slack/test_scope.py` — depth-3/4/5 cases.
- `tests/core/slack/test_readdir.py` — date dir lists `[chat.jsonl, files/]`; `files/` derived from messages with files; one fetch covers both.
- `tests/core/slack/test_read.py` — `chat.jsonl` content; blob fetch via mocked `url_private_download`.
- `tests/core/slack/test_stat.py` — new entries.

### Add

- `tests/core/slack/test_files.py` — fixture: messages with `files[]`; assert listing, naming (`name__Fid.ext`), empty-day case, blob read.
- `tests/core/slack/test_search_files.py` — `search_files` API call; result formatting.
- `tests/commands/builtin/slack/test_rg_files.py` — push-down branches: `chat.jsonl`-only, `files/`-only, both.

______________________________________________________________________

## Out of scope

- **Writes / uploads.** Read-only. `files.upload` push-down deferred.
- **Thumbnails / previews.** Original blob only.
- **Cross-channel dedup.** A file shared in N channels appears under N date dirs. The `F-id` is stable so a future blob cache could dedupe, but the VFS surface keeps them as separate paths.
- **External (non-Slack-hosted) files.** `url_private` only; Slack-external links in messages stay as text in `chat.jsonl`.
- **Thread replies on a different day.** Files in thread replies appear under the *reply's* day, matching upload time. No special-casing.
- **TS port.** Python only. TS port is a follow-up.

______________________________________________________________________

## Open follow-ups (not blocking)

- Mimetype → `FileType` mapping table — start with `text/*` and `application/json` as TEXT, everything else BINARY. Iterate based on real-world payloads.
- Pagination of `search.files` results — start with `count=20` like `search.messages`.
- Rate-limit handling on `files.slack.com` — currently no retry/backoff in `_client.py`; if the file endpoint 429s frequently, add backoff in a separate change.
