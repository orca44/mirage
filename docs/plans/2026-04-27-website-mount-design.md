# Website-as-Filesystem Mount: Design

**Status:** Design (pre-implementation). Validated through brainstorming on 2026-04-27.

**Goal:** Let MIRAGE mount any website (and eventually any inspectable UI surface) as a navigable filesystem so that LLM agents — which are excellent at `ls` / `cat` / `./script` — can interact with the web through the same shell-shaped primitives they already master.

**Non-goals:**

- Replacing browser automation libraries for non-agent use cases.
- Authenticated / transactional flows (login, checkout, multi-step forms). Deferred past v1.
- Cross-origin iframe deep traversal. Limited to what browser-use already supports.
- Persisted sessions across MIRAGE process restarts.

## Use cases in scope

**A. Read-dominant scraping / research.** Agent fetches a URL and reads content. Occasional clicks for cookie banners, "show more," pagination — most absorbed transparently into the static fetch layer.

**B. Open-ended exploration.** Agent navigates a site like a human would: click around, type into search, scroll. State changes are expected; agent reasons about them.

Out-of-scope for v1: form submission with credentials, multi-step transactions, file uploads.

## Core architecture

**Single mount type. Live browser session. RAM-disk semantics.**

```
mirage mount website /web
```

The mount is volatile and ephemeral. Its lifecycle is the lifecycle of the mount itself; unmounting destroys all state. This collapses several would-be design questions: no session GC, no naming, no persistence, no resume-vs-new dispatch.

Reads are *honest* about state. `cat content.md` returns the current page. `ls clickables/` returns the current set of interactive elements. After an action, both reflect the new state. The path advertises "you're in stateful territory" — the agent doesn't need to be lied to about it.

If an agent wants two parallel browsers, it mounts twice at different paths.

### Filesystem layout

```
/web/example.com/                       # mount root = session root
  content.md                            # current page, readability-extracted
  page.png                              # lazy screenshot
  meta.json                             # url, title, status, og:*
  source.html                           # raw markup

  goto*                                 # ./goto https://...
  back*
  forward*
  reload*
  scroll*                               # ./scroll up | down [pixels]
  click-at*                             # ./click-at X Y   (canvas/spatial fallback)

  clickables/
    0-search-button*                    # ./clickables/0-search-button
    0-search-button.png                 # element screenshot hint
    0-search-button.txt                 # accessible label
    1-login-link*
    ...

  inputs/
    search-box*                         # ./search-box "text"  or  cat | ./search-box
    search-box.txt                      # current DOM value
```

If an agent doesn't call any executables, the mount behaves identically to a "read-only static fetch" — same URL fetched, same content returned. The action surface is opt-in.

### What's NOT a separate tier

An earlier draft proposed a separate `website-cache` tier for persistent, multi-mount caching. Cut: the live mount handles single-URL reads correctly already, and persistence-across-mounts is solvable later (wrapper, or write to a disk-backed MIRAGE backend). A real site-mirror tool (wget-style pre-crawl producing a blob for RAG/batch research) is a different shape — different consumer, different lifecycle — and is more naturally a *populator* for an existing storage backend than a MIRAGE backend itself.

## Action surface — minimal opinionated set

Reads and executables only. No write-to-trigger, no schema sidecars, no atomic form executables. v1 ships with **eight verbs**:

| Verb           | Form                           | Purpose                                    |
| -------------- | ------------------------------ | ------------------------------------------ |
| `goto`         | `./goto <url>`                 | Navigate to URL                            |
| `back`         | `./back`                       | History back                               |
| `forward`      | `./forward`                    | History forward                            |
| `reload`       | `./reload`                     | Reload current page                        |
| `scroll`       | `./scroll up\|down [px]`       | Scroll viewport                            |
| `click-at`     | `./click-at X Y`               | Spatial click (canvas / AX-empty fallback) |
| `clickables/N` | `./clickables/N`               | Semantic click on indexed element          |
| `inputs/N`     | `./inputs/N "text"` or `stdin` | Type into indexed input (polymorphic)      |

Each executable returns:

- **Exit code** — 0 = success, non-zero = failure (element gone, timeout, navigation error). stderr explains.
- **Stdout** — small JSON status: `{url, title, navigated, dom_changed, modal}`. Agent parses to decide whether to re-`cat content.md` or re-`ls clickables/`.

## Perception backend

**Use browser-use's perception modules. Skip its agent loop.**

```python
from browser_use.dom.service import DomService
from browser_use.actor.mouse import Mouse
from browser_use.screenshots.service import ScreenshotService
# explicitly NOT imported: browser_use.agent, .controller, .llm
```

What this gives us for free:

- Merged AX tree + DOM snapshot perception (catches elements pure-AX misses).
- `ClickableElementDetector` heuristics for `<div onclick>` cases.
- Paint-order + viewport-threshold visibility filtering.
- iframe traversal with depth/count limits.
- Hidden-in-iframe scroll hints.
- CDP-based coordinate clicks + scroll for the spatial surface.
- Screenshot capture.

What we deliberately don't pull in:

- The LLM agent loop (we *are* below the agent).
- LangChain / OpenAI / Anthropic provider deps.
- High-level controllers and tool registries.

### Dual surface: semantic + spatial

The FS exposes both interaction modes simultaneously. The agent picks based on what's available:

- `ls clickables/` non-empty → use semantic surface (`./clickables/N`).
- `clickables/` empty (canvas, WebGL, AX-poor SPA) → fall back to spatial: `cat page.png` → vision-decide → `./click-at X Y`.

A `meta.json` field surfaces capability hints: `{"semantic_clickables": 17, "spatial_only": false}`.

## Cross-platform abstraction (forward-compatible)

The FS layer reads a normalized `UIElement` tree. Browser-use is one Perceiver. macOS Accessibility (AX) is a future Perceiver with the same shape.

```ts
type UIElement = {
  id: string                     // backend-stable handle
  role: 'button' | 'link' | 'textfield' | 'list' | ...   // ARIA / AX aligned
  label: string
  value?: string
  children?: UIElement[]
  bounds?: { x, y, w, h }
  actions: ('press' | 'type' | 'showMenu' | ...)[]
}

interface Perceiver { snapshot(): Promise<UIElement> }
interface Actuator  { act(id, action, payload?): Promise<void> }
```

ARIA web roles and macOS AX roles align ~1:1 by design (W3C and Apple cross-pollinated for screen-reader compatibility). Same FS renderer works for both.

**v1 ships browser-use Perceiver only.** The Perceiver/Actuator protocol must not bake in web-only assumptions, but no native-app implementation is delivered in v1.

## Open implementation questions

These need investigation before/during Phase 1. Not yet decided:

1. **Does MIRAGE's existing backend protocol expose executable pseudo-files** (open + read triggered by `execve`)? `/proc`-style behavior is required for `./clickables/N` to work as a real FUSE mount. If not, this is the largest implementation-feasibility question, and the answer determines whether the FS-as-shell-interface design ships at all.
1. **Concurrency model.** One CDP session per mount? Allow N parallel pages within one mount? v1 default: one page, one session, single-threaded — agents that want parallelism mount twice.
1. **Snapshot freshness.** After `./clickables/N`, when do we consider the new page "settled" enough to re-snapshot? Browser-use already has readiness logic (`networkidle` + DOM stabilization timeout) — adopt theirs unless it proves wrong.
1. **Memory cap.** RAM-disk semantics mean cached screenshots, DOM snapshots, and history accumulate in process memory. v1: bounded ring buffer for history (last 50 snapshots), screenshots evicted on navigation.

## Phased delivery plan

**Phase 0 — Feasibility check (1–2 days).** Investigate MIRAGE's backend protocol for executable pseudo-file support. If absent, scope a minimal protocol extension. Output: a 1-page memo confirming the design is buildable as specified, or proposing the protocol change required.

**Phase 1 — Walking skeleton (1 week).** Single mount type. Single browser session. Fixed verb set: `goto`, `back`, `reload`, `clickables/N`, `inputs/N`, `scroll`. No `click-at` yet. Goal: agent can mount, navigate, click, type, read content. End-to-end on three sites: a blog (server-rendered), a dashboard (React SPA), a search engine (form interaction).

**Phase 2 — Spatial fallback + screenshots (3 days).** Add lazy `page.png`, `click-at`, screenshot-per-clickable. Validate on one canvas-heavy site (e.g., a Figma share link or a maps view).

**Phase 3 — Cross-platform abstraction polish (post-v1).** Refactor the FS layer to consume `UIElement` trees from a `Perceiver` interface, with browser-use as the first concrete implementation. Document the contract for future Perceivers (macOS AX).

## What v1 gets for free (within a single mount)

These work without writing any MIRAGE-specific code and **without changing MIRAGE's mount API**:

- **Login flows** — agent navigates to login, types into `./inputs/<username>` and `./inputs/<password>`, clicks `./clickables/<submit>`. Chromium handles cookies natively.
- **Cookie + storage state** — cookies, `localStorage`, `sessionStorage`, IndexedDB all work for the mount lifetime.
- **OAuth / SSO** — completes normally as long as the IdP step happens in the same browser session.
- **Cookie-banner auto-dismissal** — browser-use ships an "I still don't care about cookies" extension by default; most banners disappear without the agent seeing them.

### Implementation note: tmp storage, not an API surface

The website backend allocates a tmp directory per mount (e.g., `~/.mirage/website/<mount-id>/`) and passes it to Chromium as `user_data_dir`. This is where cookies, localStorage, IndexedDB live during the mount lifetime. On unmount, the tmp dir is destroyed.

This is purely internal — MIRAGE's mount API is **unchanged**: `mount("website", "/web")`, same shape as every other backend. Browser-use config (`user_data_dir`, `storage_state`, profile flags) is an implementation detail of the website backend, not exposed to mount callers.

## Explicitly deferred

- **Cross-mount auth persistence.** Would require either an API change (mount-time config) or a side-channel convention (known-path auth file). Both punted past v1. If/when needed, the cleanest add-on is a `./load-cookies` executable inside the mount (`cat auth.json | ./load-cookies`) — adds no MIRAGE API surface, just another verb the website backend handles.
- Atomic form-submission executables (`forms/<name>*` with JSON schema).
- File upload, contenteditable, rich-text editors.
- Type-vs-set fast path (`--set` flag for non-JS inputs).
- Macros / recording / replay.
- Native macOS AX Perceiver implementation.
- Multi-tab within one session.
- DOM-as-FS power-user lens (`dom/` subtree exposing raw markup).

## What this design does NOT include

- Specific MIRAGE code paths or file edits — pending Phase 0 feasibility check.
- Test plan — to be written alongside Phase 1 implementation.
- API surface for Python `Workspace({...})` integration — needs a separate sketch once the backend protocol question is answered.
