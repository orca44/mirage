# TypeScript Slack Resource Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Port Python `mirage.resource.slack` to TypeScript so both `@struktoai/mirage-node` and `@struktoai/mirage-browser` export a `SlackResource` class with the same VFS surface as Python's. Ship 4 examples mirroring Python's `slack.py`, `slack_vfs.py`, `slack_fuse.py` plus a new `slack_browser.ts`.

**Architecture:**

- Cross-runtime machinery in `@struktoai/mirage-core` (`core/slack/*`, `accessor/slack.ts`, `ops/slack/*`, `commands/builtin/slack/*`).
- Per-runtime resource shells in `@struktoai/mirage-node` (bot-token transport) and `@struktoai/mirage-browser` (proxy + header-callback transport).
- Path-based proxy contract: node and browser transports differ only in `baseUrl()` + `authHeaders()`. Same fetch logic.
- All Slack core functions take a `SlackAccessor` whose `transport.call(endpoint, params?, body?)` is the only boundary.

**Tech Stack:** TypeScript 6 (`strictTypeChecked`, `verbatimModuleSyntax`, `exactOptionalPropertyTypes`), Vitest, existing core abstractions (`BaseAccessor`, `IndexCacheStore`, `Resource`, `RegisteredCommand`, `RegisteredOp`, `PathSpec`, `MountMode`, `FuseManager`, `patchNodeFs`).

**Reference docs:**

- Design: [`docs/plans/2026-04-24-ts-slack-resource-design.md`](2026-04-24-ts-slack-resource-design.md)
- Python source — port verbatim where possible:
  - `python/mirage/resource/slack/` (config, prompt, class)
  - `python/mirage/accessor/slack.py` (accessor)
  - `python/mirage/core/slack/` (\_client, scope, channels, users, history, post, react, search, readdir, read, stat, glob, entry)
  - `python/mirage/ops/slack/` (read, readdir, stat)
  - `python/mirage/commands/builtin/slack/` (19 commands)
- TS reference (mirror this structure): `typescript/packages/core/src/core/s3/`, `typescript/packages/core/src/ops/s3/`, `typescript/packages/core/src/commands/builtin/s3/`, `typescript/packages/{node,browser}/src/resource/s3/`

**Python parity rule (CRITICAL):** every TS function ports a specific Python function with the same name (camelCased). Match semantics exactly. Leave behavior changes for follow-up plans.

**Skills referenced:**

- `superpowers:test-driven-development` — every task is TDD. Failing test first.
- `superpowers:systematic-debugging` — when tests fail unexpectedly, root-cause before patching.
- `superpowers:requesting-code-review` — Phase-end review checkpoints.
- `superpowers:finishing-a-development-branch` — final review + ship.

**Conventions for this plan:**

- Field names: TS-idiomatic camelCase (Python `search_token` → TS `searchToken`), with `normalizeSlackConfig()` for snake_case YAML/JSON loading.
- Tests live next to implementation: `foo.ts` ↔ `foo.test.ts`.
- All transport calls go through `SlackTransport`; tests inject `FakeSlackTransport`. **No live Slack calls in tests.**
- Each task ends with a commit. Commit messages use Conventional Commits (`feat:`, `test:`, `fix:`).
- After each phase: run `pnpm -r --filter './packages/*' build && pnpm -r --filter './packages/*' test` and ensure both green before moving on.

______________________________________________________________________

## Phase 1 — Foundation (5 tasks)

Build the transport contract and accessor scaffolding. After Phase 1, the lowest-level abstraction is in place but no Slack endpoints are callable yet.

______________________________________________________________________

### Task 1: SlackTransport interface, SlackResponse, SlackApiError

**Files:**

- Create: `typescript/packages/core/src/core/slack/_client.ts`
- Create: `typescript/packages/core/src/core/slack/_client.test.ts`

**Step 1: Write the failing tests**

```ts
// typescript/packages/core/src/core/slack/_client.test.ts
import { describe, expect, it } from 'vitest'
import { HttpSlackTransport, SlackApiError, type SlackResponse } from './_client.ts'

class TestTransport extends HttpSlackTransport {
  constructor(
    private readonly base: string,
    private readonly auth: Record<string, string>,
    public readonly fetchImpl: typeof fetch,
  ) {
    super()
    // Inject the fetch implementation into the base class via a private hook.
    ;(this as unknown as { fetch: typeof fetch }).fetch = fetchImpl
  }
  protected baseUrl(): string { return this.base }
  protected authHeaders(): Record<string, string> { return this.auth }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('HttpSlackTransport', () => {
  it('GET when body is undefined; URL = base/endpoint with params', async () => {
    let observedUrl = ''
    let observedMethod = ''
    const fakeFetch: typeof fetch = async (url, init) => {
      observedUrl = String(url)
      observedMethod = init?.method ?? 'GET'
      return jsonResponse({ ok: true, members: [] })
    }
    const t = new TestTransport('https://slack.com/api', { Authorization: 'Bearer x' }, fakeFetch)
    const data = await t.call('users.list', { limit: '5' })
    expect(observedMethod).toBe('GET')
    expect(observedUrl).toBe('https://slack.com/api/users.list?limit=5')
    expect((data as SlackResponse).ok).toBe(true)
  })

  it('POST when body is provided; body is JSON stringified', async () => {
    let observedBody: string | undefined
    let observedMethod = ''
    const fakeFetch: typeof fetch = async (_url, init) => {
      observedMethod = init?.method ?? ''
      observedBody = init?.body as string
      return jsonResponse({ ok: true, ts: '1.0' })
    }
    const t = new TestTransport('https://slack.com/api', { Authorization: 'Bearer x' }, fakeFetch)
    await t.call('chat.postMessage', undefined, { channel: 'C1', text: 'hi' })
    expect(observedMethod).toBe('POST')
    expect(observedBody).toBe(JSON.stringify({ channel: 'C1', text: 'hi' }))
  })

  it('throws SlackApiError when ok=false', async () => {
    const fakeFetch: typeof fetch = async () => jsonResponse({ ok: false, error: 'channel_not_found' })
    const t = new TestTransport('https://slack.com/api', {}, fakeFetch)
    await expect(t.call('conversations.history', { channel: 'C1' })).rejects.toBeInstanceOf(SlackApiError)
    await expect(t.call('conversations.history', { channel: 'C1' })).rejects.toThrow(/channel_not_found/)
  })

  it('attaches auth headers + Content-Type', async () => {
    let observedHeaders: HeadersInit | undefined
    const fakeFetch: typeof fetch = async (_url, init) => {
      observedHeaders = init?.headers
      return jsonResponse({ ok: true })
    }
    const t = new TestTransport('https://slack.com/api', { Authorization: 'Bearer xyz', 'X-User': 'u1' }, fakeFetch)
    await t.call('auth.test')
    const h = new Headers(observedHeaders)
    expect(h.get('Authorization')).toBe('Bearer xyz')
    expect(h.get('X-User')).toBe('u1')
    expect(h.get('Content-Type')).toMatch(/application\/json/)
  })
})
```

**Step 2: Run test to verify it fails**

```bash
cd typescript && pnpm --filter @struktoai/mirage-core test -- --run _client
```

Expected: FAIL — module not found.

**Step 3: Write the implementation**

```ts
// typescript/packages/core/src/core/slack/_client.ts
export type SlackResponse = { ok: boolean } & Record<string, unknown>

export class SlackApiError extends Error {
  constructor(
    public readonly endpoint: string,
    public readonly slackError: string,
  ) {
    super(`Slack API error (${endpoint}): ${slackError}`)
    this.name = 'SlackApiError'
  }
}

export interface SlackTransport {
  call(endpoint: string, params?: Record<string, string>, body?: unknown): Promise<SlackResponse>
}

export abstract class HttpSlackTransport implements SlackTransport {
  // Indirection so tests can inject a fake fetch without subclass plumbing.
  protected readonly fetch: typeof fetch = globalThis.fetch.bind(globalThis)

  protected abstract baseUrl(): string
  protected abstract authHeaders(): Promise<Record<string, string>> | Record<string, string>

  async call(
    endpoint: string,
    params?: Record<string, string>,
    body?: unknown,
  ): Promise<SlackResponse> {
    const base = this.baseUrl().replace(/\/$/, '')
    const url = new URL(`${base}/${endpoint}`)
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    }
    const auth = await this.authHeaders()
    const init: RequestInit = {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...auth },
    }
    if (body !== undefined) init.body = JSON.stringify(body)
    const res = await this.fetch(url, init)
    const data = (await res.json()) as SlackResponse
    if (!data.ok) {
      const err = String((data as { error?: unknown }).error ?? 'unknown_error')
      throw new SlackApiError(endpoint, err)
    }
    return data
  }
}

export class NodeSlackTransport extends HttpSlackTransport {
  constructor(
    private readonly token: string,
    private readonly searchToken?: string,
  ) {
    super()
  }
  protected baseUrl(): string {
    return 'https://slack.com/api'
  }
  protected authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}` }
  }
  // searchToken is read by core/slack/search.ts at call time, not here.
  getSearchToken(): string | undefined {
    return this.searchToken
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd typescript && pnpm --filter @struktoai/mirage-core test -- --run _client
```

Expected: PASS — 4/4 tests.

**Step 5: Commit**

```bash
git add typescript/packages/core/src/core/slack/_client.ts typescript/packages/core/src/core/slack/_client.test.ts
git commit -m "feat(core): add SlackTransport contract + HttpSlackTransport base + NodeSlackTransport

Mirrors python/mirage/core/slack/_client.py. Path-based contract so node
and browser transports share fetch logic; only baseUrl()/authHeaders()
differ. Throws SlackApiError when response.ok is false."
```

______________________________________________________________________

### Task 2: BrowserSlackTransport with proxyUrl + getHeaders callback

**Files:**

- Create: `typescript/packages/core/src/core/slack/_client_browser.ts`
- Create: `typescript/packages/core/src/core/slack/_client_browser.test.ts`

**Step 1: Write the failing tests**

Note: lint-clean fake-fetch pattern matches the post-fix Task 1 test scaffolding (no `async` without await, no `String(url)` base-to-string).

```ts
// typescript/packages/core/src/core/slack/_client_browser.test.ts
import { describe, expect, it } from 'vitest'
import { BrowserSlackTransport } from './_client_browser.ts'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
}

describe('BrowserSlackTransport', () => {
  it('routes to {proxyUrl}/{endpoint} with no auth header by default', async () => {
    let observedUrl = ''
    let observedHeaders: HeadersInit | undefined
    const fakeFetch: typeof fetch = (u, init) => {
      observedUrl = (u as URL).href
      observedHeaders = init?.headers
      return Promise.resolve(jsonResponse({ ok: true }))
    }
    const t = new BrowserSlackTransport({ proxyUrl: '/api/slack' })
    ;(t as unknown as { fetch: typeof fetch }).fetch = fakeFetch
    await t.call('users.list')
    expect(observedUrl).toMatch(/\/api\/slack\/users\.list$/)
    const h = new Headers(observedHeaders)
    expect(h.get('Authorization')).toBeNull()
  })

  it('attaches headers from getHeaders() callback', async () => {
    let observedHeaders: HeadersInit | undefined
    const fakeFetch: typeof fetch = (_u, init) => {
      observedHeaders = init?.headers
      return Promise.resolve(jsonResponse({ ok: true }))
    }
    const t = new BrowserSlackTransport({
      proxyUrl: '/api/slack',
      getHeaders: () => ({ Authorization: 'Bearer user-jwt', 'X-Workspace': 'w1' }),
    })
    ;(t as unknown as { fetch: typeof fetch }).fetch = fakeFetch
    await t.call('auth.test')
    const h = new Headers(observedHeaders)
    expect(h.get('Authorization')).toBe('Bearer user-jwt')
    expect(h.get('X-Workspace')).toBe('w1')
  })

  it('strips trailing slash from proxyUrl', async () => {
    let observedUrl = ''
    const fakeFetch: typeof fetch = (u) => {
      observedUrl = (u as URL).href
      return Promise.resolve(jsonResponse({ ok: true }))
    }
    const t = new BrowserSlackTransport({ proxyUrl: '/api/slack/' })
    ;(t as unknown as { fetch: typeof fetch }).fetch = fakeFetch
    await t.call('users.list')
    expect(observedUrl).toMatch(/\/api\/slack\/users\.list$/)
  })

  it('awaits async getHeaders()', async () => {
    let observedHeaders: HeadersInit | undefined
    const fakeFetch: typeof fetch = (_u, init) => {
      observedHeaders = init?.headers
      return Promise.resolve(jsonResponse({ ok: true }))
    }
    const t = new BrowserSlackTransport({
      proxyUrl: '/api/slack',
      getHeaders: () => Promise.resolve({ Authorization: 'Bearer async-jwt' }),
    })
    ;(t as unknown as { fetch: typeof fetch }).fetch = fakeFetch
    await t.call('auth.test')
    const h = new Headers(observedHeaders)
    expect(h.get('Authorization')).toBe('Bearer async-jwt')
  })
})
```

Note on `proxyUrl: '/api/slack'`: relative URLs go through `new URL('/api/slack/users.list')` which throws unless a base is provided. `BrowserSlackTransport` must therefore either (a) accept absolute URLs only and document this, or (b) prepend `globalThis.location?.origin ?? 'http://localhost'` when the proxyUrl is relative. Implementation should pick (b) so the browser can use `'/api/slack'` style paths naturally — see Step 3.

**Step 2: Run test → FAIL (module missing)**

**Step 3: Write the implementation**

`HttpSlackTransport` builds `new URL(\`${base}/${endpoint}\`)`. Relative URLs (e.g. `/api/slack`) need a base — resolve against `globalThis.location?.origin`when present, fall back to`http://localhost\` for non-browser environments (test/SSR).

```ts
// typescript/packages/core/src/core/slack/_client_browser.ts
import { HttpSlackTransport } from './_client.ts'

export interface BrowserSlackTransportOptions {
  proxyUrl: string
  getHeaders?: () => Promise<Record<string, string>> | Record<string, string>
}

export class BrowserSlackTransport extends HttpSlackTransport {
  constructor(private readonly opts: BrowserSlackTransportOptions) {
    super()
  }
  protected baseUrl(): string {
    const trimmed = this.opts.proxyUrl.replace(/\/+$/, '')
    if (/^https?:\/\//i.test(trimmed)) return trimmed
    const origin = (globalThis as { location?: { origin?: string } }).location?.origin ?? 'http://localhost'
    return `${origin}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`
  }
  protected async authHeaders(): Promise<Record<string, string>> {
    const cb = this.opts.getHeaders
    if (cb === undefined) return {}
    return await cb()
  }
}
```

**Step 4: Run test → PASS (4/4)**

**Step 5: Commit**

```bash
git add typescript/packages/core/src/core/slack/_client_browser.ts typescript/packages/core/src/core/slack/_client_browser.test.ts
git commit -m "feat(core): add BrowserSlackTransport (proxy URL + optional header callback)

Same fetch logic as NodeSlackTransport (inherits HttpSlackTransport);
only baseUrl()/authHeaders() differ. Browser never holds Slack tokens —
proxy server adds Bearer auth before forwarding to api.slack.com."
```

______________________________________________________________________

### Task 3: SlackAccessor

**Files:**

- Create: `typescript/packages/core/src/accessor/slack.ts`
- Create: `typescript/packages/core/src/accessor/slack.test.ts`

**Step 1: Failing test**

```ts
// typescript/packages/core/src/accessor/slack.test.ts
import { describe, expect, it } from 'vitest'
import { SlackAccessor } from './slack.ts'
import type { SlackResponse, SlackTransport } from '../core/slack/_client.ts'

class FakeTransport implements SlackTransport {
  public readonly calls: Array<{ endpoint: string; params?: Record<string, string>; body?: unknown }> = []
  call(endpoint: string, params?: Record<string, string>, body?: unknown): Promise<SlackResponse> {
    this.calls.push({ endpoint, ...(params !== undefined ? { params } : {}), ...(body !== undefined ? { body } : {}) })
    return Promise.resolve({ ok: true })
  }
}

describe('SlackAccessor', () => {
  it('exposes the transport unchanged', () => {
    const t = new FakeTransport()
    const a = new SlackAccessor(t)
    expect(a.transport).toBe(t)
  })

  it('relays calls through transport.call', async () => {
    const t = new FakeTransport()
    const a = new SlackAccessor(t)
    await a.transport.call('users.list', { limit: '5' })
    expect(t.calls).toEqual([{ endpoint: 'users.list', params: { limit: '5' } }])
  })
})
```

**Step 2: Run → FAIL (module missing)**

**Step 3: Implementation**

Note: actual base class in `accessor/base.ts` is `Accessor` (not `BaseAccessor`).

```ts
// typescript/packages/core/src/accessor/slack.ts
import { Accessor } from './base.ts'
import type { SlackTransport } from '../core/slack/_client.ts'

export class SlackAccessor extends Accessor {
  constructor(public readonly transport: SlackTransport) {
    super()
  }
}
```

**Step 4: Run → PASS (2/2)**

**Step 5: Commit**

```bash
git add typescript/packages/core/src/accessor/slack.ts typescript/packages/core/src/accessor/slack.test.ts
git commit -m "feat(core): add SlackAccessor wrapping a SlackTransport

Mirrors python/mirage/accessor/slack.py. Differs from S3/RAM accessors
(which take config) because Slack's auth model varies per runtime —
transport is the natural injection point."
```

______________________________________________________________________

### Task 4: ResourceName.SLACK constant + index.ts re-exports

**Files:**

- Modify: `typescript/packages/core/src/types.ts` — add `ResourceName.SLACK = 'slack'`
- Modify: `typescript/packages/core/src/index.ts` — re-export Slack types

**Step 1: Failing test**

```ts
// typescript/packages/core/src/types.test.ts (append; do not replace existing)
import { ResourceName } from './types.ts'

describe('ResourceName.SLACK', () => {
  it('exists with value "slack"', () => {
    expect(ResourceName.SLACK).toBe('slack')
  })
})
```

**Step 2: Run → FAIL (no SLACK on enum)**

**Step 3: Implementation**

In `types.ts`, find `ResourceName` enum/const-object and add `SLACK = 'slack'` (or `SLACK: 'slack'`) preserving existing entries' style.

In `index.ts`, append:

```ts
export {
  HttpSlackTransport,
  NodeSlackTransport,
  SlackApiError,
  type SlackResponse,
  type SlackTransport,
} from './core/slack/_client.ts'
export {
  BrowserSlackTransport,
  type BrowserSlackTransportOptions,
} from './core/slack/_client_browser.ts'
export { SlackAccessor } from './accessor/slack.ts'
```

**Step 4: Run → PASS**

**Step 5: Commit**

```bash
git add typescript/packages/core/src/types.ts typescript/packages/core/src/types.test.ts typescript/packages/core/src/index.ts
git commit -m "feat(core): add ResourceName.SLACK + re-export Slack transport/accessor"
```

______________________________________________________________________

### Task 5: Phase 1 build + checkpoint

**Step 1: Build all packages**

```bash
cd typescript && pnpm -r --filter './packages/*' build
```

Expected: 0 errors. If browser package fails because it can't find `BrowserSlackTransport` from `@struktoai/mirage-core`, that's fine (it will be wired in Phase 5).

**Step 2: Run all tests**

```bash
cd typescript && pnpm -r --filter './packages/*' test
```

Expected: all green.

**Step 3: Commit a checkpoint marker if any leftover formatting changes**

```bash
git status
# if clean: skip; otherwise:
git add -A && git commit -m "chore: phase 1 (slack transport foundation) checkpoint"
```

______________________________________________________________________

## Phase 2 — Read pipeline (9 tasks)

Build the path → SlackScope decoder, the Slack API helpers (channels/users/history), the VFS ops (read/readdir/stat), and the glob expander. After Phase 2, `SlackAccessor` + ops are usable directly without going through commands or shell.

______________________________________________________________________

### Task 6: SlackScope + detectScope

**Reference:** `python/mirage/core/slack/scope.py`

**Files:**

- Create: `typescript/packages/core/src/core/slack/scope.ts`
- Create: `typescript/packages/core/src/core/slack/scope.test.ts`

**Step 1: Failing tests** — port `scope.py`'s implicit test cases. At minimum:

```ts
import { describe, expect, it } from 'vitest'
import { detectScope } from './scope.ts'
import { PathSpec } from '../../types.ts'

describe('detectScope', () => {
  it('root → use_native, resourcePath /', () => {
    const s = detectScope(new PathSpec({ original: '/', directory: '/' }))
    expect(s.useNative).toBe(true)
    expect(s.resourcePath).toBe('/')
  })

  it('/channels → container=channels, useNative', () => {
    const s = detectScope(new PathSpec({ original: '/channels', directory: '/channels' }))
    expect(s.useNative).toBe(true)
    expect(s.container).toBe('channels')
  })

  it('/channels/general__C123 → channelName=general, channelId=C123', () => {
    const s = detectScope(new PathSpec({ original: '/channels/general__C123', directory: '/channels/general__C123' }))
    expect(s.channelName).toBe('general')
    expect(s.channelId).toBe('C123')
    expect(s.container).toBe('channels')
    expect(s.useNative).toBe(true)
  })

  it('/channels/general__C123/2026-04-24.jsonl → date scope, useNative=false', () => {
    const s = detectScope(new PathSpec({
      original: '/channels/general__C123/2026-04-24.jsonl',
      directory: '/channels/general__C123/2026-04-24.jsonl',
    }))
    expect(s.dateStr).toBe('2026-04-24')
    expect(s.useNative).toBe(false)
  })

  it('/users → useNative=false, resourcePath=users', () => {
    const s = detectScope(new PathSpec({ original: '/users', directory: '/users' }))
    expect(s.useNative).toBe(false)
    expect(s.resourcePath).toBe('users')
  })

  it('handles dirname without __id (just name)', () => {
    const s = detectScope(new PathSpec({ original: '/channels/general', directory: '/channels/general' }))
    expect(s.channelName).toBe('general')
    expect(s.channelId).toBeUndefined()
  })

  it('respects PathSpec.prefix', () => {
    const s = detectScope(new PathSpec({
      original: '/slack/channels/general__C1',
      directory: '/slack/channels/general__C1',
      prefix: '/slack',
    }))
    expect(s.channelName).toBe('general')
    expect(s.channelId).toBe('C1')
  })
})
```

**Step 2: Run → FAIL**

**Step 3: Implementation** — port `python/mirage/core/slack/scope.py` directly. Camel-case fields:

```ts
export interface SlackScope {
  useNative: boolean
  channelName?: string
  channelId?: string
  container?: string
  dateStr?: string
  resourcePath: string
}

function splitDirname(dirname: string): [string, string | undefined] {
  const idx = dirname.lastIndexOf('__')
  if (idx < 0) return [dirname, undefined]
  const name = dirname.slice(0, idx)
  const cid = dirname.slice(idx + 2)
  return [name, cid === '' ? undefined : cid]
}

export function detectScope(path: PathSpec): SlackScope { /* port from Python verbatim */ }
```

Use `path.prefix`, `path.pattern`, `path.directory`, `path.key` (or whatever the TS PathSpec exposes — check [types.ts](typescript/packages/core/src/types.ts)).

**Step 4: Run → PASS (7/7)**

**Step 5: Commit**

```bash
git commit -m "feat(core): detectScope for Slack VFS paths

Port of python/mirage/core/slack/scope.py. Decides between native (cache-driven)
and direct-Slack-API resolution per path. Handles channels/dms/users root +
{name}__{id} dirname format + per-day .jsonl files."
```

______________________________________________________________________

### Task 7: Slack-specific entry helpers

**Reference:** dirname/filename helpers from `python/mirage/core/slack/readdir.py:_channel_dirname / _dm_dirname / _user_filename` and `mirage.utils.sanitize.sanitize_name`.

**Files:**

- Create: `typescript/packages/core/src/core/slack/entry.ts`
- Create: `typescript/packages/core/src/core/slack/entry.test.ts`

**Step 1: Failing tests** — sanitize_name, channelDirname (`general__C0123`), dmDirname (`alice__D0456`), userFilename (`alice__U0789.json`).

**Step 3: Implementation**

```ts
// entry.ts
export function sanitizeName(name: string): string {
  // Mirror python/mirage/utils/sanitize.py: replace anything non-[a-zA-Z0-9._-] with '_'
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}
export function channelDirname(ch: { id: string; name?: string }): string {
  return `${sanitizeName(ch.name ?? ch.id ?? 'unknown')}__${ch.id}`
}
export function dmDirname(dm: { id: string; user?: string }, userMap: Record<string, string>): string {
  const uid = dm.user ?? ''
  return `${sanitizeName(userMap[uid] ?? uid)}__${dm.id}`
}
export function userFilename(u: { id: string; name?: string }): string {
  return `${sanitizeName(u.name ?? u.id ?? 'unknown')}__${u.id}.json`
}
```

Verify against `python/mirage/utils/sanitize.py` for the exact regex.

**Step 5: Commit** `feat(core): slack entry-name helpers (sanitizeName, channelDirname, dmDirname, userFilename)`.

______________________________________________________________________

### Task 8: listChannels + listDms

**Reference:** `python/mirage/core/slack/channels.py`

**Files:**

- Create: `typescript/packages/core/src/core/slack/channels.ts`
- Create: `typescript/packages/core/src/core/slack/channels.test.ts`

**Step 1: Failing tests** — port pagination behavior. Tests inject a `FakeSlackTransport` that returns paged `conversations.list` responses with `response_metadata.next_cursor`, verify accumulated channels.

```ts
// excerpt
it('paginates conversations.list using response_metadata.next_cursor', async () => {
  const calls: Array<Record<string, string> | undefined> = []
  const t: SlackTransport = {
    call(endpoint, params) {
      calls.push(params)
      if (calls.length === 1) {
        return Promise.resolve({ ok: true, channels: [{ id: 'C1', name: 'a' }], response_metadata: { next_cursor: 'curs2' } })
      }
      return Promise.resolve({ ok: true, channels: [{ id: 'C2', name: 'b' }], response_metadata: { next_cursor: '' } })
    },
  }
  const out = await listChannels(new SlackAccessor(t))
  expect(out.map(c => c.id)).toEqual(['C1', 'C2'])
  expect(calls[0]).toMatchObject({ types: 'public_channel,private_channel' })
  expect(calls[1]).toMatchObject({ cursor: 'curs2' })
})
```

**Step 3: Implementation** — port Python pagination loop. Both `listChannels` (calls `conversations.list` with `types=public_channel,private_channel`) and `listDms` (with `types=im`).

**Step 5: Commit** `feat(core): slack listChannels + listDms with cursor pagination`

______________________________________________________________________

### Task 9: listUsers

**Reference:** `python/mirage/core/slack/users.py`

**Files:**

- Create: `typescript/packages/core/src/core/slack/users.ts`
- Create: `typescript/packages/core/src/core/slack/users.test.ts`

Same pagination pattern as channels. Calls `users.list`. Filters out deleted users (`deleted: false`) — match Python's filter exactly.

**Commit:** `feat(core): slack listUsers with cursor pagination`

______________________________________________________________________

### Task 10: history.ts — fetchHistory + dateRange

**Reference:** `python/mirage/core/slack/history.py` + the `_date_range` / `_latest_message_ts` helpers in `readdir.py`.

**Files:**

- Create: `typescript/packages/core/src/core/slack/history.ts`
- Create: `typescript/packages/core/src/core/slack/history.test.ts`

**Behavior:**

- `latestMessageTs(accessor, channelId)` — calls `conversations.history` with `limit=1`, returns float ts or `null`.
- `dateRange(latestTs, created, maxDays = 90)` — returns ISO date strings, newest first, capped at maxDays. Mirror Python's exact arithmetic.
- `fetchHistory(accessor, channelId, dateStr)` — fetches messages whose `ts` falls within `[startOfDay, endOfDay)` UTC. Uses `oldest`+`latest` params. Paginates if `has_more`.

**Tests:**

- `dateRange` with various `latestTs`/`created` combos including exactly-90-days, 100-days (caps to 90), single-day.
- `fetchHistory` returns messages in API order; paginates on `has_more=true`; passes correct `oldest`/`latest` epoch seconds.

**Commit:** `feat(core): slack history fetching (dateRange, latestMessageTs, fetchHistory)`

______________________________________________________________________

### Task 11: ops/slack/readdir.ts

**Reference:** `python/mirage/core/slack/readdir.py` + `python/mirage/ops/slack/readdir.py`

**Files:**

- Create: `typescript/packages/core/src/ops/slack/readdir.ts`
- Create: `typescript/packages/core/src/ops/slack/readdir.test.ts`

The Python `core/slack/readdir.py` is the meaty one (193 lines). Port the full state machine:

1. Empty key (root) → return `[channels, dms, users]`.
1. `channels` / `dms` / `users` → list all entries from API, populate `IndexCacheStore`, return entry names.
1. `channels/{name__id}` or `dms/{name__id}` → look up in index (auto-bootstrap parent if missing), call `latestMessageTs`, build `dateRange`, return `*.jsonl` filenames.
1. Unknown → empty.

The `ops/slack/readdir.py` is the thin op-registration wrapper (calls `core/slack/readdir.readdir` and wraps in an `Op` record).

**Tests** use `FakeSlackTransport` returning canned channels/users + a `RAMIndexCacheStore`. Verify entries match Python's output for each key shape.

**Commit:** `feat(core): slack readdir (listing channels/dms/users + per-day jsonl files)`

______________________________________________________________________

### Task 12: ops/slack/read.ts

**Reference:** `python/mirage/core/slack/read.py` + `python/mirage/ops/slack/read.py`

**Files:**

- Create: `typescript/packages/core/src/core/slack/read.ts`
- Create: `typescript/packages/core/src/ops/slack/read.ts`
- Create: `typescript/packages/core/src/core/slack/read.test.ts`

Two read shapes:

- `users/{name__id}.json` → fetch user via `users.info`, return JSON-stringified body.
- `channels/{name__id}/{date}.jsonl` → call `fetchHistory`, format as JSON-per-line, return as bytes.
- Anything else → throw `FileNotFoundError` (use `ENOENT` Node error or core's existing not-found error).

**Tests:** verify both shapes produce expected output for canned API responses. Verify ENOENT for unknown paths.

**Commit:** `feat(core): slack read for user JSON + channel jsonl files`

______________________________________________________________________

### Task 13: ops/slack/stat.ts

**Reference:** `python/mirage/core/slack/stat.py` + `python/mirage/ops/slack/stat.py`

**Files:**

- Create: `typescript/packages/core/src/core/slack/stat.ts`
- Create: `typescript/packages/core/src/ops/slack/stat.ts`
- Create: `typescript/packages/core/src/core/slack/stat.test.ts`

Returns `FileStat` with `type` (FILE/DIRECTORY), `size` (best-effort or `null`), `modified` (channel `created` for dirs, latest message ts for jsonl files, user `updated` for user files).

Path shapes to handle:

- `/`, `/channels`, `/dms`, `/users` → DIRECTORY
- `/channels/{name__id}/`, `/dms/{name__id}/` → DIRECTORY
- `/channels/{name__id}/{date}.jsonl` → FILE
- `/users/{name__id}.json` → FILE

**Tests** mirror Python's `stat.py` behavior cases.

**Commit:** `feat(core): slack stat for virtual paths`

______________________________________________________________________

### Task 14: glob.ts — resolveSlackGlob

**Reference:** `python/mirage/core/slack/glob.py`

**Files:**

- Create: `typescript/packages/core/src/core/slack/glob.ts`
- Create: `typescript/packages/core/src/core/slack/glob.test.ts`

For each input `PathSpec`:

- Already resolved → pass through.
- No pattern → pass through.
- Has pattern → call `readdir` for the directory, fnmatch against entries (use the existing `fnmatch` helper from `core/s3/_client.ts` or duplicate it). Cap matches at `SCOPE_ERROR` (import the existing constant from `commands/spec/`).

**Tests:** glob `/channels/*.jsonl` returns matched filenames as PathSpecs; glob with no pattern returns input unchanged.

**Commit:** `feat(core): slack resolveSlackGlob (fnmatch over readdir entries)`

______________________________________________________________________

### Task 15: Phase 2 build + checkpoint

```bash
cd typescript && pnpm -r --filter './packages/*' build && pnpm -r --filter './packages/*' test
```

Expected: all green. Commit any leftover formatting.

______________________________________________________________________

## Phase 3 — Filesystem commands (7 tasks, batched by similarity)

Port the 13 generic filesystem commands. Each Slack command is a thin wrapper that dispatches to `core/slack/{read,readdir,stat}` and then runs the standard command logic from the spec layer.

**Reference patterns:**

- Existing TS S3 commands: `typescript/packages/core/src/commands/builtin/s3/{cat,head,tail,grep,wc,...}/`
- Each command has an `index.ts` with the registered command + a `command.ts` with the actual handler.

For each Slack command:

1. Look at the corresponding S3 command for structure.
1. Look at the corresponding Python `commands/builtin/slack/*.py` for behavior.
1. Wire the command to `S3_COMMANDS`-style export array.

After Phase 3, every shell command in Python's slack example works in TS.

______________________________________________________________________

### Task 16: ls + tree

**Reference Python:** `commands/builtin/slack/ls.py` (147 lines), `commands/builtin/slack/tree.py` (109 lines)

**Files:**

- Create: `typescript/packages/core/src/commands/builtin/slack/ls.ts`
- Create: `typescript/packages/core/src/commands/builtin/slack/tree.ts`
- Tests next to each.

**Behavior — ls:** parse argv (`-l`, `-a`, `-1` etc. — match S3's flag set), call `core/slack/readdir`, format output. For `-l` long form, call `stat` for each entry to fill in size/modified.

**Behavior — tree:** recursive readdir up to depth `-L`. Match Python's tree formatting (├──, └──).

**Tests:** verify `ls /channels` lists entries one-per-line; `ls -l` includes size+date; `tree -L 1 /` matches Python output.

**Commit:** `feat(core): slack ls + tree commands`

______________________________________________________________________

### Task 17: cat + head + tail + wc

**Reference Python:** `cat.py` (56), `head.py` (59), `tail.py` (61), `wc.py` (63)

**Files:** four `.ts` files under `commands/builtin/slack/`, plus tests.

All four read the file (via `core/slack/read`) then apply the standard command's logic. They're nearly identical to the S3 versions — port the S3 command's structure, swap `S3Accessor` for `SlackAccessor`, swap `s3Read` for `slackRead`.

**Tests:** verify `cat`, `head -n N`, `tail -n N`, `wc -l/-w/-c` against canned jsonl content.

**Commit:** `feat(core): slack cat + head + tail + wc commands`

______________________________________________________________________

### Task 18: find

**Reference Python:** `commands/builtin/slack/find.py` (101 lines)

Recursive readdir + name pattern match (`-name`). Optionally `-type f` / `-type d` filter.

**Tests:** `find /channels/{X}/ -name "*.jsonl"` returns all date files.

**Commit:** `feat(core): slack find command`

______________________________________________________________________

### Task 19: grep

**Reference Python:** `commands/builtin/slack/grep/` (directory — 153 lines across files), `commands/builtin/slack/rg.py` (153)

**Note:** Python has both `grep` and `rg`. TS S3 has `grep` and the `rg` alias is registered as the same command. Match that pattern.

**Behavior:** read each input file (or recursively if directory), apply pattern match per line, format output (`-l` flag for filenames-only, `-c` for counts, `-i` for case-insensitive).

**Tests:** `grep "hello" /channels/X/2026-04-24.jsonl`, `grep -l "x" /channels/X/`, `grep -c "y" file`.

**Commit:** `feat(core): slack grep + rg commands`

______________________________________________________________________

### Task 20: stat command

**Reference Python:** `commands/builtin/slack/stat.py` (78)

CLI command that calls the stat op and formats output the same way as `coreutils stat`. Match Python's exact format string.

**Commit:** `feat(core): slack stat command`

______________________________________________________________________

### Task 21: jq

**Reference Python:** `commands/builtin/slack/jq.py` (79)

Read file, pipe through the existing `core/jq/` evaluator, write to stdout. The work is entirely wiring — `core/jq/` already exists and is used by S3.

**Commit:** `feat(core): slack jq command`

______________________________________________________________________

### Task 22: basename + dirname + realpath

**Reference Python:** 19, 19, 44 lines. These are pure path operations — they don't touch the Slack accessor.

**Implementation:** these can almost certainly just register the existing `S3_COMMANDS` `basename`/`dirname`/`realpath` against `ResourceName.SLACK`, since they don't read any data. Confirm by reading the S3 versions; if they're truly resource-agnostic, register them directly. If not, port the Python versions.

**Tests:** `basename /channels/X/file.jsonl` → `file.jsonl`, etc.

**Commit:** `feat(core): slack basename + dirname + realpath commands`

______________________________________________________________________

### Task 23: SLACK_COMMANDS export array + Phase 3 checkpoint

**Files:**

- Create: `typescript/packages/core/src/commands/builtin/slack/index.ts` — export `SLACK_COMMANDS` array containing all 13 commands.
- Modify: `typescript/packages/core/src/index.ts` — re-export `SLACK_COMMANDS`.

```ts
export const SLACK_COMMANDS = [
  lsCmd, treeCmd, catCmd, headCmd, tailCmd, wcCmd,
  findCmd, grepCmd, rgCmd, statCmd, jqCmd,
  basenameCmd, dirnameCmd, realpathCmd,
] as const
```

**Build + test all packages.** Commit checkpoint.

______________________________________________________________________

## Phase 4 — Slack-specific commands (6 tasks)

These are write/RPC commands, not filesystem commands. They each correspond to one Slack API endpoint.

**Reference patterns:** Python's command structure for each is in `commands/builtin/slack/slack_*.py`. Most are 25-37 lines each.

______________________________________________________________________

### Task 24: slack_post_message

**Reference Python:** `slack_post_message.py` (33), `core/slack/post.py`

**Files:**

- Create: `typescript/packages/core/src/core/slack/post.ts` (postMessage helper) + test
- Create: `typescript/packages/core/src/commands/builtin/slack/slack_post_message.ts` + test

**Behavior:** `postMessage(accessor, channelId, text, opts?)` → POSTs `chat.postMessage`. Command parses `--channel`, `--text`, optional `--blocks`, calls helper.

**Commit:** `feat(core): slack_post_message command + postMessage helper`

______________________________________________________________________

### Task 25: slack_reply_to_thread

**Reference Python:** `slack_reply_to_thread.py` (37)

Same as post but with `thread_ts` parameter.

**Commit:** `feat(core): slack_reply_to_thread command`

______________________________________________________________________

### Task 26: slack_add_reaction

**Reference Python:** `slack_add_reaction.py` (37), `core/slack/react.py`

**Files:**

- Create: `core/src/core/slack/react.ts` + test
- Create: `commands/builtin/slack/slack_add_reaction.ts` + test

**Behavior:** POSTs `reactions.add` with `channel`, `timestamp`, `name` (emoji code).

**Commit:** `feat(core): slack_add_reaction command + addReaction helper`

______________________________________________________________________

### Task 27: slack_get_users + slack_get_user_profile

**Reference Python:** `slack_get_users.py` (28), `slack_get_user_profile.py` (28)

`get_users` calls `users.list` (already implemented in Task 9). `get_user_profile` calls `users.profile.get`.

**Commit:** `feat(core): slack_get_users + slack_get_user_profile commands`

______________________________________________________________________

### Task 28: slack_search

**Reference Python:** `slack_search.py` (25), `core/slack/search.py`

**Files:**

- Create: `core/src/core/slack/search.ts` + test
- Create: `commands/builtin/slack/slack_search.ts` + test

**Behavior:** POSTs `search.messages` with the query. Uses `searchToken` from `NodeSlackTransport.getSearchToken()` if set; otherwise falls back to the main token. In browser, the proxy decides — just calls `transport.call('search.messages', ..., body)` directly.

**Test:** verify search uses searchToken when present (node side); browser test verifies it just calls through.

**Commit:** `feat(core): slack_search command + search helper`

______________________________________________________________________

### Task 29: SLACK_VFS_OPS + SLACK_COMMANDS extended export, Phase 4 checkpoint

**Files:**

- Modify: `commands/builtin/slack/index.ts` — append the 6 slack-specific commands.
- Create: `ops/slack/index.ts` — export `SLACK_VFS_OPS = [readOp, readdirOp, statOp]`.
- Modify: `core/src/index.ts` — re-export `SLACK_VFS_OPS`.

Build + test. Commit checkpoint.

______________________________________________________________________

## Phase 5 — Resource classes + registry wiring (4 tasks)

After Phase 5, end users can `new SlackResource(config)` and pass it to `new Workspace(...)`.

______________________________________________________________________

### Task 30: Core SlackResource shared base

**Reference Python:** `python/mirage/resource/slack/slack.py` (49)

**Files:**

- Create: `typescript/packages/core/src/resource/slack/prompt.ts` — port `python/mirage/resource/slack/prompt.py` PROMPT + WRITE_PROMPT verbatim (translate Python f-strings to TS template literals).
- Create: `typescript/packages/core/src/resource/slack/base.ts` — abstract base `SlackResourceBase implements Resource` with `kind = ResourceName.SLACK`, `isRemote = true`, `prompt = PROMPT`, ops/commands wired via `SLACK_VFS_OPS` + `SLACK_COMMANDS`. Constructor takes `accessor: SlackAccessor`. `getState()` redacts the config (subclass provides `getRedactedConfig()`).

This base is what node and browser SlackResource extend.

**Test:** mock accessor, instantiate base via test subclass, assert ops/commands wired and getState shape matches.

**Commit:** `feat(core): SlackResource base class with shared ops/commands wiring`

______________________________________________________________________

### Task 31: Node SlackResource + config + registry

**Files:**

- Create: `typescript/packages/node/src/resource/slack/config.ts` — `SlackConfig`, `redactSlackConfig()`, `normalizeSlackConfig()` (snake_case → camelCase).
- Create: `typescript/packages/node/src/resource/slack/prompt.ts` — re-export from core (or write node-specific lead-in if Python has one; likely just re-export).
- Create: `typescript/packages/node/src/resource/slack/slack.ts` — `SlackResource extends SlackResourceBase`. Constructor `new SlackResource(config: SlackConfig)` builds `NodeSlackTransport(config.token, config.searchToken)` → `SlackAccessor` → `super({ accessor })`.
- Modify: `typescript/packages/node/src/resource/registry.ts` — register `SlackResource` for `ResourceName.SLACK` with `normalizeSlackConfig` as the YAML normalizer.
- Modify: `typescript/packages/node/src/index.ts` — re-export `SlackResource`, `SlackConfig`.

**Tests:**

- `SlackResource` instantiates, exposes ops + commands.
- Registry creates `SlackResource` from a snake_case YAML-style input via normalizer.
- `getState()` redacts `token` and `searchToken`.

**Commit:** `feat(node): SlackResource with bot-token + searchToken + registry wiring`

______________________________________________________________________

### Task 32: Browser SlackResource + config + registry

**Files:**

- Create: `typescript/packages/browser/src/resource/slack/config.ts` — `SlackConfig` ({ proxyUrl, getHeaders? }), `redactSlackConfig()` (redacts `getHeaders` reference, keeps `proxyUrl`).
- Create: `typescript/packages/browser/src/resource/slack/slack.ts` — `SlackResource` with `BrowserSlackTransport` injection.
- Modify: `typescript/packages/browser/src/resource/registry.ts` — register.
- Modify: `typescript/packages/browser/src/index.ts` — re-export.

**Tests:** parallel to node; verify `getState()` redacts `getHeaders` to `<REDACTED>` keeping `proxyUrl`.

**Commit:** `feat(browser): SlackResource with proxy URL + getHeaders + registry wiring`

______________________________________________________________________

### Task 33: Phase 5 integration test + build checkpoint

**Files:**

- Create: `typescript/packages/node/src/resource/slack/integration.test.ts` — mounts `SlackResource` (with `FakeSlackTransport` injected via test seam — see below) into a `Workspace`, runs `await ws.execute('ls /slack/channels/')`, verifies output matches canned data.

**Test seam:** Node's `SlackResource` constructor accepts `SlackConfig | { transport: SlackTransport }` (overload) so tests can inject `FakeSlackTransport` directly. Same overload added to browser.

```ts
constructor(input: SlackConfig | { transport: SlackTransport }) {
  const transport = 'transport' in input ? input.transport : new NodeSlackTransport(input.token, input.searchToken)
  super({ accessor: new SlackAccessor(transport) })
}
```

Build all packages. All tests green. Commit checkpoint.

______________________________________________________________________

## Phase 6 — Examples + docs (5 tasks)

Mirror Python's three examples 1:1, add the browser example, add Mintlify docs page.

**Convention:** Examples live under `examples/typescript/slack/`. They run via `pnpm tsx examples/typescript/slack/slack.ts` from `examples/typescript/`. `dotenv` loaded at top of file.

______________________________________________________________________

### Task 34: examples/typescript/slack/slack.ts

**Source to mirror:** `examples/python/slack/slack.py`

**Files:**

- Create: `examples/typescript/slack/slack.ts`

Port section-by-section. Each Python section (`# ── ls ──`, `# ── cat ──`, `# ── grep ──`, etc.) becomes a TS block with `console.log` + `await ws.execute(...)`.

Python idiom mapping:

- `await r.stdout_str()` → `r.stdoutText`
- `r.exit_code` → `r.exitCode`
- `with Workspace(...) as ws:` → `try { ... } finally { await ws.close() }`
- `os.environ["SLACK_BOT_TOKEN"]` → `process.env.SLACK_BOT_TOKEN ?? throwIfMissing()`

Run manually with `SLACK_BOT_TOKEN` set. **No automated test** (live API, deferred to manual smoke test).

**Commit:** `docs(examples): typescript/slack/slack.ts — mirrors python/slack/slack.py`

______________________________________________________________________

### Task 35: examples/typescript/slack/slack_vfs.ts

**Source:** `examples/python/slack/slack_vfs.py`

Uses `patchNodeFs(ws)` (the TS equivalent of Python's `sys.modules["os"]` patch) → call `node:fs` directly.

```ts
import { promises as fs } from 'node:fs'
import { patchNodeFs } from '@struktoai/mirage-node'

const restore = patchNodeFs(ws)
try {
  const sections = await fs.readdir('/slack')
  const channels = await fs.readdir('/slack/channels')
  // ... walk dates, read jsonl, parse + print messages — same flow as Python
} finally {
  restore()
}
```

Include the `/.sessions` observer log readout and `ws.ops.records` stats from the Python file.

**Commit:** `docs(examples): typescript/slack/slack_vfs.ts — mirrors python/slack/slack_vfs.py`

______________________________________________________________________

### Task 36: examples/typescript/slack/slack_fuse.ts

**Source:** `examples/python/slack/slack_fuse.py`

```ts
import { FuseManager, MountMode, SlackResource, Workspace } from '@struktoai/mirage-node'
import { promises as fs } from 'node:fs'

const ws = new Workspace({ '/slack/': new SlackResource({ token: process.env.SLACK_BOT_TOKEN! }) }, { mode: MountMode.READ })
const fm = new FuseManager()
const mp = await fm.setup(ws)
try {
  const sections = await fs.readdir(`${mp}/slack`)
  // ... mirror Python flow: channels, pick general, dates, read messages, users
  console.log(`>>> Mount is live at ${mp}. Press Enter to unmount...`)
  // wait for stdin
} finally {
  await fm.close(ws)
  await ws.close()
}
```

Include the observer/ops stats readout. Match Python's `input()` prompt behavior (read stdin line).

**Commit:** `docs(examples): typescript/slack/slack_fuse.ts — mirrors python/slack/slack_fuse.py`

______________________________________________________________________

### Task 37: examples/typescript/slack/slack_browser.ts (proxy demo, new)

No Python counterpart. Two parts:

1. **`server.ts`** — minimal Express/Fastify proxy that holds the bot token, accepts `GET/POST /api/slack/*`, forwards to `https://slack.com/api/*` adding `Authorization: Bearer ${SLACK_BOT_TOKEN}`. ~30 LOC.
1. **`slack_browser.ts`** — uses `@struktoai/mirage-browser`'s `SlackResource` with `proxyUrl: '/api/slack'`, runs the same demo flow as `slack.ts` but headlessly (no shell since browser doesn't run shell). Calls `ws.fs.readdir('/slack/channels')` etc. directly.

This file is meant to be wired into the existing `examples/typescript/browser/` Vite app. Consider adding it as a new entry under that directory rather than `slack/`.

**Commit:** `docs(examples): typescript/slack/slack_browser.ts demonstrates proxy pattern`

______________________________________________________________________

### Task 38: docs/typescript/slack.mdx

**Files:**

- Create: `docs/typescript/slack.mdx` — Mintlify page mirroring `docs/typescript/setup/supabase.mdx` structure. Sections: install, get a token, node usage, browser usage (with proxy server example), filesystem layout, write commands, troubleshooting.
- Modify: `docs/docs.json` — add `slack` to the typescript navigation.

**Commit:** `docs: typescript Slack resource page`

______________________________________________________________________

## Phase 7 — Final review + ship

After Task 38:

1. **Build + test everything**

```bash
cd typescript && pnpm -r --filter './packages/*' build && pnpm -r --filter './packages/*' test
```

Expected: all green.

2. **Lint**

```bash
./python/.venv/bin/pre-commit run --all-files
```

Fix any ESLint / Prettier issues. Commit.

3. **Final code review** — dispatch a `superpowers:code-reviewer` subagent over the entire branch before merge. Pass it the design doc + this plan as context.

1. **Smoke test (manual)** — run `slack.ts` against a real workspace with `SLACK_BOT_TOKEN` set; spot-check 3-5 commands match Python output.

1. **Use superpowers:finishing-a-development-branch** to complete the branch.

______________________________________________________________________

## Appendix A — Python parity checklist

Before merging, verify every Python public API has a TS equivalent:

| Python                                                                              | TS                                                                                                     |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `from mirage.resource.slack import SlackConfig, SlackResource` (node)               | `import { SlackConfig, SlackResource } from '@struktoai/mirage-node'`                                  |
| `from mirage.resource.slack import SlackConfig, SlackResource` (browser-equivalent) | `import { SlackConfig, SlackResource } from '@struktoai/mirage-browser'` (different SlackConfig shape) |
| `SlackConfig(token=..., search_token=...)`                                          | `{ token, searchToken }` (or YAML loaded via `normalizeSlackConfig`)                                   |
| `SlackResource(config=cfg)`                                                         | `new SlackResource(cfg)`                                                                               |
| `Workspace({"/slack": resource}, mode=MountMode.READ)`                              | `new Workspace({ '/slack/': resource }, { mode: MountMode.READ })`                                     |
| `await ws.execute("ls /slack/channels/")`                                           | `await ws.execute('ls /slack/channels/')`                                                              |
| `await r.stdout_str()`                                                              | `r.stdoutText`                                                                                         |
| All 19 commands runnable                                                            | `SLACK_COMMANDS` includes all 19                                                                       |
| `ops/slack/{read, readdir, stat}`                                                   | `SLACK_VFS_OPS = [...]`                                                                                |
| Snake-case YAML config loads                                                        | `normalizeSlackConfig({ search_token: '...' })` produces `{ searchToken: '...' }`                      |

______________________________________________________________________

## Appendix B — Test inventory target

By end of Phase 5, tests added:

- `_client.test.ts` — 4
- `_client_browser.test.ts` — 4
- `accessor/slack.test.ts` — 2
- `scope.test.ts` — 7
- `entry.test.ts` — 4
- `channels.test.ts` — 3
- `users.test.ts` — 2
- `history.test.ts` — 5
- `ops/slack/readdir.test.ts` — 6
- `ops/slack/read.test.ts` — 4
- `ops/slack/stat.test.ts` — 6
- `glob.test.ts` — 3
- `commands/builtin/slack/*.test.ts` — ~2 per command × 19 = ~38
- Resource class + registry tests — ~6
- Phase 5 integration test — 1

**Total: ~95 tests.** All using `FakeSlackTransport`. Zero live Slack calls.

______________________________________________________________________

## Appendix C — Known risks

1. **`PathSpec` API drift.** `detectScope` is sensitive to `PathSpec.directory` / `.prefix` / `.pattern` / `.key` semantics. If the TS PathSpec exposes these differently from Python, port carefully — see [`typescript/packages/core/src/types.ts`](typescript/packages/core/src/types.ts) `PathSpec` for the actual fields.

1. **`IndexCacheStore` API.** `RAMIndexCacheStore` (already in core) supports `get(key)` and `setDir(prefix, entries)` — verify matches Python's. Python uses `IndexEntry` dataclass; TS likely has an equivalent `IndexEntry` interface in `cache/index/`.

1. **`fnmatch` reuse.** Either import the existing `fnmatch` from `core/s3/_client.ts` or move it to a shared util. Don't duplicate.

1. **`MountMode.READ` semantics.** Slack is read+write (post messages), not read-only. Examples mount with `MountMode.READ` for safety; document that write commands require `MountMode.WRITE`.

1. **Stale `dist/` in tests.** Server tests + CLI E2E read from `dist/`. After Phase 4 changes to core/node, run `pnpm --filter @struktoai/mirage-core build && pnpm --filter @struktoai/mirage-node build` before any integration test that depends on built artifacts.

1. **Browser package CORS test gap.** `BrowserSlackTransport` tests use Vitest's Node fetch — they don't catch real-browser CORS issues. Document in the test file that browser CORS is the user's proxy's responsibility, and that runtime browser testing happens in `examples/typescript/browser/`.
