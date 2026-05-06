# TS Browser — Notion via Hosted MCP — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a `NotionResource` for the TS browser package, backed by Notion's hosted MCP server (`https://mcp.notion.com/mcp`), with read-only VFS support for the page tree and a single write command (`notion-page-create`).

**Architecture:** Mirror the layout of the existing `LinearResource`. Instead of a REST/GraphQL transport, the accessor wraps `MCPNotionTransport`, which wraps `Client` + `StreamableHTTPClientTransport` from `@modelcontextprotocol/sdk` and dispatches Notion's MCP tools (`API-post-search`, `API-retrieve-a-page`, `API-retrieve-block-children`, `API-post-page`). OAuth is consumer-supplied via `OAuthClientProvider`; we ship a `MemoryOAuthClientProvider` reference impl.

**Tech Stack:** TypeScript, vitest, pnpm workspaces, `@modelcontextprotocol/sdk` (new optional peer dep), Notion hosted MCP server, OPFS-style VFS shape (`<title>__<id>/page.json`).

**Reference design:** [docs/plans/2026-05-03-ts-notion-mcp-design.md](2026-05-03-ts-notion-mcp-design.md)

**Reference implementation to mirror:** Linear (`packages/core/src/{accessor/linear.ts, core/linear/, ops/linear/, commands/builtin/linear/}` + `packages/browser/src/resource/linear/`).

______________________________________________________________________

## Conventions for every task

- All paths are absolute from repo root.
- Run commands from `typescript/` unless noted.
- After each task: `git add -A && git commit -m "<msg>"`. No squash; one task = one commit.
- After tasks that touch `core/`: rebuild core (`pnpm --filter @struktoai/mirage-core build`) before running browser tests.
- Write tests with vitest. Inject fakes — never hit a live Notion endpoint.
- No comments in the source unless they document a non-obvious WHY (per repo CLAUDE.md).

______________________________________________________________________

## Task 1 — Add `@modelcontextprotocol/sdk` as optional peer dep

**Files:**

- Modify: `typescript/packages/core/package.json`
- Modify: `typescript/packages/browser/package.json`

**Step 1.** Add `@modelcontextprotocol/sdk` (latest stable, `^1.0.0` at minimum) to `peerDependencies` and `peerDependenciesMeta` (optional: true) and to `devDependencies` of both packages. Mirror the existing `@electric-sql/pglite` / `@neondatabase/serverless` block.

**Step 2.** From `typescript/`, run `pnpm install` and confirm no errors.

**Step 3.** Verify the package types resolve:

```bash
node --input-type=module -e "import('@modelcontextprotocol/sdk/client/index.js').then(m=>console.log(Object.keys(m)))"
```

Expected: prints `[ 'Client' ]` (or includes `Client`).

**Step 4.** Commit: `chore(notion): add @modelcontextprotocol/sdk optional peer dep`.

______________________________________________________________________

## Task 2 — `core/notion/pathing.ts`

Pure logic. No external deps.

**Files:**

- Create: `typescript/packages/core/src/core/notion/pathing.ts`
- Create: `typescript/packages/core/src/core/notion/pathing.test.ts`

**Step 1: Write failing test.** Create `pathing.test.ts` covering:

- `sanitizeTitle('Hello World')` → `'Hello World'`
- `sanitizeTitle('a/b/c')` → `'a-b-c'` (slashes replaced with `-`)
- `sanitizeTitle('  trim  ')` → `'trim'`
- `sanitizeTitle('')` → `'untitled'`
- `formatSegment({ id: 'abc123def456...', title: 'My Page' })` → `'My Page__abc123def456...'` (id is the 32-char dash-stripped form)
- `parseSegment('My Page__abc123def456789012345678901234')` → `{ title: 'My Page', id: 'abc123def456789012345678901234' }`
- `parseSegment('Page__with__multiple__sep__abc123...')` → split on the LAST `__` (last 32 chars after must be a hex-like id)
- `parseSegment('no-id')` → throws `Error` with message containing `invalid notion segment`
- `stripDashes('a-b-c-d-e')` → `'abcde'`

**Step 2:** Run `pnpm --filter @struktoai/mirage-core test src/core/notion/pathing.test.ts -- --run`. Expected: FAIL (file not found / functions undefined).

**Step 3: Implement.** Write `pathing.ts` exporting `sanitizeTitle`, `stripDashes`, `formatSegment`, `parseSegment`. Use a regex to find the last `__<32hex>` suffix.

**Step 4:** Re-run test. Expected: PASS.

**Step 5:** Commit: `feat(notion): pathing utils for <title>__<id> segments`.

______________________________________________________________________

## Task 3 — `core/notion/normalize.ts`

Pure logic. Maps Notion API shapes (which arrive as the raw JSON content of MCP tool results) to mirage's `FileStat`.

**Files:**

- Create: `typescript/packages/core/src/core/notion/normalize.ts`
- Create: `typescript/packages/core/src/core/notion/normalize.test.ts`

**Step 1: Write failing test.** Cover:

- `normalizePage({ id: 'aaa-bbb-...', last_edited_time: '2024-01-02T03:04:05.000Z', properties: { title: { title: [{ plain_text: 'Hello' }] } } })` → `{ name: 'Hello__aaabbb...', type: 'directory', modified: '...', size: null, fingerprint: 'last_edited_time' }`
- A page with no title falls back to `'untitled'`.
- A page with a `properties.Name` (database row style) is also recognized.
- `extractTitle(page)` returns the joined `plain_text` of the title property's rich_text array.

**Step 2:** Run test. Expected: FAIL.

**Step 3: Implement.** Use type guards to read the Notion shape defensively.

**Step 4:** Re-run test. Expected: PASS.

**Step 5:** Commit: `feat(notion): normalize Notion pages to mirage entries`.

______________________________________________________________________

## Task 4 — `core/notion/_client.ts` (transport)

The genuinely new infrastructure piece. Test with a fake `Client`.

**Files:**

- Create: `typescript/packages/core/src/core/notion/_client.ts`
- Create: `typescript/packages/core/src/core/notion/_client.test.ts`

**Step 1: Write failing test.** Define a `FakeMCPNotionTransport extends MCPNotionTransport` with an injected fake `Client` that records `callTool` invocations and returns canned `{ content: [{ type: 'text', text: '{...json...}' }] }` responses. Cover:

- `callTool('API-post-search', { query: '' })` invokes underlying client with the right args; returns parsed JSON.
- Tool result with `isError: true` throws `NotionMCPError` whose `message` contains the error text.
- Tool result whose first content block is `{ type: 'text', text: 'not json' }` → throws `NotionMCPError` with `failed to parse tool result`.
- Two consecutive `callTool` calls share a single `connect()` (lazy connect, called once).

**Step 2:** Run test. Expected: FAIL.

**Step 3: Implement.**

```ts
export interface NotionTransport {
  callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>
}

export class NotionMCPError extends Error { /* code, status, raw */ }

export interface MCPNotionTransportOptions {
  authProvider: OAuthClientProvider
  serverUrl?: string
}

export class MCPNotionTransport implements NotionTransport {
  protected client: Client | null = null
  private connectPromise: Promise<void> | null = null
  // ...
}
```

The class is open enough for tests to inject `client` directly. `callTool` returns the parsed JSON object from the first text content block.

**Step 4:** Re-run test. Expected: PASS.

**Step 5:** Commit: `feat(notion): MCPNotionTransport over @modelcontextprotocol/sdk`.

______________________________________________________________________

## Task 5 — `core/notion/_oauth.ts`

Reference in-memory `OAuthClientProvider` for tests/demos.

**Files:**

- Create: `typescript/packages/core/src/core/notion/_oauth.ts`
- Create: `typescript/packages/core/src/core/notion/_oauth.test.ts`

**Step 1: Write failing test.** Cover:

- `provider.saveTokens({ access_token: 'x', token_type: 'Bearer' })` → subsequent `provider.tokens()` returns `{ access_token: 'x', ... }`.
- `provider.clearTokens()` → `provider.tokens()` returns `undefined`.
- `provider.redirectToAuthorization(url)` invokes the constructor's `redirect` callback with the URL.

**Step 2:** Run test. Expected: FAIL.

**Step 3: Implement** `MemoryOAuthClientProvider` with constructor `{ clientMetadata, redirect: (url: URL) => void | Promise<void> }`. Stores tokens, code verifier, and client info in instance fields.

**Step 4:** Re-run test. Expected: PASS.

**Step 5:** Commit: `feat(notion): MemoryOAuthClientProvider reference impl`.

______________________________________________________________________

## Task 6 — `core/notion/pages.ts` (tool-call helpers)

**Files:**

- Create: `typescript/packages/core/src/core/notion/pages.ts`
- Create: `typescript/packages/core/src/core/notion/pages.test.ts`

**Step 1: Write failing test.** Use a fake `NotionTransport` (just an object with a stub `callTool`). Cover:

- `searchTopLevelPages(transport)` calls `'API-post-search'` with `{ filter: { value: 'page', property: 'object' }, page_size: 100 }`, paginates via `next_cursor`, returns flat list filtered to `parent.type === 'workspace'`.
- `getPage(transport, id)` calls `'API-retrieve-a-page'` with `{ page_id: id }`.
- `getChildBlocks(transport, id)` paginates `'API-retrieve-block-children'` and returns all blocks.
- `getChildPages(transport, parentId)` calls `getChildBlocks` and filters where `type === 'child_page'`, returning `{ id, title }` records.
- `createPage(transport, { parent: { type: 'workspace' } | { type: 'page_id', page_id }, title })` calls `'API-post-page'` with the right body.

**Step 2:** Run. Expected: FAIL.

**Step 3: Implement** each helper. Pagination loop pattern: `start_cursor = result.next_cursor` while `result.has_more`.

**Step 4:** Re-run. Expected: PASS.

**Step 5:** Commit: `feat(notion): tool-call helpers for pages/blocks/search`.

______________________________________________________________________

## Task 7 — `core/notion/readdir.ts`

**Files:**

- Create: `typescript/packages/core/src/core/notion/readdir.ts`
- Create: `typescript/packages/core/src/core/notion/readdir.test.ts`

**Step 1: Write failing test.** Build a fake transport that returns:

- For `API-post-search`: two top-level pages.
- For `API-retrieve-block-children` on a known id: two child pages + one inline block.

Cover:

- `readdir('/')` → `['Top1__<id1>', 'Top2__<id2>']` (sorted by name, no `page.json` at root).
- `readdir('/Top1__<id1>/')` → `['page.json', 'Child1__<cid1>', 'Child2__<cid2>']` — `page.json` always first.
- `readdir('/missing__nopage/')` throws `ENOENT`.
- The index cache is populated with one entry per result, with `remoteTime` from `last_edited_time`.

**Step 2:** Run. Expected: FAIL.

**Step 3: Implement.** Mirror `core/linear/readdir.ts` shape. Accept `(accessor, path, indexCache?)`. Use `pathing.parseSegment` to extract the page id from the last directory segment.

**Step 4:** Re-run. Expected: PASS.

**Step 5:** Commit: `feat(notion): readdir for root and page subtrees`.

______________________________________________________________________

## Task 8 — `core/notion/read.ts`

**Files:**

- Create: `typescript/packages/core/src/core/notion/read.ts`
- Create: `typescript/packages/core/src/core/notion/read.test.ts`

**Step 1: Write failing test.** Cover:

- `read(accessor, '/Page__<id>/page.json', cache)` returns UTF-8 bytes of `JSON.stringify({ page: <api>, blocks: [<b1>, <b2>] }, null, 2)`.
- Reading any path that does not end in `/page.json` throws `ENOENT`.
- Reading a non-existent page id throws `ENOENT` (caller propagates whatever `getPage` throws — wrap into ENOENT if it's a Notion 404).

**Step 2:** Run. Expected: FAIL.

**Step 3: Implement.** Parse path → page id → `getPage` + `getChildBlocks` → JSON stringify → encode.

**Step 4:** Re-run. Expected: PASS.

**Step 5:** Commit: `feat(notion): read renders page+blocks JSON`.

______________________________________________________________________

## Task 9 — `core/notion/stat.ts`

**Files:**

- Create: `typescript/packages/core/src/core/notion/stat.ts`
- Create: `typescript/packages/core/src/core/notion/stat.test.ts`

**Step 1: Write failing test.** Cover:

- `stat('/')` → `{ name: '', type: 'directory', size: null, modified: null }`.
- `stat('/Page__<id>/')` → `{ type: 'directory', name: 'Page__<id>', modified: <iso>, size: null }`. Uses `getPage` if cache miss; uses cache if present.
- `stat('/Page__<id>/page.json')` → `{ type: 'file', name: 'page.json', modified: <iso>, size: <bytes> }`. The size is the byte length of the rendered JSON.
- `stat('/missing__nope/')` → throws `ENOENT`.

**Step 2:** Run. Expected: FAIL.

**Step 3: Implement.** Mirror `core/linear/stat.ts`.

**Step 4:** Re-run. Expected: PASS.

**Step 5:** Commit: `feat(notion): stat for root, page dirs, and page.json`.

______________________________________________________________________

## Task 10 — `core/notion/glob.ts`

Minimal: walk the tree using `readdir`. No server-side pushdown.

**Files:**

- Create: `typescript/packages/core/src/core/notion/glob.ts`
- Create: `typescript/packages/core/src/core/notion/glob.test.ts`

**Step 1: Write failing test.** Cover:

- `resolveNotionGlob(accessor, [PathSpec('/')])` → returns the same path as a directory PathSpec (no expansion).
- `resolveNotionGlob(accessor, [PathSpec('/Top*/page.json')])` → expands by listing root, matching directory names against `Top*`, then descending.
- An unmatched glob → returns `[]`.

**Step 2:** Run. Expected: FAIL.

**Step 3: Implement.** Reuse the helper pattern from `core/linear/glob.ts`. Pattern matching via the existing `PathSpec.pattern` API; recursive `**` is supported by recursing across child page dirs.

**Step 4:** Re-run. Expected: PASS.

**Step 5:** Commit: `feat(notion): glob walker over the page tree`.

______________________________________________________________________

## Task 11 — `accessor/notion.ts`

**Files:**

- Create: `typescript/packages/core/src/accessor/notion.ts`

**Step 1.** Write `NotionAccessor extends Accessor` constructor `(transport: NotionTransport)`. Mirror `accessor/linear.ts` exactly. Also export `NotionResourceLike extends Resource { readonly accessor: NotionAccessor }`.

**Step 2.** Confirm core typecheck: `pnpm --filter @struktoai/mirage-core typecheck`. Expected: pass.

**Step 3.** Commit: `feat(notion): NotionAccessor wrapping NotionTransport`.

______________________________________________________________________

## Task 12 — `ops/notion/`

**Files:**

- Create: `typescript/packages/core/src/ops/notion/read.ts`
- Create: `typescript/packages/core/src/ops/notion/readdir.ts`
- Create: `typescript/packages/core/src/ops/notion/stat.ts`
- Create: `typescript/packages/core/src/ops/notion/index.ts`

**Step 1.** Mirror `ops/linear/{read,readdir,stat,index}.ts` exactly. Swap `LinearAccessor` → `NotionAccessor`, swap `core/linear/` imports → `core/notion/`, swap `ResourceName.LINEAR` → `ResourceName.NOTION`. Export `NOTION_VFS_OPS = [readdirOp, readOp, statOp] as const`.

**Step 2.** `pnpm --filter @struktoai/mirage-core typecheck`. Expected: pass.

**Step 3.** Commit: `feat(notion): VFS ops registration`.

______________________________________________________________________

## Task 13 — `commands/builtin/notion/notion_page_create.ts`

The single Notion-specific write command.

**Files:**

- Create: `typescript/packages/core/src/commands/builtin/notion/notion_page_create.ts`
- Create: `typescript/packages/core/src/commands/builtin/notion/notion_page_create.test.ts`

**Step 1: Write failing test.** Cover:

- Invoking the command with `paths=[PathSpec('/')]`, `texts=['My New Page']` calls `createPage` with `{ parent: { type: 'workspace' }, title: 'My New Page' }`.
- Invoking with `paths=[PathSpec('/Existing__<id>/')]`, `texts=['Sub Page']` calls `createPage` with `{ parent: { type: 'page_id', page_id: '<id>' }, title: 'Sub Page' }`.
- Missing `texts[0]` (title) throws `Error('title is required')`.
- A returned page is normalized via `normalize.ts` and emitted as JSON bytes.

**Step 2:** Run. Expected: FAIL.

**Step 3: Implement.** `command({ name: 'notion-page-create', resource: ResourceName.NOTION, spec: SPEC, fn, write: true })`. Use `OperandKind.PATH` for parent and `OperandKind.TEXT` for title.

**Step 4:** Re-run. Expected: PASS.

**Step 5:** Commit: `feat(notion): notion-page-create command`.

______________________________________________________________________

## Task 14 — `commands/builtin/notion/` standard FS suite (boilerplate)

Mechanical copy of Linear's standard FS commands.

**Files:**

- Create: `typescript/packages/core/src/commands/builtin/notion/{_input,_provision,basename,cat,dirname,find,grep,head,jq,ls,realpath,rg,stat,tail,tree,wc}.ts`
- Create: `typescript/packages/core/src/commands/builtin/notion/index.ts`

**Step 1.** For each filename above, copy the Linear file verbatim, then sed:

- `LinearAccessor` → `NotionAccessor`
- `accessor/linear.ts` → `accessor/notion.ts`
- `core/linear/` → `core/notion/`
- `ResourceName.LINEAR` → `ResourceName.NOTION`
- `LINEAR_<NAME>` → `NOTION_<NAME>`
- Drop `_input.ts`'s reference to GraphQL — it should already be transport-agnostic; if it imports from `core/linear/_client.ts`, swap the type.

**Step 2.** `index.ts` exports `NOTION_COMMANDS = [...NOTION_LS, ...NOTION_TREE, ...NOTION_CAT, ...NOTION_HEAD, ...NOTION_TAIL, ...NOTION_WC, ...NOTION_FIND, ...NOTION_GREP, ...NOTION_RG, ...NOTION_STAT, ...NOTION_JQ, ...NOTION_BASENAME, ...NOTION_DIRNAME, ...NOTION_REALPATH, ...NOTION_PAGE_CREATE]`.

**Step 3.** `pnpm --filter @struktoai/mirage-core typecheck`. Expected: pass.

**Step 4.** `pnpm --filter @struktoai/mirage-core test src/commands/builtin/notion/ -- --run`. Expected: only the page_create test exists; passes.

**Step 5.** Commit: `feat(notion): standard FS command suite bound to NotionAccessor`.

______________________________________________________________________

## Task 15 — `resource/notion/prompt.ts`

**Files:**

- Create: `typescript/packages/core/src/resource/notion/prompt.ts`

**Step 1.** Port the Python prompts verbatim:

```ts
export const NOTION_PROMPT = `{prefix}
  <page-title>__<page-id>/
    page.json
    <child-page-title>__<child-id>/
      page.json
  Hierarchical page tree. cat shows page content as JSON.`

export const NOTION_WRITE_PROMPT = `  Write commands:
    notion-page-create <parent-path> "title"`
```

**Step 2.** Commit: `feat(notion): resource prompt`.

______________________________________________________________________

## Task 16 — Browser `resource/notion/config.ts`

**Files:**

- Create: `typescript/packages/browser/src/resource/notion/config.ts`

**Step 1.** Define:

```ts
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'

export interface NotionConfig {
  authProvider: OAuthClientProvider
  serverUrl?: string
}

export interface NotionConfigRedacted {
  serverUrl: string | null
}

export function redactNotionConfig(config: NotionConfig): NotionConfigRedacted {
  return { serverUrl: config.serverUrl ?? null }
}
```

**Step 2.** `pnpm --filter @struktoai/mirage-browser typecheck`. Expected: pass.

**Step 3.** Commit: `feat(notion): browser config + redactor`.

______________________________________________________________________

## Task 17 — Browser `resource/notion/notion.ts`

**Files:**

- Create: `typescript/packages/browser/src/resource/notion/notion.ts`
- Create: `typescript/packages/browser/src/resource/notion/notion.test.ts`

**Step 1: Write failing test.** Cover:

- Constructing `new NotionResource(config)` produces a resource with `kind === 'notion'`, `isRemote === true`, `prompt === NOTION_PROMPT`.
- `getState()` returns `{ type: 'notion', needsOverride: true, redactedFields: [], config: { serverUrl: null } }` for default config.
- `commands()` returns `NOTION_COMMANDS`.
- `ops()` returns `NOTION_VFS_OPS`.

**Step 2:** Run. Expected: FAIL.

**Step 3: Implement.** Mirror `LinearResource` shape: implements `Resource`, holds `accessor`, `index`, delegates `readFile/readdir/stat/glob/fingerprint` to core helpers. The constructor wires `MCPNotionTransport(config.authProvider, config.serverUrl)` into `NotionAccessor`.

**Step 4:** Re-run. Expected: PASS.

**Step 5:** Commit: `feat(notion): NotionResource for the browser package`.

______________________________________________________________________

## Task 18 — Wire core `index.ts` exports

**Files:**

- Modify: `typescript/packages/core/src/index.ts`

**Step 1.** Find the existing Linear export block. Add a parallel Notion block:

```ts
export { NotionAccessor, type NotionResourceLike } from './accessor/notion.ts'
export {
  MCPNotionTransport,
  NotionMCPError,
  type NotionTransport,
  type MCPNotionTransportOptions,
} from './core/notion/_client.ts'
export { MemoryOAuthClientProvider } from './core/notion/_oauth.ts'
export { read as notionRead } from './core/notion/read.ts'
export { readdir as notionReaddir } from './core/notion/readdir.ts'
export { stat as notionStat } from './core/notion/stat.ts'
export { resolveNotionGlob } from './core/notion/glob.ts'
export { NOTION_PROMPT, NOTION_WRITE_PROMPT } from './resource/notion/prompt.ts'
export { NOTION_COMMANDS } from './commands/builtin/notion/index.ts'
export { NOTION_VFS_OPS } from './ops/notion/index.ts'
```

**Step 2.** `pnpm --filter @struktoai/mirage-core build`. Expected: success.

**Step 3.** Commit: `feat(notion): core barrel exports`.

______________________________________________________________________

## Task 19 — Wire browser `index.ts` exports

**Files:**

- Modify: `typescript/packages/browser/src/index.ts`

**Step 1.** Add:

```ts
export { NotionResource, type NotionResourceState } from './resource/notion/notion.ts'
export {
  redactNotionConfig,
  type NotionConfig,
  type NotionConfigRedacted,
} from './resource/notion/config.ts'
```

**Step 2.** `pnpm --filter @struktoai/mirage-browser build`. Expected: success.

**Step 3.** Commit: `feat(notion): browser barrel exports`.

______________________________________________________________________

## Task 20 — Wire browser `resource/registry.ts`

**Files:**

- Modify: `typescript/packages/browser/src/resource/registry.ts`
- Modify: `typescript/packages/browser/src/resource/registry.test.ts`

**Step 1: Write failing test.** Add a case:

```ts
it('builds a NotionResource from config', () => {
  const r = buildResource({
    type: 'notion',
    config: { authProvider: new MemoryOAuthClientProvider({ clientMetadata: {...}, redirect: () => {} }) },
  })
  expect(r.kind).toBe('notion')
})
```

**Step 2:** Run test. Expected: FAIL ("unknown resource type 'notion'").

**Step 3:** Add a registration entry mirroring the Linear one.

**Step 4:** Re-run. Expected: PASS.

**Step 5:** Commit: `feat(notion): register NotionResource in browser registry`.

______________________________________________________________________

## Task 21 — Final verification

**Step 1.** Rebuild core:

```bash
pnpm --filter @struktoai/mirage-core build
```

Expected: ESM + DTS build success.

**Step 2.** Run all core tests:

```bash
pnpm --filter @struktoai/mirage-core test
```

Expected: all previous tests pass + new Notion tests pass.

**Step 3.** Run all browser tests:

```bash
pnpm --filter @struktoai/mirage-browser test
```

Expected: 43+ files passing, no regressions.

**Step 4.** Lint/format pre-commit:

```bash
cd /Users/zecheng/strukto/mirage/.worktrees/ts-notion-mcp
./python/.venv/bin/pre-commit run --all-files
```

If `pre-commit` is not installed in the worktree's Python venv, skip with a note — this is a TS-only change, so Python checks aren't strictly required. (The repo CLAUDE.md notes pre-commit covers TS too via separate hooks; if those exist they run.)

**Step 5.** Commit any formatting fixups.

**Step 6.** Self-review against [docs/plans/2026-05-03-ts-notion-mcp-design.md](2026-05-03-ts-notion-mcp-design.md) and the open questions section. Note any deviations.

______________________________________________________________________

## Out-of-scope reminders

- No block append, comment add, or page update commands.
- No database support.
- No live OAuth integration test — consumer-supplied `OAuthClientProvider` is exercised only via the `MemoryOAuthClientProvider` reference impl.
- No MCP transport extracted to a shared module yet — that comes when a second integration follows the same pattern.
