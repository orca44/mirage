# TypeScript Slack Resource — Design

**Date:** 2026-04-24
**Status:** Locked, ready for implementation
**Goal:** Port the Python `SlackResource` to TypeScript so that both `@struktoai/mirage-node` and `@struktoai/mirage-browser` expose a `SlackResource` class that mounts a Slack workspace as a virtual filesystem.

______________________________________________________________________

## Why

Python's `mirage.resource.slack` lets agents browse a Slack workspace as `ls /channels`, `cat /channels/general__C123/2026-04-24.jsonl`, etc. The TS port currently has zero Slack support. Two runtime targets matter:

- **Node** — bot token in process env, direct calls to `api.slack.com`. Same security model as Python.
- **Browser** — direct calls are CORS-blocked (see prior research). Routes through a user-provided HTTP proxy that holds the bot token server-side. Proxy auth is the user's problem; Mirage just attaches headers from a callback.

______________________________________________________________________

## Filesystem layout (matches Python verbatim)

```
/                                    ← virtual root
├── channels/                        ← public + private channels
│   ├── general__C0123/              ← {sanitized_name}__{channel_id}
│   │   ├── 2026-04-24.jsonl         ← one day of messages (newest at top)
│   │   ├── 2026-04-23.jsonl
│   │   └── ...                      ← bounded to last 90 days by default
│   └── eng-team__C0456/
│       └── ...
├── dms/                             ← direct messages
│   └── alice__D0789/
│       └── 2026-04-24.jsonl
└── users/                           ← workspace members as JSON files
    ├── alice__U0AAA.json
    └── bob__U0BBB.json
```

Each `*.jsonl` file is a stream of Slack `message` objects, one per line. Each user `.json` file is a Slack `user` object. The `__id` suffix disambiguates duplicate names.

______________________________________________________________________

## Architecture

### Mirrors Python's structure 1:1, lives in `@struktoai/mirage-core`

```
typescript/packages/core/src/
├── core/slack/
│   ├── _client.ts          ← transport contract + node implementation
│   ├── _client_browser.ts  ← browser proxy implementation
│   ├── scope.ts            ← path → SlackScope dataclass
│   ├── entry.ts            ← Slack-specific IndexEntry helpers
│   ├── channels.ts         ← list_channels, list_dms
│   ├── users.ts            ← list_users
│   ├── history.ts          ← fetch messages by channel + date window
│   ├── post.ts             ← chat.postMessage
│   ├── react.ts            ← reactions.add
│   ├── search.ts           ← search.messages (requires search_token)
│   ├── readdir.ts          ← virtual directory listings
│   ├── read.ts             ← read jsonl / user json
│   ├── stat.ts             ← stat virtual paths
│   └── glob.ts             ← glob expansion against virtual dirs
├── accessor/slack.ts       ← BaseAccessor wrapping a transport
├── ops/slack/
│   ├── read.ts
│   ├── readdir.ts
│   └── stat.ts
└── commands/builtin/slack/
    ├── ls.ts cat.ts find.ts grep.ts tree.ts head.ts tail.ts
    ├── wc.ts stat.ts jq.ts basename.ts dirname.ts realpath.ts
    ├── slack_post_message.ts slack_reply_to_thread.ts
    ├── slack_search.ts slack_add_reaction.ts
    └── slack_get_users.ts slack_get_user_profile.ts
```

### Transport — the core abstraction

A single callable, runtime-agnostic:

```ts
// core/src/core/slack/_client.ts
export interface SlackTransport {
  call(endpoint: string, params?: Record<string, string>, body?: unknown): Promise<SlackResponse>
}

export type SlackResponse = { ok: true } & Record<string, unknown>

export class SlackApiError extends Error {
  constructor(public readonly endpoint: string, public readonly slackError: string) {
    super(`Slack API error (${endpoint}): ${slackError}`)
  }
}
```

If `body === undefined`, the transport does GET with `params` as query string. Otherwise POST with JSON body.

If response `.ok !== true`, throw `SlackApiError`.

#### Shared HTTP base — node and browser transports differ only in `baseUrl()` + `authHeaders()`

```ts
// core/src/core/slack/_client.ts
export abstract class HttpSlackTransport implements SlackTransport {
  protected abstract baseUrl(): string
  protected abstract authHeaders(): Promise<Record<string, string>> | Record<string, string>

  async call(endpoint: string, params?: Record<string, string>, body?: unknown): Promise<SlackResponse> {
    const url = new URL(`${this.baseUrl()}/${endpoint}`)
    if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    const auth = await this.authHeaders()
    const res = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...auth },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
    const data = await res.json() as SlackResponse
    if (!data.ok) throw new SlackApiError(endpoint, String((data as { error?: unknown }).error ?? 'unknown_error'))
    return data
  }
}

export class NodeSlackTransport extends HttpSlackTransport {
  constructor(private readonly token: string, private readonly searchToken?: string) { super() }
  protected baseUrl(): string { return 'https://slack.com/api' }
  protected authHeaders(): Record<string, string> { return { Authorization: `Bearer ${this.token}` } }
  // searchToken handled at the search.ts call site by passing an override transport
}
```

#### Browser transport — proxy URL is the new base, no token in browser

```ts
// core/src/core/slack/_client_browser.ts
export interface BrowserSlackTransportOptions {
  proxyUrl: string  // example: '/api/slack-proxy'
  getHeaders?: () => Promise<Record<string, string>> | Record<string, string>
}

export class BrowserSlackTransport extends HttpSlackTransport {
  constructor(private readonly opts: BrowserSlackTransportOptions) { super() }
  protected baseUrl(): string { return this.opts.proxyUrl.replace(/\/$/, '') }
  protected async authHeaders(): Promise<Record<string, string>> {
    return (await this.opts.getHeaders?.()) ?? {}
  }
}
```

**Result:** node and browser transports are structurally identical. Both build `${base}/${endpoint}`, both pick GET/POST by `body === undefined`, both use the same response handling. The only difference: where the request goes (`api.slack.com` vs your proxy) and what headers are attached (`Bearer ${token}` vs whatever your proxy validates).

The proxy contract (documented for users to implement themselves):

> Proxy receives `GET/POST {proxyUrl}/{endpoint}?{params}` (POST has JSON body). Proxy forwards to `https://slack.com/api/{endpoint}` adding `Authorization: Bearer <token>`. Proxy returns Slack's response JSON unmodified. Proxy MAY validate the user's request via headers from `getHeaders()`.

### Per-runtime resource shells

```ts
// node/src/resource/slack/config.ts
//
// Mirrors python/mirage/resource/slack/config.py:
//   class SlackConfig(BaseModel):
//       token: str
//       search_token: str | None = None
//
// Field naming uses TS-idiomatic camelCase. snake_case YAML/JSON configs
// (i.e. files written for Python) load via normalizeSlackConfig().
export interface SlackConfig {
  token: string
  searchToken?: string  // user token for search.messages, optional
}

/**
 * Translate Python-style snake_case keys to camelCase. Mirrors the
 * normalizeS3Config pattern.
 *
 *   search_token  ↔  searchToken
 */
export function normalizeSlackConfig(input: Record<string, unknown>): SlackConfig {
  return normalizeFields(input, { rename: { search_token: 'searchToken' } }) as unknown as SlackConfig
}

// browser/src/resource/slack/config.ts
export interface SlackConfig {
  proxyUrl: string
  getHeaders?: () => Promise<Record<string, string>> | Record<string, string>
  // searchToken NOT exposed in browser — proxy decides which token to use
  // per endpoint. Browser never holds Slack tokens directly.
}
```

Both packages export a `SlackResource` class extending a shared `core/src/resource/slack/base.ts` (or implementing the `Resource` interface directly, mirroring how S3 is structured).

The user's import looks like:

```ts
// node
import { SlackResource } from '@struktoai/mirage-node'
const r = new SlackResource({ token: process.env.SLACK_BOT_TOKEN! })

// browser
import { SlackResource } from '@struktoai/mirage-browser'
const r = new SlackResource({
  proxyUrl: '/api/slack-proxy',
  getHeaders: async () => ({ Authorization: `Bearer ${userJwt}` }),
})
```

Same class name, same VFS surface, runtime-appropriate config shape.

______________________________________________________________________

## Accessor

```ts
// core/src/accessor/slack.ts
export class SlackAccessor extends BaseAccessor {
  constructor(public readonly transport: SlackTransport) { super() }
}
```

All `core/slack/*.ts` functions take `accessor` and call `accessor.transport.call(...)`. No coupling to runtime details.

Existing accessors take a config object directly; `SlackAccessor` takes a transport instead because the transport varies per runtime. This is the only deviation from the existing pattern, and it's necessary.

______________________________________________________________________

## Test strategy

**Mock the transport.** Both runtimes inject the same `SlackTransport` interface, so every test uses a fake:

```ts
class FakeTransport implements SlackTransport {
  constructor(private readonly responses: Map<string, SlackResponse>) {}
  call(endpoint: string) { return Promise.resolve(this.responses.get(endpoint)!) }
}
```

Tests cover:

- **Unit:** each `core/slack/*.ts` function with canned transport responses.
- **Ops:** `read`, `readdir`, `stat` against a fake transport + RAM index cache.
- **Commands:** `ls /channels`, `cat /channels/x/d.jsonl`, etc. against the same fake.
- **Browser-specific:** `BrowserSlackTransport` posts the right `{ endpoint, params, body }` envelope (mock `fetch`, verify request shape).
- **Node-specific:** `NodeSlackTransport` builds the right URL + Authorization header (mock `fetch`).

**No live Slack calls.** Real-Slack integration is left to manual smoke testing, same as Python.

______________________________________________________________________

## Phased rollout

Plan will break into phases for safe checkpoints. Each phase is a separate commit batch and can be merged independently.

| Phase     | Scope                                                                                                 | Approx tasks | Approx LOC |
| --------- | ----------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| 1         | Foundation: transport, accessor, scope, errors, registry stubs                                        | 5            | ~400       |
| 2         | Read pipeline: channels/users/history → ops/read, readdir, stat → glob                                | 8            | ~700       |
| 3         | Filesystem commands: ls, cat, find, grep, tree, head, tail, wc, stat, jq, basename, dirname, realpath | 13           | ~600       |
| 4         | Slack-specific commands: post, reply, search, react, get_users, get_user_profile                      | 6            | ~300       |
| 5         | Resource classes (node + browser) + registry wiring                                                   | 3            | ~200       |
| 6         | Integration tests + docs (mintlify mdx)                                                               | 2            | ~150       |
| **Total** |                                                                                                       | **~37**      | **~2,350** |

Phase 1+2+5 alone yields a usable read-only Slack VFS in both runtimes. Phase 3 makes shell commands work. Phase 4 adds write operations. Phase 6 ships docs.

______________________________________________________________________

## Decisions (all locked)

1. **Browser proxy contract:** **path-based** — `${proxyUrl}/${endpoint}` matching Slack's URL shape. Same fetch logic as node, swap the base. Smallest divergence between transports.
1. **`searchToken` not exposed in browser config.** Browser proxy decides which token to use per endpoint. Browser never holds Slack tokens. Node config keeps `searchToken?: string` to match Python.
1. **History window:** 90-day default (matches Python). Not configurable in this iteration; add `historyDays?: number` later if anyone asks.
1. **`slack_search` command:** ported. Requires user-token; bot-token returns `not_allowed_token_type`. Python ports it anyway; we match.
1. **All 6 Slack-specific commands ported:** `slack_post_message`, `slack_reply_to_thread`, `slack_add_reaction`, `slack_get_users`, `slack_get_user_profile`, `slack_search`. Phase 4 ships all of them.

______________________________________________________________________

## Examples — mirror Python's three files 1:1

Python ships three Slack examples. TS will ship three files with the **same names** and the **same demo flow**, swapping language idioms only where unavoidable.

```
examples/typescript/slack/
├── slack.ts        ← ws.execute() shell commands (matches python/slack/slack.py)
├── slack_vfs.ts    ← patchNodeFs(ws) + node:fs (matches python/slack/slack_vfs.py)
└── slack_fuse.ts   ← FuseManager mount + node:fs (matches python/slack/slack_fuse.py)
```

| Python idiom                                              | TS equivalent                                                                    |
| --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `with Workspace(...) as ws:`                              | `try { ... } finally { await ws.close() }`                                       |
| `await ws.execute("ls /slack/")` → `await r.stdout_str()` | `await ws.execute('ls /slack/')` → `r.stdoutText`                                |
| `vos = sys.modules["os"]; vos.listdir(p)`                 | `const restore = patchNodeFs(ws); await fs.promises.readdir(p)` then `restore()` |
| `Workspace(..., fuse=True)`                               | `const fm = new FuseManager(); const mp = await fm.setup(ws)`                    |
| `os.environ["SLACK_BOT_TOKEN"]`                           | `process.env.SLACK_BOT_TOKEN`                                                    |
| `load_dotenv(".env.development")`                         | dotenv loaded by example runner script (existing convention)                     |

**Same demo flow per file** (verbatim port of Python):

- `slack.ts`: ls root → ls channels (head 5) → ls users (head 5) → pick first channel → ls dates → find a date with messages via `rg -l` → cat (head 3) → cat user profile → stat → wc -l → head/tail → grep → rg directory scan → jq → tree → find → pwd/cd/relative → glob expansion. Mirrors Python `slack.py` section-for-section.
- `slack_vfs.ts`: `patchNodeFs(ws)` → `fs.readdir('/slack')` → `fs.readdir('/slack/channels')` → pick channel containing "general" → `fs.readdir(dates)` → walk recent dates with `fs.readFile`, parse jsonl, print first 3 messages. Includes `/.sessions` observer log readout and `ws.ops.records` stats. Mirrors `slack_vfs.py`.
- `slack_fuse.ts`: `FuseManager().setup(ws)` → use real `node:fs/promises` against `${mp}/slack/...` → same demo (channels/dates/messages, then users JSON read). Includes the "open another terminal" hint mirroring Python's `input()` pause. Mirrors `slack_fuse.py`.

**Browser example (additional, no Python counterpart):**

```
examples/typescript/slack/slack_browser.ts   ← uses BrowserSlackTransport via @struktoai/mirage-browser
```

Demonstrates the proxy-based browser pattern. Probably runs as a Vite snippet under `examples/typescript/browser/` next to the existing browser examples. Optional, ships in Phase 6.

______________________________________________________________________

## Non-goals

- OAuth flow / token acquisition — out of scope; user provides the token (or proxy URL).
- Real-time events (RTM, Events API, Socket Mode) — out of scope; this is a read/write API resource, not a streaming subscriber.
- xoxc session-token reverse engineering — out of scope.
- Caching beyond what `IndexCacheStore` already provides — out of scope.
