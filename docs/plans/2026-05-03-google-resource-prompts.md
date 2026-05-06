# Google Resource Prompts: Structure + Semantics

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expand the per-resource prompts for `gdocs`, `gsheets`, `gslides`, `gmail`, and `gdrive` so an agent loading the mount sees: the path tree (already there), filename anatomy, the meaning of `owned/` vs `shared/`, the JSON shape returned by `cat`, and a few useful `jq` paths.

**Why:** Today every Google prompt is 5–8 lines of path tree + one-liner. Agents have no way to know:

- That `owned/` and `shared/` are mutually exclusive and that docs *you* shared with others stay in `owned/` (this confused us during the SEAR debug session).
- What JSON shape `cat <file>.gdoc.json` actually returns, so they have to either guess or run an exploratory `cat | jq keys`.
- Which `jq` paths get the body text, the cell values, the slide content, etc.

**Tech stack:** Python only. Each prompt lives in `python/mirage/resource/<svc>/prompt.py` as a `PROMPT` (and optional `WRITE_PROMPT`) string. No code path consumes structure — they're rendered into the system prompt as-is.

**Out of scope:**

- TypeScript port of these prompts.
- Changing the JSON shape `cat` returns (gmail's processed shape stays as-is; gdocs/gsheets/gslides/gdrive raw shapes stay as-is).
- Adding new write commands or new endpoints.
- llms.txt / discoverable docs outside the mount prompt.

______________________________________________________________________

## Per-resource template

Every resource prompt follows this order. Write commands stay in the existing `WRITE_PROMPT` constant.

```
{prefix}
  <path tree, current shape>

  Filename: <anatomy of one file's name, what each segment means>

  Buckets:
    owned/   <one-line semantic>
    shared/  <one-line semantic>
             — <asymmetry note: docs you own and shared with others
               stay in owned/>

  <ext>.json structure (matches the Google <Service> API
  <method> response):
    {
      <annotated skeleton, JSON-ish, comments allowed>
    }

  Useful jq paths:
    .<path>     <one-line purpose>
    ...
```

Rules for the skeleton:

- Comments allowed (`# ...`). The agent reads it as documentation, not as JSON to parse.
- Show the **paths an agent would jq against**, not every field. `documentStyle: {...}` is enough — don't expand it unless agents would actually query inside it.
- Arrays show one element with `# one element per <thing>`.
- Keep total skeleton under ~25 lines per resource.

The "matches the Google ... API ... response" line is a single sentence so an agent that already knows the API can skip the skeleton. **Omit this line for gmail** (its `cat` returns a processed shape, not the raw API response).

______________________________________________________________________

## Current State

- [gdocs/prompt.py](python/mirage/resource/gdocs/prompt.py) — 8 lines, no structure, no semantics.
- [gsheets/prompt.py](python/mirage/resource/gsheets/prompt.py) — 8 lines, same.
- [gslides/prompt.py](python/mirage/resource/gslides/prompt.py) — 8 lines, same.
- [gmail/prompt.py](python/mirage/resource/gmail/prompt.py) — 9 lines, no structure, no field reference.
- [gdrive/prompt.py](python/mirage/resource/gdrive/prompt.py) — 8 lines, lists extensions but doesn't link to the gdocs/gsheets/gslides shapes.

JSON shapes verified against:

- gdocs: [read.py:11-14](python/mirage/core/gdocs/read.py#L11-L14) → raw `documents.get` response.
- gsheets: [read.py:12-25](python/mirage/core/gsheets/read.py#L12-L25) → raw `spreadsheets.get` response.
- gslides: [read.py:12-16](python/mirage/core/gslides/read.py#L12-L16) → raw `presentations.get` response.
- gmail: [messages.py:142-169](python/mirage/core/gmail/messages.py#L142-L169) → custom processed dict (NOT the raw Gmail API).
- gdrive: [read.py:50-58](python/mirage/core/gdrive/read.py#L50-L58) → delegates to gdocs/gsheets/gslides for those types, raw bytes otherwise.

Buckets logic verified against [gdocs/readdir.py:42-44](python/mirage/core/gdocs/readdir.py#L42-L44), parallel in gsheets/gslides — `owners[0].me == True` → `owned/`, else `shared/`. (gdrive and gmail do not have this split.)

Tests live in `python/tests/resource/<svc>/`. Existing pattern: most resources have no prompt test today; the prompt is an unguarded string. We will add one assertion-style test per resource.

______________________________________________________________________

## Phase 1 — Reference draft (gdocs)

Phase 1 ships gdocs alone so we validate the template end-to-end (rendering, agent legibility, test shape) before mass-applying it.

### Task 1.1: Rewrite `gdocs/prompt.py`

**Files:**

- Modify: [python/mirage/resource/gdocs/prompt.py](python/mirage/resource/gdocs/prompt.py)

**Step 1: Replace `PROMPT`**

```python
PROMPT = """\
{prefix}
  owned/
    <date>_<title>__<doc-id>.gdoc.json
  shared/
    <date>_<title>__<doc-id>.gdoc.json

  Filename: <YYYY-MM-DD>_<title>__<doc-id>.gdoc.json
    <YYYY-MM-DD>  modifiedTime, used for date-glob (e.g. 2026-05-*)
    <title>       sanitized: spaces->_, non-[A-Za-z0-9_.-]->_, <=100 chars
    <doc-id>      Google Docs document ID

  Buckets:
    owned/   docs you created
    shared/  docs shared with you by others
             - does NOT include docs you own and shared with others;
               those are still in owned/.

  gdoc.json structure (matches the Google Docs API documents.get response):
    {
      "documentId": "...",
      "title": "...",
      "body": {
        "content": [
          {                              # one element per block
            "paragraph": {
              "elements": [
                { "textRun": { "content": "the actual text\\n",
                               "textStyle": {...} } }
              ],
              "paragraphStyle": {...}
            }
          },
          { "table": {...} },
          { "sectionBreak": {...} }
        ]
      },
      "documentStyle": {...},
      "namedStyles": {...},
      "revisionId": "...",
      "suggestionsViewMode": "..."
    }

  Useful jq paths:
    .title
    .body.content[].paragraph.elements[].textRun.content   # all text
    [.body.content[] | select(.table)] | length            # table count
    .revisionId
"""
```

`WRITE_PROMPT` unchanged.

**Step 2: Add a smoke test**

- Create: `python/tests/resource/gdocs/test_prompt.py`

```python
from mirage.resource.gdocs.prompt import PROMPT, WRITE_PROMPT


def test_prompt_includes_buckets_and_structure():
    rendered = PROMPT.format(prefix="/gdocs")
    assert "owned/" in rendered
    assert "shared/" in rendered
    assert "shared with you by others" in rendered
    assert "still in owned/" in rendered
    assert "gdoc.json structure" in rendered
    assert ".body.content[].paragraph.elements[].textRun.content" in rendered


def test_write_prompt_unchanged():
    assert "gws-docs-write" in WRITE_PROMPT
    assert "gws-docs-documents-create" in WRITE_PROMPT
```

The test pins the contract (buckets + structure section + the most-used jq path) without locking the entire string.

**Step 3: Run**

```bash
cd python && uv run pytest tests/resource/gdocs/test_prompt.py -v --no-cov
```

**Step 4: Manual eyeball**

```bash
./python/.venv/bin/python -c \
  "from mirage.resource.gdocs.prompt import PROMPT; print(PROMPT.format(prefix='/gdocs'))"
```

Read it as if you were an agent. If anything is ambiguous, fix before moving on — the next four resources copy this template.

**Step 5: Commit**

```bash
git add python/mirage/resource/gdocs/prompt.py python/tests/resource/gdocs/test_prompt.py
git commit -m "docs(gdocs): expand prompt with filename, buckets, JSON structure, jq paths"
```

______________________________________________________________________

## Phase 2 — Apply template to gsheets, gslides

These are the two siblings with the same `owned/shared` split. Mirror Phase 1 mechanically. Read each `read.py` first to confirm the API method (sheets uses `spreadsheets.get`, slides uses `presentations.get`) — do not skip this; if the read implementation has diverged, the prompt would lie.

### Task 2.1: gsheets

**Files:**

- Modify: [python/mirage/resource/gsheets/prompt.py](python/mirage/resource/gsheets/prompt.py)
- Create: `python/tests/resource/gsheets/test_prompt.py`

Skeleton for the structure section (replace the placeholder values with the actual shape — the below is what `cat` returns):

```
gsheet.json structure (matches the Google Sheets API spreadsheets.get response):
  {
    "spreadsheetId": "...",
    "spreadsheetUrl": "...",
    "properties": { "title": "...", "locale": "...", "timeZone": "..." },
    "sheets": [
      {                                      # one element per tab
        "properties": {
          "sheetId": 0, "title": "...", "index": 0,
          "gridProperties": { "rowCount": 1000, "columnCount": 26 }
        },
        "data": [
          {
            "rowData": [
              { "values": [
                  { "formattedValue": "...",
                    "userEnteredValue": {...},
                    "effectiveValue": {...} }
              ]}
            ]
          }
        ]
      }
    ],
    "namedRanges": [...]
  }

Useful jq paths:
  .properties.title
  .sheets[].properties.title                              # tab names
  .sheets[0].data[0].rowData[].values[].formattedValue    # cell strings
  .namedRanges[]
```

Note: `data[].rowData[].values[]` is only populated for cells that have content. Empty cells are omitted, not nullified — call this out in a `# ...` comment in the skeleton.

Test mirrors Phase 1 — pin `owned/`, `shared/`, "still in owned/", "gsheet.json structure", and `.sheets[].properties.title`.

Commit:

```bash
git commit -m "docs(gsheets): expand prompt with filename, buckets, JSON structure, jq paths"
```

### Task 2.2: gslides

**Files:**

- Modify: [python/mirage/resource/gslides/prompt.py](python/mirage/resource/gslides/prompt.py)
- Create: `python/tests/resource/gslides/test_prompt.py`

Skeleton:

```
gslide.json structure (matches the Google Slides API presentations.get response):
  {
    "presentationId": "...",
    "title": "...",
    "pageSize": { "width": {...}, "height": {...} },
    "slides": [
      {                                      # one element per slide
        "objectId": "...",
        "pageElements": [
          {
            "objectId": "...",
            "shape": {
              "shapeType": "TEXT_BOX",
              "text": {
                "textElements": [
                  { "textRun": { "content": "the actual text\n",
                                 "style": {...} } }
                ]
              }
            }
          },
          { "image": {...} },
          { "table": {...} }
        ]
      }
    ],
    "masters": [...],
    "layouts": [...]
  }

Useful jq paths:
  .title
  .slides | length                                                # slide count
  .slides[].pageElements[].shape.text.textElements[].textRun.content  # all text
  .slides[0].objectId
```

Test pins the same things (buckets section + structure + the text-extraction jq path).

Commit:

```bash
git commit -m "docs(gslides): expand prompt with filename, buckets, JSON structure, jq paths"
```

______________________________________________________________________

## Phase 3 — gmail (different shape)

Gmail's `cat` returns a **processed** dict, not the raw Gmail API response. The prompt must NOT claim it matches the API. Use a different lead-in.

### Task 3.1: gmail prompt

**Files:**

- Modify: [python/mirage/resource/gmail/prompt.py](python/mirage/resource/gmail/prompt.py)
- Create: `python/tests/resource/gmail/test_prompt.py`

```
{prefix}
  <label>/
    <yyyy-mm-dd>/
      <subject>__<message-id>.gmail.json
      <subject>__<message-id>/    # if attachments exist
        <attachment-filename>

  Path: <label>/<yyyy-mm-dd>/<subject>__<message-id>.gmail.json
    <label>       Gmail label (INBOX, SENT, DRAFT, IMPORTANT, STARRED,
                  TRASH, SPAM, or any user label)
    <yyyy-mm-dd>  date the message was received, used for date narrowing
                  (ls /gmail/INBOX/2026-05-03/ pushes after:/before: into the
                  Gmail query — much cheaper than scanning the whole label)
    <subject>     sanitized subject line
    <message-id>  Gmail message ID

  gmail.json structure (mirage-processed, NOT the raw Gmail API response):
    {
      "id": "...",
      "thread_id": "...",
      "from":    { "name": "...", "email": "..." },
      "to":      [ { "name": "...", "email": "..." } ],
      "cc":      [ ... ],
      "subject": "...",
      "date":    "Mon, 3 May 2026 10:00:00 -0700",
      "body_text": "decoded plain-text body",
      "snippet":   "first ~200 chars from Gmail",
      "labels":  [ "INBOX", "IMPORTANT", ... ]
    }

  Attachments live in a sibling directory named after the message file
  (without the .gmail.json extension); cat returns raw bytes.

  Useful jq paths:
    .subject
    .from.email
    .body_text
    .labels[]
```

No `owned/shared` block — Gmail doesn't have it.

Test pins: label list, "mirage-processed", `.body_text`, the date-narrowing note.

Commit:

```bash
git commit -m "docs(gmail): expand prompt with path anatomy, processed JSON shape, jq paths"
```

______________________________________________________________________

## Phase 4 — gdrive (umbrella, links to others)

gdrive is the umbrella mount: directories mirror Drive folders, files can be `.gdoc.json` / `.gsheet.json` / `.gslide.json` (delegated to those readers) or arbitrary binaries.

### Task 4.1: gdrive prompt

**Files:**

- Modify: [python/mirage/resource/gdrive/prompt.py](python/mirage/resource/gdrive/prompt.py)
- Create: `python/tests/resource/gdrive/test_prompt.py`

```
{prefix}
  Mirrors Google Drive folder hierarchy. May contain:
    <name>.gdoc.json    Google Docs    (cat returns gdoc.json — see /gdocs prompt)
    <name>.gsheet.json  Google Sheets  (cat returns gsheet.json — see /gsheets prompt)
    <name>.gslide.json  Google Slides  (cat returns gslide.json — see /gslides prompt)
    <other-files>       PDFs, images, etc. — cat returns raw bytes

  No owned/ vs shared/ split here: gdrive shows the user's full Drive view,
  including files shared with the user that have been added to My Drive.

  IMPORTANT: This is a remote mount. Prefer targeted reads over full scans.
  Date-prefixed globs (2026-05-*) push to a Drive modifiedTime range query.
```

Test pins: the three extensions, the cross-references to the sibling prompts, the IMPORTANT remote-mount line.

Commit:

```bash
git commit -m "docs(gdrive): cross-reference per-type structures, document Drive view scope"
```

______________________________________________________________________

## Phase 5 — Verification

### Task 5.1: Render all five and read them as an agent

```bash
./python/.venv/bin/python - <<'PY'
from mirage.resource.gdocs.prompt import PROMPT as gdocs
from mirage.resource.gsheets.prompt import PROMPT as gsheets
from mirage.resource.gslides.prompt import PROMPT as gslides
from mirage.resource.gmail.prompt import PROMPT as gmail
from mirage.resource.gdrive.prompt import PROMPT as gdrive

for name, p in [("gdocs", gdocs), ("gsheets", gsheets),
                ("gslides", gslides), ("gmail", gmail), ("gdrive", gdrive)]:
    print(f"=== /{name} ===")
    print(p.format(prefix=f"/{name}"))
    print()
PY
```

Eyeball each. Specifically check:

- Filename anatomy matches what `ls /<svc>/` actually produces (not the spec, the live output — sanitization rules can drift).
- The skeleton has no fields the API doesn't return.
- The jq paths run cleanly against a real `cat` of one file from your account.

### Task 5.2: Suite + lint

```bash
cd python && uv run pytest tests/resource/ -v --no-cov
./python/.venv/bin/pre-commit run --all-files
```

### Task 5.3: One real-life rehearsal

Mount one of the resources and ask an agent (Claude in this CLI is fine) "find every doc in `/gdocs/owned/` whose body contains 'X' and report the title". The new prompt should make this answerable without any exploratory `cat | jq keys`. If it isn't, the structure section is missing something — add it, re-commit.

______________________________________________________________________

## Notes for the implementer

- **Skeletons are documentation, not JSON.** Don't quote them as JSON; don't lint them as JSON. Do lint the `.py` file containing them.
- **Don't expand fields agents won't query.** `documentStyle: {...}` is fine. If we expand it inline, the prompt bloats and the cache thrashes.
- **Gmail doesn't get the "matches the API" line.** The processed shape is intentional — repeating that intention in the prompt prevents future drift.
- **Phase 1 first.** The next four phases copy its template. If Phase 1 has a bad call (e.g. wrong jq path syntax), it propagates.
- **Don't add a TS port in this plan.** It's deliberately Python-only — the TS prompts live elsewhere and have their own format. Capture this with a `git grep` after Phase 5 to confirm we didn't accidentally edit anything outside `python/mirage/resource/`.
