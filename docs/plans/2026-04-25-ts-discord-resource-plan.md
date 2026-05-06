# TypeScript Discord Resource Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Port Python `mirage.resource.discord` to TypeScript so both `@struktoai/mirage-node` and `@struktoai/mirage-browser` export a `DiscordResource` class with the same VFS surface as Python's. Ship 4 examples mirroring Python's `discord.py`, `discord_vfs.py`, `discord_fuse.py` plus a new `discord_browser/` two-process demo.

**Architecture:**

- Cross-runtime machinery in `@struktoai/mirage-core` (`core/discord/*`, `accessor/discord.ts`, `ops/discord/*`, `commands/builtin/discord/*`).
- Per-runtime resource shells in `@struktoai/mirage-node` (Bot-token transport) and `@struktoai/mirage-browser` (proxy + header-callback transport).
- All Discord core functions take a `DiscordAccessor` whose `transport.call(method, endpoint, params?, body?)` is the only network boundary. `method` ∈ `{'GET','POST','PUT'}`.
- 429 rate-limit retry lives in `HttpDiscordTransport.call()` (3 retries with `retry_after` honoring) — different from Slack which had no retry.
- Path-based proxy contract: node and browser transports differ only in `baseUrl()` + `authHeaders()`. Same fetch + retry logic.

**VFS layout (4 levels — different from Slack's 2):**

```
/discord
  /<guild_name>__<guild_id>
    /channels
      /<ch_name>__<ch_id>
        /<YYYY-MM-DD>.jsonl    ← message history (one file per UTC day)
    /members
      /<member_name>__<user_id>.json
```

`detectScope` classifies every path into one of: `root | guild | channel | file`. The `members` and `channels` segments are virtual intermediate dirs (no API entity).

**Tech Stack:** TypeScript 6 (`strictTypeChecked`, `verbatimModuleSyntax`, `exactOptionalPropertyTypes`), Vitest, existing core abstractions (`Accessor`, `IndexCacheStore`, `Resource`, `RegisteredCommand`, `RegisteredOp`, `OpKwargs`, `PathSpec`, `MountMode`, `FuseManager`, `patchNodeFs`).

**Reference docs:**

- Slack port (the precedent — same shape, mostly mechanical reuse):
  - Plan: [`docs/plans/2026-04-24-ts-slack-resource-plan.md`](2026-04-24-ts-slack-resource-plan.md)
  - Code: `typescript/packages/core/src/{accessor,core,ops,commands/builtin}/slack/`, `typescript/packages/{node,browser}/src/resource/slack/`
- Python source — port verbatim where possible:
  - `python/mirage/resource/discord/` (config, prompt, class)
  - `python/mirage/accessor/discord.py` (accessor)
  - `python/mirage/core/discord/` (\_client, scope, glob, channels, guilds, members, history, post, react, search, readdir, read, stat)
  - `python/mirage/ops/discord/` (read, readdir, stat)
  - `python/mirage/commands/builtin/discord/` (15 commands)

**Python parity rule (CRITICAL):** every TS function ports a specific Python function with the same name (camelCased). Match semantics exactly. Leave behavior changes for follow-up plans.

**Discord-specific quirks vs Slack:**

| Aspect         | Slack                                 | Discord                                                         |
| -------------- | ------------------------------------- | --------------------------------------------------------------- |
| Auth header    | `Authorization: Bearer <token>`       | `Authorization: Bot <token>`                                    |
| Endpoints      | flat (e.g. `users.list`)              | path-style (e.g. `/guilds/{id}/channels`)                       |
| Rate limit     | not handled (relies on caller)        | 429 with `retry_after` payload — 3 retries built into transport |
| Methods used   | GET, POST                             | GET, POST, PUT (PUT for reactions)                              |
| VFS depth      | 2 levels (`channels/<name>/`)         | 4 levels (`<guild>/channels/<ch>/`)                             |
| Search         | optional second token (`searchToken`) | single Bot token, paginated                                     |
| Resource types | 4 (channel, dm, user, history)        | 4 (guild, channel, member, history)                             |

**Skills referenced:**

- `superpowers:test-driven-development` — every task is TDD. Failing test first.
- `superpowers:systematic-debugging` — when tests fail unexpectedly, root-cause before patching.
- `superpowers:requesting-code-review` — Phase-end review checkpoints.
- `superpowers:finishing-a-development-branch` — final review + ship.

**Conventions for this plan:**

- Field names: TS-idiomatic camelCase. Discord config has only `token`, so no rename needed (but keep `normalizeDiscordConfig()` skeleton for future fields).
- Tests live next to implementation: `foo.ts` ↔ `foo.test.ts`.
- All transport calls go through `DiscordTransport`; tests inject `FakeDiscordTransport`. **No live Discord calls in tests.**
- Each task ends with a commit. Commit messages use Conventional Commits (`feat:`, `test:`, `fix:`).
- After each phase: run `pnpm -r --filter './packages/*' build && pnpm -r --filter './packages/*' test` and ensure both green before moving on.

______________________________________________________________________

## Phase 1 — Foundation (5 tasks)

Build the transport contract and accessor scaffolding. After Phase 1, the lowest-level abstraction is in place but no Discord endpoints are callable yet.

______________________________________________________________________

### Task 1: DiscordTransport interface, DiscordResponse, DiscordApiError, 429 retry

**Files:**

- Create: `typescript/packages/core/src/core/discord/_client.ts`
- Create: `typescript/packages/core/src/core/discord/_client.test.ts`

**Step 1: Write the failing tests**

Mirror the Slack `_client.test.ts` shape but for Discord. Cover:

- `GET` when `body === undefined`; URL = `${baseUrl}${endpoint}` + querystring.
- `POST` when `method === 'POST'`; body is JSON-stringified.
- `PUT` when `method === 'PUT'`; no body, returns void/null.
- `Authorization` header from `authHeaders()`.
- `429` response with `retry_after: 0.05` JSON → retried up to 3 times → success on retry.
- `429` after 3 retries → throws `DiscordApiError` with `endpoint`, `status: 429`, `discordError: 'rate_limited'`.
- Non-2xx (e.g. 401) → throws `DiscordApiError` with status + parsed payload.
- Network error → propagates without wrapping.

```ts
// typescript/packages/core/src/core/discord/_client.test.ts
import { describe, expect, it, vi } from 'vitest'
import { DiscordApiError, type DiscordResponse, HttpDiscordTransport } from './_client.ts'

class TestTransport extends HttpDiscordTransport {
  constructor(
    private readonly base: string,
    private readonly auth: Record<string, string>,
    fetchImpl: typeof fetch,
  ) {
    super()
    ;(this as unknown as { fetch: typeof fetch }).fetch = fetchImpl
  }
  protected baseUrl(): string { return this.base }
  protected authHeaders(): Record<string, string> { return this.auth }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  })
}

describe('HttpDiscordTransport', () => {
  it('GET endpoint with params', async () => {
    let url = ''
    const fakeFetch: typeof fetch = (u, init) => {
      url = String(u)
      expect(init?.method ?? 'GET').toBe('GET')
      return Promise.resolve(jsonResponse([{ id: 'g1' }]))
    }
    const t = new TestTransport('https://discord.com/api/v10', { Authorization: 'Bot x' }, fakeFetch)
    const out = await t.call('GET', '/users/@me/guilds') as DiscordResponse
    expect(url).toBe('https://discord.com/api/v10/users/@me/guilds')
    expect(out).toEqual([{ id: 'g1' }])
  })

  it('PUT does not send a body', async () => {
    const fakeFetch = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response('', { status: 204 })),
    )
    const t = new TestTransport('https://discord.com/api/v10', { Authorization: 'Bot x' }, fakeFetch)
    await t.call('PUT', '/channels/C1/messages/M1/reactions/%F0%9F%91%8D/@me')
    const init = fakeFetch.mock.calls[0]?.[1]
    expect(init?.method).toBe('PUT')
    expect(init?.body).toBeUndefined()
  })

  it('429 with retry_after retries and succeeds', async () => {
    let calls = 0
    const fakeFetch: typeof fetch = () => {
      calls += 1
      if (calls === 1) return Promise.resolve(jsonResponse({ retry_after: 0.001 }, 429))
      return Promise.resolve(jsonResponse([{ id: 'g1' }]))
    }
    const t = new TestTransport('https://discord.com/api/v10', { Authorization: 'Bot x' }, fakeFetch)
    const out = await t.call('GET', '/users/@me/guilds')
    expect(calls).toBe(2)
    expect(out).toEqual([{ id: 'g1' }])
  })

  it('429 after MAX_RETRIES throws DiscordApiError', async () => {
    const fakeFetch: typeof fetch = () =>
      Promise.resolve(jsonResponse({ retry_after: 0.001 }, 429))
    const t = new TestTransport('https://discord.com/api/v10', { Authorization: 'Bot x' }, fakeFetch)
    await expect(t.call('GET', '/users/@me/guilds')).rejects.toThrowError(DiscordApiError)
  })

  it('non-2xx throws DiscordApiError with status', async () => {
    const fakeFetch: typeof fetch = () =>
      Promise.resolve(jsonResponse({ message: 'Unauthorized' }, 401))
    const t = new TestTransport('https://discord.com/api/v10', { Authorization: 'Bot x' }, fakeFetch)
    await expect(t.call('GET', '/users/@me/guilds')).rejects.toMatchObject({
      status: 401,
      endpoint: '/users/@me/guilds',
    })
  })
})
```

**Step 2: Run tests — expect all to fail with `Cannot find module './_client.ts'`.**

**Step 3: Implement `_client.ts`**

```ts
export const DISCORD_API = 'https://discord.com/api/v10'
const MAX_RETRIES = 3

export type DiscordMethod = 'GET' | 'POST' | 'PUT'
export type DiscordResponse = unknown // Discord returns dict | list | null per endpoint

export class DiscordApiError extends Error {
  constructor(
    public readonly endpoint: string,
    public readonly status: number,
    public readonly discordError: string,
    public readonly payload?: unknown,
  ) {
    super(`Discord API error (${endpoint}): ${discordError}`)
    this.name = 'DiscordApiError'
  }
}

export interface DiscordTransport {
  call(
    method: DiscordMethod,
    endpoint: string,
    params?: Record<string, string | number>,
    body?: Record<string, unknown>,
  ): Promise<DiscordResponse>
}

export abstract class HttpDiscordTransport implements DiscordTransport {
  protected fetch: typeof fetch = globalThis.fetch.bind(globalThis)
  protected abstract baseUrl(): string
  protected abstract authHeaders(): Record<string, string>

  async call(
    method: DiscordMethod,
    endpoint: string,
    params?: Record<string, string | number>,
    body?: Record<string, unknown>,
  ): Promise<DiscordResponse> {
    const url = new URL(this.baseUrl() + endpoint)
    if (params !== undefined) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
    }
    const headers: Record<string, string> = { ...this.authHeaders() }
    if (body !== undefined) headers['content-type'] = 'application/json'

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const init: RequestInit = { method, headers }
      if (body !== undefined) init.body = JSON.stringify(body)
      const resp = await this.fetch(url.toString(), init)

      if (resp.status === 429) {
        const data = (await resp.json().catch(() => ({}))) as { retry_after?: number }
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, (data.retry_after ?? 1) * 1000))
          continue
        }
        throw new DiscordApiError(endpoint, 429, 'rate_limited', data)
      }

      if (resp.status === 204) return null
      const text = await resp.text()
      const parsed = text === '' ? null : JSON.parse(text)
      if (!resp.ok) {
        const err = (parsed as { message?: string })?.message ?? `http_${String(resp.status)}`
        throw new DiscordApiError(endpoint, resp.status, err, parsed)
      }
      return parsed
    }
    throw new DiscordApiError(endpoint, 429, 'rate_limited_after_retries')
  }
}
```

**Step 4: Run tests — all pass.**

**Step 5: Commit.**

```
feat(core/discord): add DiscordTransport + 429 retry
```

______________________________________________________________________

### Task 2: BrowserDiscordTransport with proxyUrl + getHeaders callback

**Files:**

- Create: `typescript/packages/core/src/core/discord/_client_browser.ts`
- Create: `typescript/packages/core/src/core/discord/_client_browser.test.ts`

Same shape as Slack's `BrowserSlackTransport` (Task 2 of Slack plan):

- Constructor takes `{ proxyUrl: string, getHeaders?: () => Record<string,string> | Promise<...> }`.
- Validates proxyUrl: parses as URL, throws if `.search !== '' || .hash !== ''` (query/fragment footgun).
- `baseUrl()` returns the proxyUrl unchanged (the proxy server is responsible for forwarding `/api/v10/*` upstream).
- `authHeaders()` returns `getHeaders?.() ?? {}` — never the bot token directly.
- Tests: lint-clean (Promise.resolve, not async), proxyUrl validation throws on `?token=x`, getHeaders is awaited.

**Step 5: Commit.** `feat(core/discord): BrowserDiscordTransport with proxy contract`

______________________________________________________________________

### Task 3: DiscordAccessor

**Files:**

- Create: `typescript/packages/core/src/accessor/discord.ts`
- Create: `typescript/packages/core/src/accessor/discord.test.ts`

```ts
import type { Accessor } from './base.ts'
import type { DiscordTransport } from '../core/discord/_client.ts'
import type { IndexCacheStore } from '../cache/index/store.ts'

export class DiscordAccessor implements Accessor {
  readonly transport: DiscordTransport
  constructor(transport: DiscordTransport) {
    this.transport = transport
  }
  open(): Promise<void> { return Promise.resolve() }
  close(): Promise<void> { return Promise.resolve() }
}

export interface DiscordResourceLike {
  readonly kind: string
  readonly accessor: DiscordAccessor
  readonly index?: IndexCacheStore
  open(): Promise<void>
  close(): Promise<void>
}
```

Tests: construct with FakeTransport, verify `accessor.transport` is the same ref.

**Commit:** `feat(core/discord): DiscordAccessor`

______________________________________________________________________

### Task 4: ResourceName.DISCORD constant + index.ts re-exports

**Files:**

- Modify: `typescript/packages/core/src/types.ts` — add `DISCORD: 'discord'` to `ResourceName`.
- Modify: `typescript/packages/core/src/types.test.ts` — assert constant.
- Modify: `typescript/packages/core/src/index.ts` — export `DiscordAccessor`, `DiscordResourceLike`, `DiscordTransport`, `HttpDiscordTransport`, `BrowserDiscordTransport`, `DiscordApiError`, `DiscordResponse`, `DISCORD_API`.

**Commit:** `feat(core): export Discord transport + accessor`

______________________________________________________________________

### Task 5: Phase 1 build + checkpoint

**Step 1:** `pnpm --filter @struktoai/mirage-core build && pnpm --filter @struktoai/mirage-core test`
**Step 2:** Use `superpowers:requesting-code-review` to review Phase 1.
**Step 3:** Address feedback before Phase 2.

______________________________________________________________________

## Phase 2 — Read pipeline (10 tasks)

Build the read-only VFS surface. After Phase 2, `readdir`/`read`/`stat` work end-to-end against a fake transport.

______________________________________________________________________

### Task 6: DiscordScope + detectScope

**Files:**

- Create: `typescript/packages/core/src/core/discord/scope.ts`
- Create: `typescript/packages/core/src/core/discord/scope.test.ts`

Port `python/mirage/core/discord/scope.py` (147 LOC). Four levels: `root | guild | channel | file`. `detectScope` is async (resolves IDs from the index for guild/channel name → snowflake).

Test cases (from Python tests + parity):

| Input                                           | Expected level | guildId  | channelId | dateStr      |
| ----------------------------------------------- | -------------- | -------- | --------- | ------------ |
| `/` (empty)                                     | `root`         | —        | —         | —            |
| `/myserver`                                     | `guild`        | resolved | —         | —            |
| `/myserver/channels`                            | `guild`        | resolved | —         | —            |
| `/myserver/members`                             | `guild`        | resolved | —         | —            |
| `/myserver/channels/general`                    | `channel`      | resolved | resolved  | —            |
| `/myserver/channels/general/2026-04-25.jsonl`   | `file`         | resolved | resolved  | `2026-04-25` |
| `*.jsonl` glob in `/myserver/channels/general/` | `channel`      | resolved | resolved  | —            |

**Commit:** `feat(core/discord): port detectScope`

______________________________________________________________________

### Task 7: Discord entry helpers — DiscordResourceType + DiscordIndexEntry

**Files:**

- Create: `typescript/packages/core/src/core/discord/entry.ts`
- Create: `typescript/packages/core/src/core/discord/entry.test.ts`

Mirror Slack's `entry.ts` (post-fix: no `VIRTUAL_ROOT`). Discord has 4 types:

```ts
import { IndexEntry } from '../../cache/index/config.ts'

export const DiscordResourceType = Object.freeze({
  GUILD: 'discord/guild',
  CHANNEL: 'discord/channel',
  MEMBER: 'discord/member',
  HISTORY: 'discord/history',
} as const)

export type DiscordResourceType = (typeof DiscordResourceType)[keyof typeof DiscordResourceType]

const UNSAFE = /[^\w\s\-.]/g
const MULTI_UNDERSCORE = /_+/g
const MAX_LEN = 100

export function sanitizeName(name: string): string { /* same as slack */ }

function makeIdName(name: string, id: string): string {
  return `${sanitizeName(name)}__${id}`
}

export function guildDirname(g: { id: string; name?: string }): string {
  return makeIdName(g.name ?? g.id, g.id)
}
export function channelDirname(c: { id: string; name?: string }): string {
  return makeIdName(c.name ?? c.id, c.id)
}
export function memberFilename(m: { id: string; name?: string }): string {
  return `${makeIdName(m.name ?? m.id, m.id)}.json`
}

export const DiscordIndexEntry = {
  guild(g: { id: string; name?: string }): IndexEntry {
    return new IndexEntry({
      id: g.id, name: g.name ?? '',
      resourceType: DiscordResourceType.GUILD,
      vfsName: guildDirname(g),
    })
  },
  channel(c: { id: string; name?: string }): IndexEntry {
    return new IndexEntry({
      id: c.id, name: c.name ?? '',
      resourceType: DiscordResourceType.CHANNEL,
      vfsName: channelDirname(c),
    })
  },
  member(m: { id: string; name?: string }): IndexEntry {
    return new IndexEntry({
      id: m.id, name: m.name ?? '',
      resourceType: DiscordResourceType.MEMBER,
      vfsName: memberFilename(m),
    })
  },
  history(channelId: string, date: string): IndexEntry {
    return new IndexEntry({
      id: `${channelId}:${date}`, name: date,
      resourceType: DiscordResourceType.HISTORY,
      vfsName: `${date}.jsonl`,
    })
  },
}
```

Tests: parity with Slack's `entry.test.ts` (sanitizeName edge cases, dirname/filename happy paths + missing names).

**Commit:** `feat(core/discord): DiscordIndexEntry factories + naming helpers`

______________________________________________________________________

### Task 8: listGuilds

**Files:**

- Create: `typescript/packages/core/src/core/discord/guilds.ts`
- Create: `typescript/packages/core/src/core/discord/guilds.test.ts`

Port `python/mirage/core/discord/guilds.py` (14 LOC). Single function `listGuilds(accessor): Promise<DiscordGuild[]>` that calls `transport.call('GET', '/users/@me/guilds')`. Test with FakeTransport returning `[{ id: 'G1', name: 'My Server' }]`.

**Commit:** `feat(core/discord): listGuilds`

______________________________________________________________________

### Task 9: listChannels

**Files:**

- Create: `typescript/packages/core/src/core/discord/channels.ts`
- Create: `typescript/packages/core/src/core/discord/channels.test.ts`

Port `python/mirage/core/discord/channels.py` (19 LOC). `listChannels(accessor, guildId)` calls `GET /guilds/{guildId}/channels`. Filter to text channels (Discord returns voice/category too — check `type === 0` for text per Discord docs, mirror Python's filter exactly).

**Commit:** `feat(core/discord): listChannels`

______________________________________________________________________

### Task 10: listMembers + history (date logic)

**Files:**

- Create: `typescript/packages/core/src/core/discord/members.ts` (port `members.py` — 51 LOC)
- Create: `typescript/packages/core/src/core/discord/history.ts` (port `history.py` — 62 LOC)
- Tests for both

`history.ts` exports:

- `snowflakeToDate(snowflake: string): string` — converts Discord snowflake to YYYY-MM-DD UTC.
- `dateRangeFromSnowflake(latestId: string, days = 30): string[]` — returns descending date list. Discord uses 30 days default (vs Slack's 90).
- `fetchMessagesForDate(accessor, channelId, date): Promise<unknown[]>` — paginates `/channels/{id}/messages` filtering by date boundary.

Use the snowflake epoch: `(BigInt(snowflake) >> 22n) + 1420070400000n` → milliseconds.

**Commit:** `feat(core/discord): listMembers + message history with snowflake-derived dates`

______________________________________________________________________

### Task 11: post + react + search

**Files:**

- Create: `typescript/packages/core/src/core/discord/post.ts` (port `post.py` — 29 LOC)

- Create: `typescript/packages/core/src/core/discord/react.ts` (port `react.py` — 26 LOC)

- Create: `typescript/packages/core/src/core/discord/search.ts` (port `search.py` — 70 LOC)

- Tests for each

- `postMessage(accessor, channelId, text): Promise<DiscordMessage>` — `POST /channels/{id}/messages` with `{ content: text }`.

- `addReaction(accessor, channelId, messageId, emoji): Promise<void>` — `PUT /channels/{ch}/messages/{m}/reactions/{encodedEmoji}/@me` (URL-encode the emoji).

- `searchGuild(accessor, guildId, query, channelId?, limit=100)` — paginated GET to `/guilds/{id}/messages/search` with `content`, optional `channel_id`, `offset`. PAGE_SIZE=25. Sort ascending by message ID.

- `formatGrepResults(messages): string[]` — `${ch_id}/${ts[:10]}.jsonl:[${author}] ${content}` (matches Python).

**Commit:** `feat(core/discord): post + react + search`

______________________________________________________________________

### Task 12: glob.ts — resolveDiscordGlob

**Files:**

- Create: `typescript/packages/core/src/core/discord/glob.ts` (port `glob.py` — 43 LOC)
- Create: `typescript/packages/core/src/core/discord/glob.test.ts`

Resolves `*.jsonl` patterns inside a channel scope by listing the channel directory (which materializes the date range) and filtering against the pattern. Same shape as `resolveSlackGlob`.

**Commit:** `feat(core/discord): resolveDiscordGlob`

______________________________________________________________________

### Task 13: readdir.ts — 4-level VFS materialization

**Files:**

- Create: `typescript/packages/core/src/core/discord/readdir.ts` (port `readdir.py` — 218 LOC, the biggest file in this phase)
- Create: `typescript/packages/core/src/core/discord/readdir.test.ts`

Levels:

1. **Root** (`/`) — list guilds via `listGuilds`. Each guild → `<name>__<id>`. Cache in `index` under prefix.
1. **Guild** (`/<guild>`) — return literal `[<prefix>/<guild>/channels, <prefix>/<guild>/members]` (these are virtual subdirs, not API-backed).
1. **Channels container** (`/<guild>/channels`) — list channels for the guild via `listChannels`. Each channel → `<name>__<id>`. Cache.
1. **Members container** (`/<guild>/members`) — list members via `listMembers`. Each member → `<name>__<id>.json`. Cache.
1. **Channel** (`/<guild>/channels/<ch>`) — list dates via `dateRangeFromSnowflake(latestMessageId, 30)`. Each date → `<YYYY-MM-DD>.jsonl`. Cache.

Cache strategy mirrors Slack's: hit `index.listDir(virtualKey)` first, fall back to API call + `index.setDir`.

Tests with `FakeTransport` covering each level + index hit + index miss.

**Commit:** `feat(core/discord): readdir for 4-level guild/channels/members/file VFS`

______________________________________________________________________

### Task 14: read.ts + stat.ts

**Files:**

- Create: `typescript/packages/core/src/core/discord/read.ts` (port `read.py` — 59 LOC)

- Create: `typescript/packages/core/src/core/discord/stat.ts` (port `stat.py` — 72 LOC)

- Tests for each

- `read(accessor, path, index?)`: dispatches by scope. For `file` (date jsonl), calls `fetchMessagesForDate` and JSONL-encodes the result. For member json files, fetches member profile and encodes as pretty JSON.

- `stat(accessor, path, index?)`: returns `FileStat` (type/name/size/extra). For directories, type=DIRECTORY. For history files, type=FILE with `extra.channel_id`/`extra.date`. For member files, type=FILE.

**Commit:** `feat(core/discord): read + stat`

______________________________________________________________________

### Task 15: ops/discord/{readdir,read,stat}.ts

**Files:**

- Create: `typescript/packages/core/src/ops/discord/readdir.ts`
- Create: `typescript/packages/core/src/ops/discord/read.ts`
- Create: `typescript/packages/core/src/ops/discord/stat.ts`
- Create: `typescript/packages/core/src/ops/discord/index.ts` exporting `DISCORD_VFS_OPS`
- Tests for each (mirror `ops/slack/*.test.ts`)

Use the **new** `(accessor, path, args, kwargs)` signature with `kwargs.index`. Reference [`ops/slack/readdir.ts`](typescript/packages/core/src/ops/slack/readdir.ts) — same shape, swap `slack` → `discord`.

**Commit:** `feat(core/discord): ops {readdir,read,stat}`

______________________________________________________________________

### Task 16: Phase 2 build + checkpoint

Build + test, code review, address feedback.

______________________________________________________________________

## Phase 3 — Filesystem commands (6 tasks, batched by similarity)

Port the 11 read-only filesystem commands. Same density as Slack Phase 3.

______________________________________________________________________

### Task 17: ls + tree

**Files:**

- Create: `typescript/packages/core/src/commands/builtin/discord/ls.ts` (port `ls.py` — 146 LOC)
- Create: `typescript/packages/core/src/commands/builtin/discord/tree.ts` (port `tree.py` — 109 LOC)
- Tests for each
- Create: `typescript/packages/core/src/commands/builtin/discord/_provision.ts` (port `_provision.py` — 38 LOC) — `fileReadProvision` helper used by cat/grep/etc.

Use [`commands/builtin/slack/ls.ts`](typescript/packages/core/src/commands/builtin/slack/ls.ts) as the structural reference. Discord ls has multi-level handling (guild → channels → channel → files).

**Commit:** `feat(commands/discord): ls + tree + _provision`

______________________________________________________________________

### Task 18: cat + head + tail + wc

**Files:**

- 4 new command files + tests
- Reuse [`commands/builtin/slack/cat.ts`](typescript/packages/core/src/commands/builtin/slack/cat.ts) etc. as templates.

**Commit:** `feat(commands/discord): cat + head + tail + wc`

______________________________________________________________________

### Task 19: find

**Files:**

- Create: `typescript/packages/core/src/commands/builtin/discord/find.ts` (port `find.py` — 101 LOC)
- Tests

**Commit:** `feat(commands/discord): find`

______________________________________________________________________

### Task 20: grep + rg

**Files:**

- Create: `typescript/packages/core/src/commands/builtin/discord/grep.ts` (port grep — note Discord grep dir is `commands/builtin/discord/grep/grep.py`)
- Create: `typescript/packages/core/src/commands/builtin/discord/rg.ts` (port `rg.py` — 163 LOC)
- Tests

Use the post-fix slack grep ([`commands/builtin/slack/grep.ts`](typescript/packages/core/src/commands/builtin/slack/grep.ts)) — already wires `grepFilesOnly` for `-l` recursive directory walk. Discord's native search push-down uses `searchGuild` + `formatGrepResults` (not `searchMessages`).

**Commit:** `feat(commands/discord): grep + rg with native search push-down + recursive -l`

______________________________________________________________________

### Task 21: stat + jq

**Files:**

- 2 new command files + tests

**Commit:** `feat(commands/discord): stat + jq`

______________________________________________________________________

### Task 22: DISCORD_COMMANDS export array + Phase 3 checkpoint

**Files:**

- Create: `typescript/packages/core/src/commands/builtin/discord/index.ts` exporting `DISCORD_COMMANDS` array.
- Run full build + test. Code review.

**Commit:** `feat(commands/discord): export DISCORD_COMMANDS`

______________________________________________________________________

## Phase 4 — Discord-specific RPC commands (4 tasks)

______________________________________________________________________

### Task 23: discord_send_message

**Files:**

- Create: `typescript/packages/core/src/commands/builtin/discord/discord_send_message.ts` (port — 34 LOC)
- Tests

Mirror slack_post_message. Signature: `(accessor, paths, _texts, opts)`. Reads `--channel_id` and `--text` from `opts.flags`. Calls `postMessage(accessor, channelId, text)`. JSON-encode result.

`write: true`.

**Commit:** `feat(commands/discord): discord_send_message`

______________________________________________________________________

### Task 24: discord_add_reaction

**Files:**

- Create: `typescript/packages/core/src/commands/builtin/discord/discord_add_reaction.ts` (port — 35 LOC)
- Tests

Reads `--channel_id`, `--message_id`, `--emoji`. Calls `addReaction`. `write: true`.

**Commit:** `feat(commands/discord): discord_add_reaction`

______________________________________________________________________

### Task 25: discord_get_server_info

**Files:**

- Create: `typescript/packages/core/src/commands/builtin/discord/discord_get_server_info.ts` (port — 26 LOC)
- Tests

Reads `--guild_id`. Calls `transport.call('GET', '/guilds/{id}')`. JSON-encode response. Read-only.

**Commit:** `feat(commands/discord): discord_get_server_info`

______________________________________________________________________

### Task 26: discord_list_members

**Files:**

- Create: `typescript/packages/core/src/commands/builtin/discord/discord_list_members.ts` (port — 31 LOC)
- Tests

Reads `--guild_id`, optional `--limit`. Paginates `/guilds/{id}/members`. JSON-encode. Read-only.

**Commit:** `feat(commands/discord): discord_list_members + Phase 4 checkpoint`

______________________________________________________________________

### Task 27: Extend DISCORD_COMMANDS export, Phase 4 review

Run build + test. Code review. Append the 4 RPC commands to the export array. Confirm `discord` resource registers all 15 commands.

**Commit:** `feat(commands/discord): wire RPC commands into DISCORD_COMMANDS`

______________________________________________________________________

## Phase 5 — Resource classes + registry wiring (3 tasks)

Mirror Slack Phase 5: parallel implementations, no shared base.

______________________________________________________________________

### Task 28: Node DiscordResource + config + prompt

**Files:**

- Create: `typescript/packages/node/src/resource/discord/config.ts` — `DiscordConfig`, `DiscordConfigRedacted`, `redactDiscordConfig`, `normalizeDiscordConfig`.
- Create: `typescript/packages/node/src/resource/discord/prompt.ts` — port `python/mirage/resource/discord/prompt.py`.
- Create: `typescript/packages/node/src/resource/discord/discord.ts` — implements `Resource`. Constructor takes `DiscordConfig`. Wires `NodeDiscordTransport` (subclass of `HttpDiscordTransport` with `baseUrl()` returning `DISCORD_API` and `authHeaders()` returning `{ Authorization: \`Bot ${token}\` }\`).
- Tests
- Add to `typescript/packages/node/src/resource/registry.ts` mapping `discord` kind → `DiscordResource`.
- Add to `typescript/packages/node/src/index.ts` re-exports.

Include `fingerprint(p): Promise<string | null>` (the lesson from Slack — return `(await this.index.get(p.original)).entry?.remoteTime ?? null`).

**Commit:** `feat(node/resource/discord): NodeDiscordTransport + DiscordResource`

______________________________________________________________________

### Task 29: Browser DiscordResource + config + prompt

**Files:**

- Mirror Task 28 in `typescript/packages/browser/src/resource/discord/`.
- `BrowserDiscordTransport` re-exported from `@struktoai/mirage-core` as `_client_browser.ts`.
- Tests use mocked `globalThis.fetch`.

**Commit:** `feat(browser/resource/discord): BrowserDiscordTransport + DiscordResource`

______________________________________________________________________

### Task 30: Phase 5 integration test + build checkpoint

**Files:**

- Create: `typescript/packages/node/src/resource/discord/integration.test.ts` — spin up `Workspace({ '/discord': new DiscordResource(...) })`, run `ls /discord/`, assert top-level guild listing using `FakeDiscordTransport`.
- Build all 3 packages. Run full vitest. Code review.

**Commit:** `test(integration): Discord through Workspace.execute`

______________________________________________________________________

## Phase 6 — Examples + docs (5 tasks)

______________________________________________________________________

### Task 31: examples/typescript/discord/discord.ts

Mirror `examples/python/discord/discord.py`. Cover the same surface: `ls`, `cat`, `head`, `tail`, `wc`, `grep`, `rg`, `jq`, `tree`, `find`, `pwd`/`cd`, glob loop. Use the same demo guild.

**Commit:** `feat(examples/discord): main demo`

______________________________________________________________________

### Task 32: examples/typescript/discord/discord_vfs.ts

Mirror `examples/python/discord/discord_vfs.py` — patches Node `fs`/`fs.promises` so external tools like `ls`, `cat`, etc. read through the workspace. Use `patchNodeFs`.

**Commit:** `feat(examples/discord): VFS host-fs demo`

______________________________________________________________________

### Task 33: examples/typescript/discord/discord_fuse.ts

Mirror `examples/python/discord/discord_fuse.py` — mounts `/discord` via FUSE. Use `FuseManager`.

**Commit:** `feat(examples/discord): FUSE mount demo`

______________________________________________________________________

### Task 34: examples/typescript/discord/discord_browser/{server.ts,main.ts,README.md}

Mirror `examples/typescript/slack/slack_browser/`. Server: HTTP proxy holding `DISCORD_BOT_TOKEN`, forwards `/api/discord/*` → `https://discord.com/api/v10/*`. Main: uses `@struktoai/mirage-browser` `DiscordResource` with `proxyUrl`.

**Commit:** `feat(examples/discord): browser proxy demo`

______________________________________________________________________

### Task 35: docs/typescript/discord.mdx

Mirror `docs/typescript/slack.mdx`. Cover: install, node usage with bot token, browser usage with proxy, command reference, VFS layout diagram.

Add to `docs/docs.json` navigation.

**Commit:** `docs(typescript): Discord page`

______________________________________________________________________

## Phase 7 — Final review + ship

**Step 1:** Use `superpowers:requesting-code-review` for the entire implementation across all 35 tasks.
**Step 2:** Address review feedback.
**Step 3:** Use `superpowers:finishing-a-development-branch` to merge.

End-to-end smoke verification (manual):

- Run `examples/typescript/discord/discord.ts` with `DISCORD_BOT_TOKEN` set — output should match Python's `discord.py` for the same guild.
- Run `examples/typescript/discord/discord_browser/server.ts` + `main.ts` — confirms browser flow.
- Run pre-commit + full TS test suite (core + node + browser).

______________________________________________________________________

## Risks + mitigations

| Risk                                                                        | Mitigation                                                                                            |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Discord API uses snowflake IDs (BigInt arithmetic for date math)            | Test `snowflakeToDate` extensively against known timestamps                                           |
| 429 retries can stall tests                                                 | Use `setTimeout` mock in test or set `retry_after: 0.001`                                             |
| Search endpoint is gated per server tier                                    | Document fallback to grep over fetched files; never fail hard if search 403s                          |
| Browser token leak via proxy logs                                           | Server example logs only path, never headers                                                          |
| 4-level VFS may surface readdir cascade bugs (like Slack `cd` had)          | Run an end-to-end `cd /discord/<guild>/channels/<ch> && cat <date>.jsonl` test in Phase 5 integration |
| Bot must be invited to guild + have `READ_MESSAGE_HISTORY` to fetch history | Document in `discord.mdx` setup section                                                               |

______________________________________________________________________

## Out of scope (future plans)

- Voice channels / categories / threads (Python doesn't have them either; future work)
- DMs at the user level (Discord bots can't read DMs by default; not in Python port)
- Slash command registration (Python doesn't have this; future GEO/agent work)
- Real-time gateway connection (Python uses REST only; gateway is a much bigger plan)
- Webhooks (separate auth model)
