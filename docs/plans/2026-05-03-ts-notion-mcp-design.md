# TS Browser — Notion via Hosted MCP

Date: 2026-05-03
Status: Design

## Background

Python mirage has a Notion resource (`python/mirage/{accessor,resource,core,ops,commands/builtin}/notion/`). It models Notion as a hierarchical page tree (`<title>__<id>/page.json`) and talks directly to `api.notion.com/v1` via aiohttp + Bearer token.

The TS browser package has no Notion resource. Every existing TS resource (Linear, Slack, Discord, GDocs, …) uses a direct REST/GraphQL transport over `globalThis.fetch`. For CORS-blocked APIs (Slack, Discord), the browser variant takes a user-provided `proxyUrl` and routes all traffic through that proxy.

Notion's REST API does not support browser CORS and is unlikely to. Following the Slack pattern would require every consumer to deploy their own proxy. That is permanent friction for a feature that has a better answer available.

Notion ships a hosted MCP server at `https://mcp.notion.com/mcp` that uses Streamable HTTP transport with CORS enabled and OAuth-based auth. It is built for direct in-browser clients. We adopt it.

## Goals

- Notion resource usable from the TS browser package with no proxy.
- Read: page tree (`readdir`), page content (`read /…/page.json` returns JSON), `stat`.
- Write: `notion-page-create <parent-path> "title"` only. (Skip `notion-block-append` and `notion-comment-add` for this pass.)
- Auth via OAuth — no API key in browser config. Consumer owns the redirect UI; we accept an `OAuthClientProvider` from `@modelcontextprotocol/sdk`.

## Non-goals

- Block append, comment add, page update.
- Notion databases. Search results filter to `object: 'page'`; database rows are skipped.
- Python parity at the transport level. Python keeps REST + Bearer token.
- A built-in OAuth UI. We are a library, not a UI framework.

## Architecture

### Package layout

```
typescript/packages/core/src/
  core/notion/
    _client.ts          MCPNotionTransport (wraps @modelcontextprotocol/sdk Client)
    _oauth.ts           MemoryOAuthClientProvider reference implementation
    pathing.ts          parse "<title>__<id>" segments → ids; sanitize titles
    pages.ts            tool-call helpers: searchTopLevel, getPage, getChildren, createPage
    readdir.ts
    read.ts
    stat.ts
    glob.ts             walks the tree on demand via repeated readdirs
    normalize.ts        Notion API shapes → mirage entry shape
  accessor/notion.ts    NotionAccessor wraps NotionTransport (parallels LinearAccessor)
  ops/notion/           NOTION_VFS_OPS registration
  commands/builtin/notion/
    page_create.ts
    index.ts            NOTION_COMMANDS = [pageCreate]
  resource/notion/prompt.ts

typescript/packages/browser/src/
  resource/notion/
    config.ts           NotionConfig, NotionConfigRedacted, redactNotionConfig
    notion.ts           NotionResource
```

### Dependency

`@modelcontextprotocol/sdk` is added as an **optional peer dep** in `packages/browser/package.json` and `packages/core/package.json`, mirroring the existing `@electric-sql/pglite` and `@neondatabase/serverless` pattern. Consumers who do not use Notion do not pay the install cost.

### Server endpoint

Defaults to `https://mcp.notion.com/mcp`. Overridable via `NotionConfig.serverUrl` for self-hosted or staging.

## Auth

```ts
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'

interface NotionConfig {
  authProvider: OAuthClientProvider
  serverUrl?: string
}
```

The consumer app implements `OAuthClientProvider` and is responsible for:

- The popup/redirect to Notion's authorize endpoint.
- The redirect-callback handler in their app.
- Token storage (localStorage, IndexedDB, etc.).

Same posture as the Slack browser resource accepting a `getHeaders` callback rather than owning auth.

We ship `MemoryOAuthClientProvider` in `core/notion/_oauth.ts` — an in-memory reference implementation suitable for tests and quick demos. Production consumers replace it.

## Transport

`MCPNotionTransport` (in `core/notion/_client.ts`):

1. Constructs `Client` + `StreamableHTTPClientTransport({ authProvider, url })`.
1. Lazily calls `client.connect()` on first request.
1. Exposes `callTool(name, args)`, returning the tool's structured `content` payload or throwing on `isError`.
1. Tests inject a fake `Client` via the same indirection pattern Slack uses (`protected client = …`).

`StreamableHTTPClientTransport` uses standard browser `fetch` + `EventSource`. No bundler shims needed.

## VFS mapping

Path shape (mirrors Python):

```
/                                    root
  <sanitized-title>__<page-id>/      top-level page
    page.json                        page content
    <child-title>__<child-id>/       nested page
      page.json
      …
```

`<sanitized-title>` strips `/` and trims whitespace. `<page-id>` is the 32-char Notion id without dashes.

| VFS op                                     | Notion MCP tool(s)                                    | Notes                                                                                                               |
| ------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `readdir('/')`                             | `API-post-search` filtered to pages, top-level only   | one round trip; returns top-level page list                                                                         |
| `readdir('/<t>__<id>/')`                   | `API-retrieve-block-children` on `<id>`               | filter children where `type === 'child_page'`; ignore inline blocks for listing                                     |
| `read('/<t>__<id>/page.json')`             | `API-retrieve-a-page` + `API-retrieve-block-children` | concatenated `{ page, blocks }` JSON                                                                                |
| `stat(…)`                                  | index cache when warm; else `API-retrieve-a-page`     | mtime = `last_edited_time`, size = byte length of rendered JSON                                                     |
| `notion-page-create <parent-path> "title"` | `API-post-page`                                       | parent inferred from path: root → `parent: { type: 'workspace' }`; otherwise `parent: { type: 'page_id', page_id }` |

### Caching

Standard `RAMIndexCacheStore` with `indexTtl: 600` (parity with Linear). Each `readdir` populates the index with `{ name, remoteTime: last_edited_time, size }` so subsequent `stat` is free.

### Glob

`resolveNotionGlob` walks the tree on demand via repeated readdirs. Notion's API does not support server-side globbing, so no pushdown.

## Resource class

`NotionResource` (in `packages/browser/src/resource/notion/notion.ts`) follows the `LinearResource` shape:

- `kind = ResourceName.NOTION`, `isRemote = true`, `indexTtl = 600`.
- `prompt = NOTION_PROMPT`, `writePrompt = NOTION_WRITE_PROMPT`.
- Constructs `MCPNotionTransport` from config, wraps in `NotionAccessor`, holds a `RAMIndexCacheStore`.
- `commands()` returns `NOTION_COMMANDS`, `ops()` returns `NOTION_VFS_OPS`.
- `readFile`, `readdir`, `stat`, `glob`, `fingerprint` delegate to the core helpers.
- `getState` returns `{ type, needsOverride: true, redactedFields: [], config: redactNotionConfig(this.config) }`. `needsOverride` is `true` because `authProvider` is non-serializable and must be re-injected on rehydrate. `redactedFields` is empty since no secrets live in config.

## Registry & exports

### `packages/core/src/index.ts`

Re-export `NotionAccessor`, `MCPNotionTransport`, `MemoryOAuthClientProvider`, `NOTION_PROMPT`, `NOTION_WRITE_PROMPT`, `NOTION_COMMANDS`, `NOTION_VFS_OPS`, `notionRead`, `notionReaddir`, `notionStat`, `resolveNotionGlob`. Add `ResourceName.NOTION`.

### `packages/browser/src/index.ts`

Add `NotionResource`, `NotionResourceState`, `NotionConfig`, `NotionConfigRedacted`, `redactNotionConfig`.

### `packages/browser/src/resource/registry.ts`

Register `'notion'` → factory that builds `NotionResource` from config.

## Testing

No live Notion API in tests. All tool calls go through an injected fake `Client`.

- `core/notion/pathing.test.ts` — title sanitization, id parsing, edge cases (titles containing `__`, missing ids).
- `core/notion/normalize.test.ts` — Notion API shapes → mirage entry shape.
- `core/notion/_client.test.ts` — fake `Client` injection; verifies tool args, error mapping, retry on auth errors.
- `core/notion/readdir.test.ts`, `read.test.ts`, `stat.test.ts` — fixture-driven against the fake transport.
- `commands/builtin/notion/page_create.test.ts` — parent path resolution (root vs nested), error on missing parent.
- `resource/notion/notion.test.ts` (browser package) — wires the resource, asserts `getState` redaction shape.

## Open questions

- Whether `read` should fetch all blocks via paginated `API-retrieve-block-children`, or cap at a configurable depth. Default in this design: fetch all blocks for the requested page only (no recursive child-page expansion in the JSON). Child pages still appear as directories.
- Whether `MemoryOAuthClientProvider` lives in core (importable everywhere) or only in browser. Default: core, since it has no DOM dependencies.

## Future work

- Block append, comment add, page update.
- Notion databases as a parallel `<db-title>__<db-id>/rows/<row-id>.json` tree.
- Hosted-MCP transport extracted to a shared `core/_mcp/` module if a second integration (Slack hosted MCP, Atlassian, etc.) follows the same pattern.
