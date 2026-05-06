# TypeScript Server & CLI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship two new packages — `@struktoai/mirage-server` (Fastify daemon) and `@struktoai/mirage-cli` (commander CLI) — that mirror Python's `mirage/server/` + `mirage/cli/` shape so the same workflow (`mirage workspace create config.yaml && mirage execute -w <id> -c "ls /"`) works in Node.

**Architecture:**

- `@struktoai/mirage-server` runs a long-lived Fastify HTTP daemon owning a `WorkspaceRegistry` of `WorkspaceRunner`s. Same `/v1/...` URL surface as Python's daemon so any future shared client (or doc page) speaks one protocol.
- `@struktoai/mirage-cli` is a thin commander program that talks to that daemon over HTTP, auto-spawning it on the first `workspace create` (mirrors Python's `DaemonClient.ensure_running`).
- Both packages depend on `@struktoai/mirage-node`, reusing its `Workspace`, `WorkspaceRunner`, `buildResource`, snapshot tar, etc. No core changes required.
- One deviation from Python forced by Node's runtime: there is exactly one event loop per process, so per-workspace thread isolation goes away. TS's `WorkspaceRunner.call(p)` already just awaits `p`; we lean on that. Job cancel becomes best-effort (Node Promises aren't cancellable without wiring an AbortController through `Workspace.execute`, which is out of scope for this plan).

**Tech Stack:**

- Server: [`fastify`](https://www.fastify.io/) v5 (5.8.5+) + [`@fastify/multipart`](https://github.com/fastify/fastify-multipart) v10 for `load_workspace` & multipart `execute` (stdin payload).
- CLI: [`commander`](https://github.com/tj/commander.js/) v14 (most-used Node CLI lib; nested-subcommand shape closely matches typer).
- Config loader: [`yaml`](https://eemeli.org/yaml/) for YAML/JSON workspace configs (mirrors Python's `pyyaml`).
- HTTP client: built-in `fetch` (Node 22+) — no extra dep. (Python uses `httpx` because stdlib lacks an async client; Node doesn't need that workaround.)
- Build: `tsup` (already used by `@struktoai/mirage-node`).
- Tests: `vitest` (already used).

**Out of scope:**

- Cron / scheduler behavior of background jobs.
- Auth beyond bearer-token passthrough.
- True FUSE mount lifecycle inside the daemon (the daemon hosts virtual workspaces only; CLI users who want FUSE create their own `Workspace({ fuse: true })` in their own process — same as Python).

**Reference files (Python sources to mirror; do NOT modify):**

- Server app: [python/mirage/server/app.py](python/mirage/server/app.py)
- Server registry: [python/mirage/server/registry.py](python/mirage/server/registry.py)
- Server jobs: [python/mirage/server/jobs.py](python/mirage/server/jobs.py)
- Server schemas: [python/mirage/server/schemas.py](python/mirage/server/schemas.py)
- Server summary: [python/mirage/server/summary.py](python/mirage/server/summary.py)
- Server persist: [python/mirage/server/persist.py](python/mirage/server/persist.py)
- Server clone: [python/mirage/server/clone.py](python/mirage/server/clone.py)
- Server io_serde: [python/mirage/server/io_serde.py](python/mirage/server/io_serde.py)
- Routers: [python/mirage/server/routers/](python/mirage/server/routers/)
- CLI entry: [python/mirage/cli/main.py](python/mirage/cli/main.py)
- CLI client: [python/mirage/cli/client.py](python/mirage/cli/client.py)
- CLI settings: [python/mirage/cli/settings.py](python/mirage/cli/settings.py)
- CLI subcommands: [python/mirage/cli/{daemon,workspace,session,job,execute,provision}.py](python/mirage/cli/)
- E2E test reference: [python/tests/cli/test_cli_end_to_end.py](python/tests/cli/test_cli_end_to_end.py)

______________________________________________________________________

## Task 1: Bootstrap `@struktoai/mirage-server` package skeleton

**Files:**

- Create: `typescript/packages/server/package.json`
- Create: `typescript/packages/server/tsconfig.json`
- Create: `typescript/packages/server/tsup.config.ts`
- Create: `typescript/packages/server/src/index.ts`
- Create: `typescript/packages/server/src/index.test.ts`

**Step 1: Write the failing test**

`typescript/packages/server/src/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import * as serverPkg from './index.ts'

describe('@struktoai/mirage-server package', () => {
  it('exports buildApp', () => {
    expect(typeof serverPkg.buildApp).toBe('function')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd typescript && pnpm --filter @struktoai/mirage-server test 2>&1 | tail -20`
Expected: FAIL — package not yet registered in workspace.

**Step 3: Write minimal package files**

`typescript/packages/server/package.json` — model exactly on `packages/node/package.json`:

```json
{
  "name": "@struktoai/mirage-server",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@struktoai/mirage-core": "workspace:*",
    "@struktoai/mirage-node": "workspace:*",
    "fastify": "^5.8.5",
    "@fastify/multipart": "^10.0.0",
    "yaml": "^2.6.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsup": "^8.5.0",
    "typescript": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
```

`typescript/packages/server/tsconfig.json` — copy from `packages/node/tsconfig.json` verbatim.

`typescript/packages/server/tsup.config.ts` — copy from `packages/node/tsup.config.ts` verbatim.

`typescript/packages/server/src/index.ts`:

```ts
export { buildApp, type BuildAppOptions } from './app.ts'
```

Now create a placeholder `src/app.ts` so the export resolves:

```ts
import Fastify, { type FastifyInstance } from 'fastify'

export interface BuildAppOptions {
  idleGraceSeconds?: number
  persistDir?: string
}

export function buildApp(_options: BuildAppOptions = {}): FastifyInstance {
  return Fastify({ logger: false })
}
```

**Step 4: Install deps and verify test passes**

Run:

```bash
cd typescript && pnpm install && pnpm --filter @struktoai/mirage-server test
```

Expected: PASS

**Step 5: Commit**

```bash
git add typescript/packages/server typescript/pnpm-lock.yaml
git commit -m "feat(server): bootstrap @struktoai/mirage-server package skeleton"
```

______________________________________________________________________

## Task 2: Server `WorkspaceRegistry` + `JobTable`

Mirrors [python/mirage/server/registry.py](python/mirage/server/registry.py) and [python/mirage/server/jobs.py](python/mirage/server/jobs.py).

**Files:**

- Create: `typescript/packages/server/src/registry.ts`
- Create: `typescript/packages/server/src/registry.test.ts`
- Create: `typescript/packages/server/src/jobs.ts`
- Create: `typescript/packages/server/src/jobs.test.ts`

**Step 1: Write the failing tests**

`typescript/packages/server/src/registry.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { RAMResource, Workspace, MountMode } from '@struktoai/mirage-node'
import { WorkspaceRegistry, newWorkspaceId } from './registry.ts'

describe('newWorkspaceId', () => {
  it('mints ws_<hex16> ids', () => {
    expect(newWorkspaceId()).toMatch(/^ws_[a-f0-9]{16}$/)
  })
})

describe('WorkspaceRegistry', () => {
  it('add/get/list/remove', async () => {
    const r = new WorkspaceRegistry()
    const ws = new Workspace({ '/': new RAMResource() }, { mode: MountMode.WRITE })
    const entry = r.add(ws)
    expect(r.has(entry.id)).toBe(true)
    expect(r.list()).toHaveLength(1)
    await r.remove(entry.id)
    expect(r.has(entry.id)).toBe(false)
  })

  it('rejects duplicate ids', () => {
    const r = new WorkspaceRegistry()
    const ws = new Workspace({ '/': new RAMResource() }, { mode: MountMode.WRITE })
    r.add(ws, 'fixed')
    const ws2 = new Workspace({ '/': new RAMResource() }, { mode: MountMode.WRITE })
    expect(() => r.add(ws2, 'fixed')).toThrow(/already exists/)
  })

  it('trips exitEvent after idleGraceSeconds when last workspace removed', async () => {
    vi.useFakeTimers()
    let tripped = false
    const r = new WorkspaceRegistry({
      idleGraceSeconds: 0.05,
      onIdleExit: () => {
        tripped = true
      },
    })
    const ws = new Workspace({ '/': new RAMResource() }, { mode: MountMode.WRITE })
    const entry = r.add(ws)
    await r.remove(entry.id)
    await vi.advanceTimersByTimeAsync(60)
    expect(tripped).toBe(true)
    vi.useRealTimers()
  })
})
```

`typescript/packages/server/src/jobs.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { JobStatus, JobTable, newJobId } from './jobs.ts'

describe('newJobId', () => {
  it('mints job_<hex16> ids', () => {
    expect(newJobId()).toMatch(/^job_[a-f0-9]{16}$/)
  })
})

describe('JobTable', () => {
  it('submit -> done flow', async () => {
    const table = new JobTable()
    const entry = table.submit('ws1', 'echo hi', () => Promise.resolve('result-value'))
    expect(entry.status).toBe(JobStatus.RUNNING)
    const finished = await table.wait(entry.id)
    expect(finished.status).toBe(JobStatus.DONE)
    expect(finished.result).toBe('result-value')
  })

  it('captures rejection as FAILED', async () => {
    const table = new JobTable()
    const entry = table.submit('ws1', 'boom', () => Promise.reject(new Error('boom')))
    const finished = await table.wait(entry.id)
    expect(finished.status).toBe(JobStatus.FAILED)
    expect(finished.error).toContain('boom')
  })

  it('list filtered by workspace_id', () => {
    const table = new JobTable()
    table.submit('a', 'x', () => Promise.resolve(null))
    table.submit('b', 'y', () => Promise.resolve(null))
    expect(table.list('a')).toHaveLength(1)
    expect(table.list()).toHaveLength(2)
  })

  it('wait timeout returns still-running entry', async () => {
    const table = new JobTable()
    const entry = table.submit('ws1', 'slow', () => new Promise(() => undefined))
    const result = await table.wait(entry.id, 0.01)
    expect(result.status).toBe(JobStatus.RUNNING)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `cd typescript && pnpm --filter @struktoai/mirage-server test 2>&1 | tail -30`
Expected: FAIL — modules not yet implemented.

**Step 3: Implement registry + jobs**

`typescript/packages/server/src/registry.ts`:

```ts
import { randomBytes } from 'node:crypto'
import { WorkspaceRunner, type Workspace } from '@struktoai/mirage-node'

export function newWorkspaceId(): string {
  return `ws_${randomBytes(8).toString('hex')}`
}

export class WorkspaceEntry {
  readonly id: string
  readonly runner: WorkspaceRunner
  readonly createdAt: number

  constructor(id: string, runner: WorkspaceRunner) {
    this.id = id
    this.runner = runner
    this.createdAt = Date.now() / 1000
  }
}

export interface WorkspaceRegistryOptions {
  idleGraceSeconds?: number
  onIdleExit?: () => void
}

export class WorkspaceRegistry {
  private entries = new Map<string, WorkspaceEntry>()
  private readonly idleGraceSeconds: number
  private readonly onIdleExit: (() => void) | null
  private idleTimer: NodeJS.Timeout | null = null

  constructor(options: WorkspaceRegistryOptions = {}) {
    this.idleGraceSeconds = options.idleGraceSeconds ?? 30
    this.onIdleExit = options.onIdleExit ?? null
  }

  has(id: string): boolean {
    return this.entries.has(id)
  }

  get(id: string): WorkspaceEntry {
    const e = this.entries.get(id)
    if (e === undefined) throw new Error(`workspace not found: ${id}`)
    return e
  }

  list(): WorkspaceEntry[] {
    return Array.from(this.entries.values())
  }

  size(): number {
    return this.entries.size
  }

  add(ws: Workspace, id?: string): WorkspaceEntry {
    const wid = id ?? newWorkspaceId()
    if (this.entries.has(wid)) throw new Error(`workspace id already exists: ${wid}`)
    const entry = new WorkspaceEntry(wid, new WorkspaceRunner(ws))
    this.entries.set(wid, entry)
    this.cancelIdleTimer()
    return entry
  }

  async remove(id: string): Promise<WorkspaceEntry> {
    const entry = this.entries.get(id)
    if (entry === undefined) throw new Error(`workspace not found: ${id}`)
    this.entries.delete(id)
    await entry.runner.stop()
    if (this.entries.size === 0) this.startIdleTimer()
    return entry
  }

  async closeAll(): Promise<void> {
    this.cancelIdleTimer()
    const ids = Array.from(this.entries.keys())
    for (const id of ids) {
      const entry = this.entries.get(id)
      this.entries.delete(id)
      if (entry !== undefined) await entry.runner.stop()
    }
  }

  private startIdleTimer(): void {
    if (this.onIdleExit === null) return
    if (this.idleGraceSeconds <= 0) {
      this.onIdleExit()
      return
    }
    if (this.idleTimer !== null) return
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null
      if (this.entries.size === 0 && this.onIdleExit !== null) this.onIdleExit()
    }, this.idleGraceSeconds * 1000)
  }

  private cancelIdleTimer(): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
  }
}
```

`typescript/packages/server/src/jobs.ts`:

```ts
import { randomBytes } from 'node:crypto'

export const JobStatus = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  DONE: 'done',
  FAILED: 'failed',
  CANCELED: 'canceled',
} as const)
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus]

export function newJobId(): string {
  return `job_${randomBytes(8).toString('hex')}`
}

export class JobEntry {
  readonly id: string
  readonly workspaceId: string
  readonly command: string
  status: JobStatus = JobStatus.PENDING
  result: unknown = null
  error: string | null = null
  readonly submittedAt: number = Date.now() / 1000
  startedAt: number | null = null
  finishedAt: number | null = null
  readonly done: Promise<void>
  private resolveDone!: () => void

  constructor(id: string, workspaceId: string, command: string) {
    this.id = id
    this.workspaceId = workspaceId
    this.command = command
    this.done = new Promise((resolve) => {
      this.resolveDone = resolve
    })
  }

  markFinished(): void {
    this.finishedAt = Date.now() / 1000
    this.resolveDone()
  }
}

export class JobTable {
  private jobs = new Map<string, JobEntry>()

  has(id: string): boolean {
    return this.jobs.has(id)
  }

  get(id: string): JobEntry {
    const entry = this.jobs.get(id)
    if (entry === undefined) throw new Error(`job not found: ${id}`)
    return entry
  }

  list(workspaceId?: string): JobEntry[] {
    const all = Array.from(this.jobs.values())
    if (workspaceId === undefined) return all
    return all.filter((j) => j.workspaceId === workspaceId)
  }

  submit(
    workspaceId: string,
    command: string,
    coroFactory: () => Promise<unknown>,
  ): JobEntry {
    const entry = new JobEntry(newJobId(), workspaceId, command)
    this.jobs.set(entry.id, entry)
    entry.status = JobStatus.RUNNING
    entry.startedAt = Date.now() / 1000
    coroFactory().then(
      (result) => {
        entry.status = JobStatus.DONE
        entry.result = result
        entry.markFinished()
      },
      (err: unknown) => {
        entry.status = JobStatus.FAILED
        entry.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
        entry.markFinished()
      },
    )
    return entry
  }

  async wait(id: string, timeoutSeconds?: number): Promise<JobEntry> {
    const entry = this.get(id)
    if (
      entry.status === JobStatus.DONE ||
      entry.status === JobStatus.FAILED ||
      entry.status === JobStatus.CANCELED
    )
      return entry
    if (timeoutSeconds === undefined) {
      await entry.done
      return entry
    }
    await Promise.race([
      entry.done,
      new Promise<void>((resolve) => setTimeout(resolve, timeoutSeconds * 1000)),
    ])
    return entry
  }

  cancel(id: string): boolean {
    const entry = this.get(id)
    if (
      entry.status === JobStatus.DONE ||
      entry.status === JobStatus.FAILED ||
      entry.status === JobStatus.CANCELED
    )
      return false
    // Best-effort: TS Workspace.execute() does not yet take an AbortSignal,
    // so we mark canceled but the underlying promise keeps running. Document
    // this as a known limitation in the README/docs page.
    entry.status = JobStatus.CANCELED
    entry.markFinished()
    return true
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd typescript && pnpm --filter @struktoai/mirage-server test`
Expected: PASS (all 8 tests).

**Step 5: Commit**

```bash
git add typescript/packages/server/src
git commit -m "feat(server): add WorkspaceRegistry + JobTable"
```

______________________________________________________________________

## Task 3: Server schemas + summary helpers

Mirrors [python/mirage/server/schemas.py](python/mirage/server/schemas.py) and [python/mirage/server/summary.py](python/mirage/server/summary.py).

**Files:**

- Create: `typescript/packages/server/src/schemas.ts`
- Create: `typescript/packages/server/src/summary.ts`
- Create: `typescript/packages/server/src/summary.test.ts`

**Step 1: Write the failing test**

`typescript/packages/server/src/summary.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { RAMResource, Workspace, MountMode } from '@struktoai/mirage-node'
import { WorkspaceRegistry } from './registry.ts'
import { makeBrief, makeDetail } from './summary.ts'

describe('summary', () => {
  it('makeBrief reports prefix count + workspace mode', () => {
    const r = new WorkspaceRegistry()
    const ws = new Workspace({ '/data/': new RAMResource() }, { mode: MountMode.WRITE })
    const entry = r.add(ws, 'ws-x')
    const brief = makeBrief(entry)
    expect(brief.id).toBe('ws-x')
    expect(brief.mode).toBe('write')
    expect(brief.mountCount).toBe(1)
  })

  it('makeDetail emits mounts + sessions', () => {
    const r = new WorkspaceRegistry()
    const ws = new Workspace({ '/data/': new RAMResource() }, { mode: MountMode.WRITE })
    const entry = r.add(ws, 'ws-y')
    const detail = makeDetail(entry)
    expect(detail.mounts).toHaveLength(1)
    expect(detail.mounts[0].prefix).toBe('/data/')
    expect(detail.mounts[0].resource).toBe('ram')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd typescript && pnpm --filter @struktoai/mirage-server test summary`
Expected: FAIL — modules missing.

**Step 3: Implement schemas + summary**

`typescript/packages/server/src/schemas.ts` — plain TS interfaces (no runtime validation library; we'll do shape checks at the router boundary):

```ts
export interface MountSummary {
  prefix: string
  resource: string
  mode: string
  description: string
}

export interface WorkspaceBrief {
  id: string
  mode: string
  mountCount: number
  sessionCount: number
  createdAt: number
}

export interface SessionSummary {
  sessionId: string
  cwd: string
}

export interface WorkspaceInternals {
  cacheBytes: number
  cacheEntries: number
  historyLength: number
  inFlightJobs: number
}

export interface WorkspaceDetail {
  id: string
  mode: string
  createdAt: number
  sessions: SessionSummary[]
  mounts: MountSummary[]
  internals: WorkspaceInternals | null
}

export interface CreateWorkspaceRequest {
  config: Record<string, unknown>
  id?: string
}

export interface CloneWorkspaceRequest {
  id?: string
  override?: Record<string, unknown>
}

export interface DeleteWorkspaceResponse {
  id: string
  closedAt: number
}

export interface HealthResponse {
  status: string
  workspaces: number
  uptimeS: number
}
```

`typescript/packages/server/src/summary.ts` — uses node-side `Workspace` introspection:

```ts
import type { Workspace } from '@struktoai/mirage-node'
import type { WorkspaceEntry } from './registry.ts'
import type {
  MountSummary,
  SessionSummary,
  WorkspaceBrief,
  WorkspaceDetail,
} from './schemas.ts'

const AUTO_PREFIXES = new Set(['/dev/'])
const DESCRIPTION_MAX = 120

function userMounts(ws: Workspace) {
  return ws.mounts().filter((m) => !AUTO_PREFIXES.has(m.prefix))
}

function describeResource(resource: { prompt?: string }): string {
  const raw = resource.prompt ?? ''
  if (raw.length <= DESCRIPTION_MAX) return raw
  return raw.slice(0, DESCRIPTION_MAX - 1).trimEnd() + '\u2026'
}

export function makeBrief(entry: WorkspaceEntry): WorkspaceBrief {
  const ws = entry.runner.ws
  const mounts = userMounts(ws)
  return {
    id: entry.id,
    mode: mounts[0]?.mode ?? 'read',
    mountCount: mounts.length,
    sessionCount: ws.listSessions().length,
    createdAt: entry.createdAt,
  }
}

export function makeDetail(entry: WorkspaceEntry, verbose = false): WorkspaceDetail {
  const ws = entry.runner.ws
  const mounts = userMounts(ws)
  const mountSummaries: MountSummary[] = mounts.map((m) => ({
    prefix: m.prefix,
    resource: m.resource.kind,
    mode: m.mode,
    description: describeResource(m.resource as { prompt?: string }),
  }))
  const sessions: SessionSummary[] = ws.listSessions().map((s) => ({
    sessionId: s.sessionId,
    cwd: s.cwd,
  }))
  return {
    id: entry.id,
    mode: mounts[0]?.mode ?? 'read',
    createdAt: entry.createdAt,
    mounts: mountSummaries,
    sessions,
    internals: verbose ? buildInternals(ws) : null,
  }
}

function buildInternals(_ws: Workspace) {
  // Deferred until we expose the internals on the TS Workspace surface.
  // Mirrors Python's WorkspaceInternals; for now return zeros so the
  // shape is stable.
  return {
    cacheBytes: 0,
    cacheEntries: 0,
    historyLength: 0,
    inFlightJobs: 0,
  }
}
```

**Note on Workspace introspection:** TS `Workspace` already exposes `mounts()` and `listSessions()`. If those names differ from what's currently exported, **stop and ask** — do NOT invent methods. Confirm by running:

```bash
grep -nE 'mounts\(\)|listSessions\(\)' typescript/packages/core/src/workspace/workspace.ts | head
```

If absent, that's a precondition gap — flag it before continuing.

**Step 4: Run tests**

Run: `cd typescript && pnpm --filter @struktoai/mirage-server test`
Expected: all tests pass.

**Step 5: Commit**

```bash
git add typescript/packages/server/src
git commit -m "feat(server): add request/response schemas + summary helpers"
```

______________________________________________________________________

## Task 4: Workspace config loader (YAML + env interpolation)

Mirrors [python/mirage/config.py](python/mirage/config.py)'s `_interpolate_env` + `load_config` + `WorkspaceConfig.to_workspace_kwargs`. The CLI uses this to validate configs before sending them to the daemon (so missing env vars fail fast).

**Files:**

- Create: `typescript/packages/server/src/config.ts`
- Create: `typescript/packages/server/src/config.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { interpolateEnv, loadWorkspaceConfig, configToWorkspaceArgs } from './config.ts'

describe('interpolateEnv', () => {
  it('substitutes ${VAR} from env', () => {
    expect(interpolateEnv('hi ${NAME}', { NAME: 'sam' })).toBe('hi sam')
  })

  it('walks nested dicts and lists', () => {
    const out = interpolateEnv({ a: ['${X}', { b: '${X}' }] }, { X: '1' })
    expect(out).toEqual({ a: ['1', { b: '1' }] })
  })

  it('throws listing all missing vars', () => {
    expect(() => interpolateEnv('${A} ${B}', {})).toThrow(/missing.*A.*B/)
  })
})

describe('loadWorkspaceConfig', () => {
  it('parses YAML and validates required fields', () => {
    const cfg = loadWorkspaceConfig({
      mounts: { '/': { resource: 'ram', mode: 'write' } },
    })
    expect(cfg.mounts['/'].resource).toBe('ram')
  })

  it('rejects configs missing mounts', () => {
    expect(() => loadWorkspaceConfig({})).toThrow(/mounts/)
  })
})

describe('configToWorkspaceArgs', () => {
  it('builds resources + mode for Workspace constructor', async () => {
    const cfg = loadWorkspaceConfig({
      mounts: { '/': { resource: 'ram', mode: 'write' } },
      mode: 'write',
    })
    const args = await configToWorkspaceArgs(cfg)
    expect(args.resources['/']).toBeDefined()
    expect(args.options.mode).toBe('write')
  })
})
```

**Step 2: Run to confirm it fails**

Run: `cd typescript && pnpm --filter @struktoai/mirage-server test config`
Expected: FAIL.

**Step 3: Implement config.ts**

```ts
import { readFileSync } from 'node:fs'
import { parse as parseYaml } from 'yaml'
import { buildResource, MountMode, type Resource } from '@struktoai/mirage-node'

const VAR_RE = /\$\{([A-Z_][A-Z0-9_]*)\}/g

export function interpolateEnv<T>(value: T, env: Record<string, string>): T {
  const missing: string[] = []
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      return v.replace(VAR_RE, (_m, name: string) => {
        if (!(name in env)) {
          missing.push(name)
          return ''
        }
        return env[name]
      })
    }
    if (Array.isArray(v)) return v.map(walk)
    if (v !== null && typeof v === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = walk(val)
      return out
    }
    return v
  }
  const out = walk(value)
  if (missing.length > 0) {
    const unique = Array.from(new Set(missing)).sort()
    throw new Error(`missing environment variables: ${unique.join(', ')}`)
  }
  return out as T
}

export interface MountBlock {
  resource: string
  mode?: string
  config?: Record<string, unknown>
}

export interface WorkspaceConfigRaw {
  mounts: Record<string, MountBlock>
  mode?: string
  consistency?: string
  defaultSessionId?: string
  defaultAgentId?: string
  history?: number | null
  fuse?: boolean
}

export function loadWorkspaceConfig(
  source: string | Record<string, unknown>,
  env?: Record<string, string>,
): WorkspaceConfigRaw {
  let raw: Record<string, unknown>
  if (typeof source === 'string') {
    const text = readFileSync(source, 'utf-8')
    const parsed = parseYaml(text) as unknown
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`config source must be a mapping`)
    }
    raw = parsed as Record<string, unknown>
  } else {
    raw = { ...source }
  }
  const useEnv = env ?? (process.env as Record<string, string>)
  const interpolated = interpolateEnv(raw, useEnv)
  if (
    typeof interpolated.mounts !== 'object' ||
    interpolated.mounts === null ||
    Array.isArray(interpolated.mounts)
  ) {
    throw new Error('config requires a `mounts` mapping')
  }
  return interpolated as WorkspaceConfigRaw
}

export interface WorkspaceArgs {
  resources: Record<string, [Resource, MountMode]>
  options: {
    mode: MountMode
    sessionId: string
    agentId: string
  }
}

export async function configToWorkspaceArgs(
  cfg: WorkspaceConfigRaw,
): Promise<WorkspaceArgs> {
  const wsMode = (cfg.mode ?? 'write') as MountMode
  const resources: Record<string, [Resource, MountMode]> = {}
  for (const [prefix, block] of Object.entries(cfg.mounts)) {
    const r = await buildResource(block.resource, block.config ?? {})
    const m = (block.mode ?? wsMode) as MountMode
    resources[prefix] = [r, m]
  }
  return {
    resources,
    options: {
      mode: wsMode,
      sessionId: cfg.defaultSessionId ?? 'default',
      agentId: cfg.defaultAgentId ?? 'default',
    },
  }
}
```

**Step 4: Run tests**

Run: `cd typescript && pnpm --filter @struktoai/mirage-server test`
Expected: all pass.

**Step 5: Commit**

```bash
git add typescript/packages/server/src
git commit -m "feat(server): add YAML/JSON config loader with env interpolation"
```

______________________________________________________________________

## Task 5: `health` + `workspaces` routers + `buildApp` wiring

Mirrors [python/mirage/server/routers/health.py](python/mirage/server/routers/health.py) and [python/mirage/server/routers/workspaces.py](python/mirage/server/routers/workspaces.py).

**Files:**

- Modify: `typescript/packages/server/src/app.ts`
- Create: `typescript/packages/server/src/routers/health.ts`
- Create: `typescript/packages/server/src/routers/workspaces.ts`
- Create: `typescript/packages/server/src/routers/workspaces.test.ts`

**Step 1: Write the failing test**

`typescript/packages/server/src/routers/workspaces.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildApp } from '../app.ts'

describe('workspaces router', () => {
  it('GET /v1/health returns ok', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/v1/health' })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { status: string; workspaces: number }
    expect(body.status).toBe('ok')
    expect(body.workspaces).toBe(0)
    await app.close()
  })

  it('POST /v1/workspaces creates and returns detail', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/workspaces',
      payload: { config: { mounts: { '/': { resource: 'ram', mode: 'write' } } } },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json() as { id: string }
    expect(body.id).toMatch(/^ws_/)
    await app.close()
  })

  it('GET /v1/workspaces lists active workspaces', async () => {
    const app = buildApp()
    await app.inject({
      method: 'POST',
      url: '/v1/workspaces',
      payload: {
        id: 'fixed-id',
        config: { mounts: { '/': { resource: 'ram', mode: 'write' } } },
      },
    })
    const res = await app.inject({ method: 'GET', url: '/v1/workspaces' })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Array<{ id: string }>
    expect(body.some((w) => w.id === 'fixed-id')).toBe(true)
    await app.close()
  })

  it('DELETE /v1/workspaces/:id removes', async () => {
    const app = buildApp()
    await app.inject({
      method: 'POST',
      url: '/v1/workspaces',
      payload: {
        id: 'to-delete',
        config: { mounts: { '/': { resource: 'ram', mode: 'write' } } },
      },
    })
    const res = await app.inject({ method: 'DELETE', url: '/v1/workspaces/to-delete' })
    expect(res.statusCode).toBe(200)
    const detail = await app.inject({ method: 'GET', url: '/v1/workspaces/to-delete' })
    expect(detail.statusCode).toBe(404)
    await app.close()
  })
})
```

**Step 2: Run test to verify failure**

Run: `cd typescript && pnpm --filter @struktoai/mirage-server test workspaces`
Expected: FAIL.

**Step 3: Implement routers + app**

`typescript/packages/server/src/routers/health.ts`:

```ts
import type { FastifyInstance } from 'fastify'
import type { WorkspaceRegistry } from '../registry.ts'

export interface HealthDeps {
  registry: WorkspaceRegistry
  startedAt: number
  exit: () => void
}

export function registerHealthRoutes(app: FastifyInstance, deps: HealthDeps): void {
  app.get('/v1/health', () => ({
    status: 'ok',
    workspaces: deps.registry.size(),
    uptimeS: Math.round((Date.now() / 1000 - deps.startedAt) * 1000) / 1000,
  }))
  app.post('/v1/shutdown', () => {
    deps.exit()
    return { status: 'shutting_down', pid: process.pid }
  })
}
```

`typescript/packages/server/src/routers/workspaces.ts`:

```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { Workspace } from '@struktoai/mirage-node'
import type { WorkspaceRegistry } from '../registry.ts'
import { configToWorkspaceArgs, loadWorkspaceConfig } from '../config.ts'
import { makeBrief, makeDetail } from '../summary.ts'
import type { CreateWorkspaceRequest } from '../schemas.ts'

export interface WorkspaceRoutesDeps {
  registry: WorkspaceRegistry
}

export function registerWorkspacesRoutes(
  app: FastifyInstance,
  deps: WorkspaceRoutesDeps,
): void {
  app.post('/v1/workspaces', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as CreateWorkspaceRequest
    if (body.id !== undefined && deps.registry.has(body.id)) {
      return reply.status(409).send({ detail: `workspace id already exists: ${body.id}` })
    }
    let cfg
    try {
      cfg = loadWorkspaceConfig(body.config)
    } catch (e) {
      return reply.status(400).send({ detail: (e as Error).message })
    }
    const args = await configToWorkspaceArgs(cfg)
    const resourceMap: Record<string, ReturnType<typeof asResource>> = {}
    for (const [prefix, [resource]] of Object.entries(args.resources))
      resourceMap[prefix] = asResource(resource)
    const ws = new Workspace(resourceMap, { mode: args.options.mode })
    let entry
    try {
      entry = deps.registry.add(ws, body.id)
    } catch (e) {
      return reply.status(409).send({ detail: (e as Error).message })
    }
    return reply.status(201).send(makeDetail(entry))
  })

  app.get('/v1/workspaces', () => deps.registry.list().map(makeBrief))

  app.get('/v1/workspaces/:id', (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    if (!deps.registry.has(id)) return reply.status(404).send({ detail: 'workspace not found' })
    const verbose =
      typeof (req.query as { verbose?: string }).verbose === 'string' &&
      (req.query as { verbose: string }).verbose === 'true'
    return makeDetail(deps.registry.get(id), verbose)
  })

  app.delete('/v1/workspaces/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    if (!deps.registry.has(id)) return reply.status(404).send({ detail: 'workspace not found' })
    await deps.registry.remove(id)
    return { id, closedAt: Date.now() / 1000 }
  })
}

function asResource<T>(r: T): T {
  return r
}
```

Now rewrite `src/app.ts` to wire everything:

```ts
import Fastify, { type FastifyInstance } from 'fastify'
import { WorkspaceRegistry } from './registry.ts'
import { JobTable } from './jobs.ts'
import { registerHealthRoutes } from './routers/health.ts'
import { registerWorkspacesRoutes } from './routers/workspaces.ts'

export interface BuildAppOptions {
  idleGraceSeconds?: number
  persistDir?: string
  onIdleExit?: () => void
}

export interface MirageApp extends FastifyInstance {
  registry: WorkspaceRegistry
  jobs: JobTable
}

export function buildApp(options: BuildAppOptions = {}): MirageApp {
  const app = Fastify({ logger: false }) as MirageApp
  const startedAt = Date.now() / 1000
  const exitFn = options.onIdleExit ?? (() => undefined)
  app.registry = new WorkspaceRegistry({
    idleGraceSeconds: options.idleGraceSeconds,
    onIdleExit: exitFn,
  })
  app.jobs = new JobTable()
  registerHealthRoutes(app, { registry: app.registry, startedAt, exit: exitFn })
  registerWorkspacesRoutes(app, { registry: app.registry })
  app.addHook('onClose', async () => {
    await app.registry.closeAll()
  })
  return app
}
```

**Step 4: Run tests**

Run: `cd typescript && pnpm --filter @struktoai/mirage-server test`
Expected: PASS (incl. all 4 router tests).

**Step 5: Commit**

```bash
git add typescript/packages/server/src
git commit -m "feat(server): add health + workspaces routers wired to buildApp"
```

______________________________________________________________________

## Task 6: `sessions` router

Mirrors [python/mirage/server/routers/sessions.py](python/mirage/server/routers/sessions.py).

**Files:**

- Create: `typescript/packages/server/src/routers/sessions.ts`
- Create: `typescript/packages/server/src/routers/sessions.test.ts`
- Modify: `typescript/packages/server/src/app.ts` (register the new router)

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { buildApp } from '../app.ts'

async function createWs(app: ReturnType<typeof buildApp>, id: string) {
  await app.inject({
    method: 'POST',
    url: '/v1/workspaces',
    payload: { id, config: { mounts: { '/': { resource: 'ram', mode: 'write' } } } },
  })
}

describe('sessions router', () => {
  it('POST creates a session, GET lists, DELETE removes', async () => {
    const app = buildApp()
    await createWs(app, 'sw')
    const created = await app.inject({
      method: 'POST',
      url: '/v1/workspaces/sw/sessions',
      payload: { sessionId: 'agent_a' },
    })
    expect(created.statusCode).toBe(201)
    const list = await app.inject({ method: 'GET', url: '/v1/workspaces/sw/sessions' })
    expect((list.json() as Array<{ sessionId: string }>).some((s) => s.sessionId === 'agent_a')).toBe(true)
    const del = await app.inject({
      method: 'DELETE',
      url: '/v1/workspaces/sw/sessions/agent_a',
    })
    expect(del.statusCode).toBe(200)
    await app.close()
  })

  it('returns 404 for unknown workspace', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'POST', url: '/v1/workspaces/missing/sessions', payload: {} })
    expect(res.statusCode).toBe(404)
    await app.close()
  })
})
```

**Step 2: Run to verify it fails**

Run: `cd typescript && pnpm --filter @struktoai/mirage-server test sessions`
Expected: FAIL.

**Step 3: Implement router + register**

`src/routers/sessions.ts`:

```ts
import { randomBytes } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { WorkspaceRegistry } from '../registry.ts'

export interface SessionsRoutesDeps {
  registry: WorkspaceRegistry
}

export function registerSessionsRoutes(
  app: FastifyInstance,
  deps: SessionsRoutesDeps,
): void {
  app.post('/v1/workspaces/:wsId/sessions', (req: FastifyRequest, reply: FastifyReply) => {
    const { wsId } = req.params as { wsId: string }
    if (!deps.registry.has(wsId)) return reply.status(404).send({ detail: 'workspace not found' })
    const body = (req.body ?? {}) as { sessionId?: string }
    const sid = body.sessionId ?? `sess_${randomBytes(6).toString('hex')}`
    const ws = deps.registry.get(wsId).runner.ws
    if (ws.listSessions().some((s) => s.sessionId === sid))
      return reply.status(409).send({ detail: `session id already exists: ${sid}` })
    const sess = ws.createSession(sid)
    return reply.status(201).send({ sessionId: sess.sessionId, cwd: sess.cwd })
  })

  app.get('/v1/workspaces/:wsId/sessions', (req: FastifyRequest, reply: FastifyReply) => {
    const { wsId } = req.params as { wsId: string }
    if (!deps.registry.has(wsId)) return reply.status(404).send({ detail: 'workspace not found' })
    return deps.registry
      .get(wsId)
      .runner.ws.listSessions()
      .map((s) => ({ sessionId: s.sessionId, cwd: s.cwd }))
  })

  app.delete(
    '/v1/workspaces/:wsId/sessions/:sessionId',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { wsId, sessionId } = req.params as { wsId: string; sessionId: string }
      if (!deps.registry.has(wsId)) return reply.status(404).send({ detail: 'workspace not found' })
      const ws = deps.registry.get(wsId).runner.ws
      if (!ws.listSessions().some((s) => s.sessionId === sessionId))
        return reply.status(404).send({ detail: 'session not found' })
      await ws.closeSession(sessionId)
      return { sessionId }
    },
  )
}
```

Add to `app.ts` after the workspaces line:

```ts
import { registerSessionsRoutes } from './routers/sessions.ts'
// ...
registerSessionsRoutes(app, { registry: app.registry })
```

**Same caveat as Task 3:** if `Workspace.createSession` / `closeSession` / `listSessions` aren't already exposed in TS, **stop and ask** — don't invent. Run:

```bash
grep -nE 'createSession|closeSession|listSessions' typescript/packages/core/src/workspace/workspace.ts
```

**Step 4: Run tests**

Run: `cd typescript && pnpm --filter @struktoai/mirage-server test`
Expected: PASS.

**Step 5: Commit**

```bash
git add typescript/packages/server/src
git commit -m "feat(server): add sessions router"
```

______________________________________________________________________

## Task 7: `execute` + `jobs` routers

Mirrors [python/mirage/server/routers/execute.py](python/mirage/server/routers/execute.py) and [python/mirage/server/routers/jobs.py](python/mirage/server/routers/jobs.py).

**Files:**

- Create: `typescript/packages/server/src/io_serde.ts`
- Create: `typescript/packages/server/src/routers/execute.ts`
- Create: `typescript/packages/server/src/routers/jobs.ts`
- Create: `typescript/packages/server/src/routers/execute.test.ts`
- Modify: `typescript/packages/server/src/app.ts` (register them)

**Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { buildApp } from '../app.ts'

async function createWs(app: ReturnType<typeof buildApp>, id: string) {
  await app.inject({
    method: 'POST',
    url: '/v1/workspaces',
    payload: { id, config: { mounts: { '/': { resource: 'ram', mode: 'write' } } } },
  })
}

describe('execute router', () => {
  it('synchronously runs a command and returns IO result', async () => {
    const app = buildApp()
    await createWs(app, 'ew')
    const res = await app.inject({
      method: 'POST',
      url: '/v1/workspaces/ew/execute',
      payload: { command: 'echo hi' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { kind: string; stdout: string; exitCode: number }
    expect(body.kind).toBe('io')
    expect(body.stdout.trim()).toBe('hi')
    expect(body.exitCode).toBe(0)
    await app.close()
  })

  it('background=true returns 202 + job_id', async () => {
    const app = buildApp()
    await createWs(app, 'ew2')
    const res = await app.inject({
      method: 'POST',
      url: '/v1/workspaces/ew2/execute?background=true',
      payload: { command: 'echo hi' },
    })
    expect(res.statusCode).toBe(202)
    const body = res.json() as { jobId: string }
    expect(body.jobId).toMatch(/^job_/)
    await app.close()
  })

  it('GET /v1/jobs lists jobs', async () => {
    const app = buildApp()
    await createWs(app, 'ew3')
    await app.inject({
      method: 'POST',
      url: '/v1/workspaces/ew3/execute',
      payload: { command: 'echo hi' },
    })
    const res = await app.inject({ method: 'GET', url: '/v1/jobs?workspaceId=ew3' })
    const body = res.json() as Array<{ workspaceId: string }>
    expect(body.length).toBeGreaterThan(0)
    expect(body[0].workspaceId).toBe('ew3')
    await app.close()
  })
})
```

**Step 2: Run to verify failure**

Run: `cd typescript && pnpm --filter @struktoai/mirage-server test execute`
Expected: FAIL.

**Step 3: Implement io_serde + execute + jobs routers**

`src/io_serde.ts`:

```ts
import type { ExecuteResult, ProvisionResult } from '@struktoai/mirage-core'

export interface IoResultDict {
  kind: 'io'
  exitCode: number
  stdout: string
  stderr: string
}

export interface ProvisionResultDict {
  kind: 'provision'
  [k: string]: unknown
}

export type ResultDict = IoResultDict | ProvisionResultDict | { kind: 'raw'; value: string }

export async function ioResultToDict(result: ExecuteResult | ProvisionResult): Promise<ResultDict> {
  if (isExecuteResult(result)) {
    return {
      kind: 'io',
      exitCode: result.exitCode,
      stdout: result.stdoutText,
      stderr: result.stderrText,
    }
  }
  if (typeof (result as { kind?: string }).kind === 'string') {
    return { kind: 'provision', ...(result as Record<string, unknown>) }
  }
  return { kind: 'raw', value: String(result) }
}

function isExecuteResult(r: unknown): r is ExecuteResult {
  return typeof r === 'object' && r !== null && 'stdoutText' in r && 'exitCode' in r
}
```

`src/routers/execute.ts`:

```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { WorkspaceRegistry } from '../registry.ts'
import { JobStatus, type JobTable, type JobEntry } from '../jobs.ts'
import { ioResultToDict } from '../io_serde.ts'

export interface ExecuteRoutesDeps {
  registry: WorkspaceRegistry
  jobs: JobTable
}

interface ExecuteBody {
  command: string
  sessionId?: string
  provision?: boolean
  agentId?: string
  native?: boolean
}

export function registerExecuteRoutes(
  app: FastifyInstance,
  deps: ExecuteRoutesDeps,
): void {
  app.post(
    '/v1/workspaces/:wsId/execute',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { wsId } = req.params as { wsId: string }
      if (!deps.registry.has(wsId)) return reply.status(404).send({ detail: 'workspace not found' })
      const body = req.body as ExecuteBody
      const background =
        (req.query as { background?: string }).background === 'true'
      const entry = deps.registry.get(wsId)
      const job = deps.jobs.submit(wsId, body.command, () =>
        entry.runner.ws.execute(body.command, {
          ...(body.sessionId !== undefined ? { sessionId: body.sessionId } : {}),
          ...(body.agentId !== undefined ? { agentId: body.agentId } : {}),
          ...(body.native !== undefined ? { native: body.native } : {}),
          ...(body.provision === true ? { provision: true as const } : {}),
        }),
      )
      if (background) {
        return reply.status(202).send({
          jobId: job.id,
          workspaceId: wsId,
          submittedAt: job.submittedAt,
        })
      }
      await deps.jobs.wait(job.id)
      if (job.status === JobStatus.FAILED) {
        return reply.status(500).send({ detail: job.error ?? 'execute failed' })
      }
      const dict = await ioResultToDict(job.result as Parameters<typeof ioResultToDict>[0])
      reply.header('X-Mirage-Job-Id', job.id)
      return dict
    },
  )
}

export function _toBriefDict(entry: JobEntry) {
  return {
    jobId: entry.id,
    workspaceId: entry.workspaceId,
    command: entry.command,
    status: entry.status,
    submittedAt: entry.submittedAt,
    startedAt: entry.startedAt,
    finishedAt: entry.finishedAt,
  }
}
```

`src/routers/jobs.ts`:

```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { JobTable, JobEntry } from '../jobs.ts'
import { ioResultToDict } from '../io_serde.ts'
import { _toBriefDict } from './execute.ts'

export interface JobsRoutesDeps {
  jobs: JobTable
}

async function toDetailDict(entry: JobEntry) {
  const brief = _toBriefDict(entry)
  let result = null
  if (entry.result !== null) {
    result = await ioResultToDict(entry.result as Parameters<typeof ioResultToDict>[0])
  }
  return { ...brief, result, error: entry.error }
}

export function registerJobsRoutes(app: FastifyInstance, deps: JobsRoutesDeps): void {
  app.get('/v1/jobs', (req: FastifyRequest) => {
    const { workspaceId } = req.query as { workspaceId?: string }
    return deps.jobs.list(workspaceId).map(_toBriefDict)
  })

  app.get('/v1/jobs/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    if (!deps.jobs.has(id)) return reply.status(404).send({ detail: 'job not found' })
    return await toDetailDict(deps.jobs.get(id))
  })

  app.post('/v1/jobs/:id/wait', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    if (!deps.jobs.has(id)) return reply.status(404).send({ detail: 'job not found' })
    const body = (req.body ?? {}) as { timeoutS?: number }
    const entry = await deps.jobs.wait(id, body.timeoutS)
    return await toDetailDict(entry)
  })

  app.delete('/v1/jobs/:id', (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    if (!deps.jobs.has(id)) return reply.status(404).send({ detail: 'job not found' })
    return { jobId: id, canceled: deps.jobs.cancel(id) }
  })
}
```

Wire in `app.ts`:

```ts
import { registerExecuteRoutes } from './routers/execute.ts'
import { registerJobsRoutes } from './routers/jobs.ts'
// ...
registerExecuteRoutes(app, { registry: app.registry, jobs: app.jobs })
registerJobsRoutes(app, { jobs: app.jobs })
```

**Step 4: Run tests**

Run: `cd typescript && pnpm --filter @struktoai/mirage-server test`
Expected: PASS.

**Step 5: Commit**

```bash
git add typescript/packages/server/src
git commit -m "feat(server): add execute + jobs routers"
```

______________________________________________________________________

## Task 8: Server entry-point + persistent daemon binary

The CLI auto-spawns the daemon. To have something to spawn, ship a `bin` script that boots the server on a port.

**Files:**

- Create: `typescript/packages/server/src/bin/daemon.ts`
- Modify: `typescript/packages/server/package.json` (add `bin` mapping + tsup config for the bin)
- Modify: `typescript/packages/server/tsup.config.ts` (additional entry)

**Step 1: Create bin entry**

`typescript/packages/server/src/bin/daemon.ts`:

```ts
#!/usr/bin/env node
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { buildApp } from '../app.ts'

const DEFAULT_PORT = 8765

function pidFilePath(): string {
  return join(homedir(), '.mirage', 'daemon.pid')
}

function writePidFile(): void {
  const p = pidFilePath()
  mkdirSync(join(homedir(), '.mirage'), { recursive: true })
  writeFileSync(p, String(process.pid))
}

function removePidFile(): void {
  try {
    unlinkSync(pidFilePath())
  } catch {
    /* ignore */
  }
}

async function main(): Promise<void> {
  const port = Number(process.env.MIRAGE_DAEMON_PORT ?? DEFAULT_PORT)
  const idleGraceSeconds = Number(process.env.MIRAGE_IDLE_GRACE_SECONDS ?? '30')
  let exiting = false
  const triggerExit = (): void => {
    if (exiting) return
    exiting = true
    void app.close().then(() => {
      removePidFile()
      process.exit(0)
    })
  }
  const app = buildApp({
    idleGraceSeconds,
    onIdleExit: triggerExit,
  })
  process.on('SIGTERM', triggerExit)
  process.on('SIGINT', triggerExit)
  await app.listen({ port, host: '127.0.0.1' })
  writePidFile()
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
```

**Step 2: Wire build config**

Update `typescript/packages/server/tsup.config.ts`:

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/bin/daemon.ts'],
  format: ['esm'],
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  sourcemap: true,
  clean: true,
  target: 'es2022',
  platform: 'node',
})
```

Add to `package.json`:

```json
"bin": {
  "mirage-daemon": "./dist/bin/daemon.js"
},
```

**Step 3: Smoke test the bin via build + spawn**

Run:

```bash
cd typescript && pnpm --filter @struktoai/mirage-server build
node -e "
  import('child_process').then(({ spawn }) => {
    const p = spawn(process.execPath, ['typescript/packages/server/dist/bin/daemon.js'], {
      env: { ...process.env, MIRAGE_DAEMON_PORT: '18765', MIRAGE_IDLE_GRACE_SECONDS: '1' },
      detached: false, stdio: 'inherit'
    })
    setTimeout(async () => {
      const r = await fetch('http://127.0.0.1:18765/v1/health').then(r => r.json())
      console.log(JSON.stringify(r))
      p.kill('SIGTERM')
    }, 500)
  })
"
```

Expected: prints `{"status":"ok","workspaces":0,"uptimeS":...}` then daemon shuts down.

**Step 4: Commit**

```bash
git add typescript/packages/server
git commit -m "feat(server): add mirage-daemon bin entry"
```

______________________________________________________________________

## Task 9: Bootstrap `@struktoai/mirage-cli` + settings + client

Mirrors [python/mirage/cli/settings.py](python/mirage/cli/settings.py) and [python/mirage/cli/client.py](python/mirage/cli/client.py).

**Files:**

- Create: `typescript/packages/cli/package.json`
- Create: `typescript/packages/cli/tsconfig.json`
- Create: `typescript/packages/cli/tsup.config.ts`
- Create: `typescript/packages/cli/src/settings.ts`
- Create: `typescript/packages/cli/src/settings.test.ts`
- Create: `typescript/packages/cli/src/client.ts`
- Create: `typescript/packages/cli/src/output.ts`
- Create: `typescript/packages/cli/src/index.ts`

**Step 1: Write the failing test**

`typescript/packages/cli/src/settings.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { loadDaemonSettings, DEFAULT_DAEMON_URL } from './settings.ts'

describe('loadDaemonSettings', () => {
  it('returns defaults when env unset and no file', () => {
    const s = loadDaemonSettings({ env: {}, configPath: '/nonexistent/config.toml' })
    expect(s.url).toBe(DEFAULT_DAEMON_URL)
    expect(s.authToken).toBe('')
  })

  it('MIRAGE_DAEMON_URL overrides default', () => {
    const s = loadDaemonSettings({
      env: { MIRAGE_DAEMON_URL: 'http://10.0.0.1:9000' },
      configPath: '/nonexistent/config.toml',
    })
    expect(s.url).toBe('http://10.0.0.1:9000')
  })

  it('MIRAGE_TOKEN populates authToken', () => {
    const s = loadDaemonSettings({
      env: { MIRAGE_TOKEN: 'secret' },
      configPath: '/nonexistent/config.toml',
    })
    expect(s.authToken).toBe('secret')
  })
})
```

**Step 2: Bootstrap package files**

`typescript/packages/cli/package.json`:

```json
{
  "name": "@struktoai/mirage-cli",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "bin": {
    "mirage": "./dist/bin/mirage.js"
  },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@struktoai/mirage-server": "workspace:*",
    "commander": "^14.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsup": "^8.5.0",
    "typescript": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
```

`typescript/packages/cli/tsconfig.json` — copy from `packages/server/tsconfig.json`.

`typescript/packages/cli/tsup.config.ts`:

```ts
import { defineConfig } from 'tsup'
export default defineConfig({
  entry: ['src/index.ts', 'src/bin/mirage.ts'],
  format: ['esm'],
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  sourcemap: true,
  clean: true,
  target: 'es2022',
  platform: 'node',
})
```

**Step 3: Implement settings, client, output**

`src/settings.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const DEFAULT_DAEMON_URL = 'http://127.0.0.1:8765'

export interface DaemonSettings {
  url: string
  persistDir: string
  authToken: string
  idleGraceSeconds: number
}

export interface LoadOptions {
  env?: Record<string, string | undefined>
  configPath?: string
}

function defaultConfigPath(): string {
  return join(homedir(), '.mirage', 'config.toml')
}

function readToml(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {}
  // Tiny TOML reader for one [daemon] table — keep deps minimal.
  const text = readFileSync(path, 'utf-8')
  const out: Record<string, unknown> = {}
  let inDaemon = false
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    if (trimmed === '[daemon]') {
      inDaemon = true
      continue
    }
    if (trimmed.startsWith('[')) {
      inDaemon = false
      continue
    }
    if (!inDaemon) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
    out[key] = value
  }
  return { daemon: out }
}

export function loadDaemonSettings(options: LoadOptions = {}): DaemonSettings {
  const env = options.env ?? (process.env as Record<string, string | undefined>)
  const path = options.configPath ?? defaultConfigPath()
  const table = (readToml(path).daemon ?? {}) as Record<string, string>
  const settings: DaemonSettings = {
    url: table.url ?? DEFAULT_DAEMON_URL,
    persistDir: table.persist_dir ?? '',
    authToken: table.auth_token ?? '',
    idleGraceSeconds: Number(table.idle_grace_seconds ?? '30'),
  }
  if (env.MIRAGE_DAEMON_URL !== undefined && env.MIRAGE_DAEMON_URL !== '')
    settings.url = env.MIRAGE_DAEMON_URL
  if (env.MIRAGE_TOKEN !== undefined && env.MIRAGE_TOKEN !== '')
    settings.authToken = env.MIRAGE_TOKEN
  return settings
}
```

`src/client.ts`:

```ts
import { spawn } from 'node:child_process'
import { mkdirSync, openSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DaemonSettings } from './settings.ts'

export class DaemonClient {
  readonly settings: DaemonSettings

  constructor(settings: DaemonSettings) {
    this.settings = settings
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json', ...extra }
    if (this.settings.authToken !== '') h.Authorization = `Bearer ${this.settings.authToken}`
    return h
  }

  async request(
    method: string,
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const headers = { ...this.headers(), ...((init.headers ?? {}) as Record<string, string>) }
    return fetch(this.settings.url + path, { ...init, method, headers })
  }

  async isReachable(timeoutMs = 500): Promise<boolean> {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const r = await fetch(this.settings.url + '/v1/health', {
        headers: this.headers(),
        signal: ctrl.signal,
      })
      return r.status === 200
    } catch {
      return false
    } finally {
      clearTimeout(t)
    }
  }

  async ensureRunning(opts: { allowSpawn?: boolean; timeoutMs?: number } = {}): Promise<void> {
    const { allowSpawn = true, timeoutMs = 5000 } = opts
    if (await this.isReachable()) return
    if (!allowSpawn)
      throw new Error(
        `daemon not reachable at ${this.settings.url}; run \`mirage workspace create CONFIG.yaml\``,
      )
    this.spawnDaemon()
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (await this.isReachable(300)) return
      await new Promise((r) => setTimeout(r, 100))
    }
    throw new Error(`daemon spawned but did not answer /v1/health within ${timeoutMs}ms`)
  }

  private spawnDaemon(): void {
    const env: Record<string, string> = { ...(process.env as Record<string, string>) }
    env.MIRAGE_DAEMON_PORT = String(this.portFromUrl())
    if (this.settings.authToken !== '') env.MIRAGE_AUTH_TOKEN = this.settings.authToken
    if (this.settings.persistDir !== '') env.MIRAGE_PERSIST_DIR = this.settings.persistDir
    const logDir = join(homedir(), '.mirage')
    mkdirSync(logDir, { recursive: true })
    const out = openSync(join(logDir, 'daemon.log'), 'a')
    const cliDir = dirname(fileURLToPath(import.meta.url))
    // Resolve daemon binary relative to the @struktoai/mirage-server package.
    // dist/cli is at .../@struktoai/mirage-cli/dist/bin and the daemon is at
    // .../@struktoai/mirage-server/dist/bin/daemon.js.
    const daemonEntry = join(cliDir, '..', '..', '..', 'server', 'dist', 'bin', 'daemon.js')
    const child = spawn(process.execPath, [daemonEntry], {
      env,
      detached: true,
      stdio: ['ignore', out, out],
    })
    child.unref()
  }

  private portFromUrl(): number {
    const u = new URL(this.settings.url)
    return Number(u.port) || 8765
  }
}

export function makeClient(settings: DaemonSettings): DaemonClient {
  return new DaemonClient(settings)
}
```

`src/output.ts`:

```ts
export function emit(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n')
}

export function fail(message: string, exitCode = 1): never {
  process.stderr.write(message + '\n')
  process.exit(exitCode)
}

export async function handleResponse(r: Response): Promise<unknown> {
  if (r.status >= 400) {
    let detail = await r.text()
    try {
      detail = (JSON.parse(detail) as { detail?: string }).detail ?? detail
    } catch {
      /* ignore */
    }
    fail(`daemon error ${r.status}: ${detail}`, 2)
  }
  if (r.status === 204) return {}
  const text = await r.text()
  if (text === '') return {}
  return JSON.parse(text) as unknown
}
```

`src/index.ts`:

```ts
export { DaemonClient, makeClient } from './client.ts'
export { loadDaemonSettings, DEFAULT_DAEMON_URL, type DaemonSettings } from './settings.ts'
```

**Step 4: Install + run tests**

Run: `cd typescript && pnpm install && pnpm --filter @struktoai/mirage-cli test`
Expected: PASS.

**Step 5: Commit**

```bash
git add typescript/packages/cli typescript/pnpm-lock.yaml
git commit -m "feat(cli): bootstrap @struktoai/mirage-cli with settings + http client"
```

______________________________________________________________________

## Task 10: CLI subcommands — workspace, session, job, execute, provision, daemon

Mirrors all the per-feature `mirage/cli/*.py` modules.

**Files** (flat layout mirrors Python's `mirage/cli/` 1:1):

- Create: `typescript/packages/cli/src/workspace.ts`
- Create: `typescript/packages/cli/src/session.ts`
- Create: `typescript/packages/cli/src/execute.ts`
- Create: `typescript/packages/cli/src/provision.ts`
- Create: `typescript/packages/cli/src/job.ts`
- Create: `typescript/packages/cli/src/daemon.ts`
- Create: `typescript/packages/cli/src/main.ts`
- Create: `typescript/packages/cli/src/bin/mirage.ts` (shebang, just calls `main`)
- Create: `typescript/packages/cli/src/main.test.ts`

**Step 1: Write the failing test**

`src/main.test.ts` — smoke-test that the program registers all subcommands:

```ts
import { describe, expect, it } from 'vitest'
import { buildProgram } from './main.ts'

describe('mirage CLI program', () => {
  it('registers expected subcommands', () => {
    const program = buildProgram()
    const names = program.commands.map((c) => c.name())
    expect(names.sort()).toEqual(
      ['daemon', 'execute', 'job', 'provision', 'session', 'workspace'].sort(),
    )
  })

  it('workspace subcommand has create/list/get/delete/clone/save/load', () => {
    const program = buildProgram()
    const ws = program.commands.find((c) => c.name() === 'workspace')
    expect(ws).toBeDefined()
    const sub = ws?.commands.map((c) => c.name()).sort() ?? []
    expect(sub).toEqual(['clone', 'create', 'delete', 'get', 'list', 'load', 'save'].sort())
  })
})
```

**Step 2: Run to verify failure**

Run: `cd typescript && pnpm --filter @struktoai/mirage-cli test`
Expected: FAIL — no commands wired yet.

**Step 3: Implement subcommands**

`src/main.ts` (mirrors [python/mirage/cli/main.py](python/mirage/cli/main.py)):

```ts
import { Command } from 'commander'
import { registerWorkspaceCommands } from './workspace.ts'
import { registerSessionCommands } from './session.ts'
import { registerJobCommands } from './job.ts'
import { registerExecuteCommand } from './execute.ts'
import { registerProvisionCommand } from './provision.ts'
import { registerDaemonCommands } from './daemon.ts'

export function buildProgram(): Command {
  const program = new Command()
  program.name('mirage').description('Mirage daemon CLI').version('0.0.0')
  registerWorkspaceCommands(program)
  registerSessionCommands(program)
  registerJobCommands(program)
  registerExecuteCommand(program)
  registerProvisionCommand(program)
  registerDaemonCommands(program)
  return program
}
```

`src/bin/mirage.ts` (thin shebang entry, mirrors `mirage = "mirage.cli.main:app"` in pyproject):

```ts
#!/usr/bin/env node
import { buildProgram } from '../main.ts'

buildProgram().parseAsync(process.argv).catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
```

`src/workspace.ts`:

```ts
import { readFileSync, writeFileSync } from 'node:fs'
import { Command } from 'commander'
import { makeClient } from '../client.ts'
import { loadDaemonSettings } from '../settings.ts'
import { emit, handleResponse } from '../output.ts'
import { interpolateEnv, loadWorkspaceConfig } from '@struktoai/mirage-server'

function client() {
  return makeClient(loadDaemonSettings())
}

async function postJson(path: string, body: unknown, allowSpawn = false) {
  const c = client()
  await c.ensureRunning({ allowSpawn })
  return c.request('POST', path, { body: JSON.stringify(body) })
}

export function registerWorkspaceCommands(program: Command): void {
  const ws = program.command('workspace').description('Manage workspaces.')

  ws.command('create')
    .argument('<config>', 'YAML/JSON workspace config')
    .option('--id <id>', 'Explicit workspace id')
    .action(async (configPath: string, opts: { id?: string }) => {
      const cfg = loadWorkspaceConfig(configPath)
      const body: { config: unknown; id?: string } = { config: cfg }
      if (opts.id !== undefined) body.id = opts.id
      const r = await postJson('/v1/workspaces', body, true)
      emit(await handleResponse(r))
    })

  ws.command('list').action(async () => {
    const c = client()
    await c.ensureRunning({ allowSpawn: false })
    emit(await handleResponse(await c.request('GET', '/v1/workspaces')))
  })

  ws.command('get')
    .argument('<id>')
    .option('--verbose', 'Include cache/dirty/history internals')
    .action(async (id: string, opts: { verbose?: boolean }) => {
      const c = client()
      await c.ensureRunning({ allowSpawn: false })
      const path = `/v1/workspaces/${id}` + (opts.verbose === true ? '?verbose=true' : '')
      emit(await handleResponse(await c.request('GET', path)))
    })

  ws.command('delete')
    .argument('<id>')
    .action(async (id: string) => {
      const c = client()
      await c.ensureRunning({ allowSpawn: false })
      emit(await handleResponse(await c.request('DELETE', `/v1/workspaces/${id}`)))
    })

  ws.command('clone')
    .argument('<srcId>')
    .option('--id <id>')
    .option('--override <path>')
    .action(async (srcId: string, opts: { id?: string; override?: string }) => {
      const body: Record<string, unknown> = {}
      if (opts.id !== undefined) body.id = opts.id
      if (opts.override !== undefined) {
        const text = readFileSync(opts.override, 'utf-8')
        body.override = interpolateEnv(JSON.parse(text), process.env as Record<string, string>)
      }
      const r = await postJson(`/v1/workspaces/${srcId}/clone`, body)
      emit(await handleResponse(r))
    })

  ws.command('save')
    .argument('<id>')
    .argument('<output>', 'Path to write the .tar to')
    .action(async (id: string, output: string) => {
      const c = client()
      await c.ensureRunning({ allowSpawn: false })
      const r = await c.request('GET', `/v1/workspaces/${id}/snapshot`)
      if (r.status >= 400) {
        emit({ error: await r.text(), status: r.status })
        process.exit(2)
      }
      const buf = Buffer.from(await r.arrayBuffer())
      writeFileSync(output, buf)
      emit({ workspaceId: id, path: output, bytes: buf.length })
    })

  ws.command('load')
    .argument('<tar>')
    .option('--id <id>')
    .option('--override <path>')
    .action(async (_tar: string, _opts: { id?: string; override?: string }) => {
      // Implementation deferred: needs server-side multipart endpoint.
      // Throw for now so callers don't think it silently succeeded.
      throw new Error('mirage workspace load is not yet implemented in the TS daemon')
    })
}
```

**Note:** `workspace save`/`load` round-trip the snapshot tar via the daemon. Server `snapshot_workspace` endpoint isn't built yet — covered in Task 11. Keep `save` writing the body bytes; `load` is stubbed with an explicit error until the server side exists.

`src/session.ts`:

```ts
import { Command } from 'commander'
import { makeClient } from '../client.ts'
import { loadDaemonSettings } from '../settings.ts'
import { emit, handleResponse } from '../output.ts'

function client() {
  return makeClient(loadDaemonSettings())
}

export function registerSessionCommands(program: Command): void {
  const sess = program.command('session').description('Manage workspace sessions.')

  sess.command('create')
    .argument('<wsId>')
    .option('--id <sessionId>')
    .action(async (wsId: string, opts: { id?: string }) => {
      const c = client()
      await c.ensureRunning({ allowSpawn: false })
      const body: Record<string, unknown> = {}
      if (opts.id !== undefined) body.sessionId = opts.id
      emit(await handleResponse(
        await c.request('POST', `/v1/workspaces/${wsId}/sessions`, { body: JSON.stringify(body) }),
      ))
    })

  sess.command('list').argument('<wsId>').action(async (wsId: string) => {
    const c = client()
    await c.ensureRunning({ allowSpawn: false })
    emit(await handleResponse(await c.request('GET', `/v1/workspaces/${wsId}/sessions`)))
  })

  sess.command('delete')
    .argument('<wsId>')
    .argument('<sessionId>')
    .action(async (wsId: string, sessionId: string) => {
      const c = client()
      await c.ensureRunning({ allowSpawn: false })
      emit(await handleResponse(
        await c.request('DELETE', `/v1/workspaces/${wsId}/sessions/${sessionId}`),
      ))
    })
}
```

`src/execute.ts`:

```ts
import { Command } from 'commander'
import { makeClient } from '../client.ts'
import { loadDaemonSettings } from '../settings.ts'
import { emit, handleResponse } from '../output.ts'

export function registerExecuteCommand(program: Command): void {
  program
    .command('execute')
    .description('Execute a command in a workspace.')
    .requiredOption('-w, --workspace <id>', 'Workspace id')
    .requiredOption('-c, --command <command>', 'Shell command to execute')
    .option('-s, --session <id>', 'Session id')
    .option('--bg', 'Background; return job_id immediately')
    .action(
      async (opts: { workspace: string; command: string; session?: string; bg?: boolean }) => {
        const body: Record<string, unknown> = { command: opts.command, provision: false }
        if (opts.session !== undefined) body.sessionId = opts.session
        const path =
          `/v1/workspaces/${opts.workspace}/execute` + (opts.bg === true ? '?background=true' : '')
        const c = makeClient(loadDaemonSettings())
        await c.ensureRunning({ allowSpawn: false })
        emit(await handleResponse(await c.request('POST', path, { body: JSON.stringify(body) })))
      },
    )
}
```

`src/provision.ts` — same shape as execute but `provision: true`, no `--bg`.

`src/job.ts`:

```ts
import { Command } from 'commander'
import { makeClient } from '../client.ts'
import { loadDaemonSettings } from '../settings.ts'
import { emit, handleResponse } from '../output.ts'

function client() {
  return makeClient(loadDaemonSettings())
}

export function registerJobCommands(program: Command): void {
  const job = program.command('job').description('Manage daemon jobs.')

  job.command('list')
    .option('-w, --workspace <id>')
    .action(async (opts: { workspace?: string }) => {
      const c = client()
      await c.ensureRunning({ allowSpawn: false })
      const path = '/v1/jobs' + (opts.workspace !== undefined ? `?workspaceId=${opts.workspace}` : '')
      emit(await handleResponse(await c.request('GET', path)))
    })

  job.command('get').argument('<id>').action(async (id: string) => {
    const c = client()
    await c.ensureRunning({ allowSpawn: false })
    emit(await handleResponse(await c.request('GET', `/v1/jobs/${id}`)))
  })

  job.command('wait').argument('<id>').option('--timeout <s>').action(async (id: string, opts: { timeout?: string }) => {
    const c = client()
    await c.ensureRunning({ allowSpawn: false })
    const body: Record<string, unknown> = {}
    if (opts.timeout !== undefined) body.timeoutS = Number(opts.timeout)
    emit(await handleResponse(await c.request('POST', `/v1/jobs/${id}/wait`, { body: JSON.stringify(body) })))
  })

  job.command('cancel').argument('<id>').action(async (id: string) => {
    const c = client()
    await c.ensureRunning({ allowSpawn: false })
    emit(await handleResponse(await c.request('DELETE', `/v1/jobs/${id}`)))
  })
}
```

`src/daemon.ts` — status / stop / restart / kill, mirroring [python/mirage/cli/daemon.py](python/mirage/cli/daemon.py). Uses `~/.mirage/daemon.pid` for graceful-stop fallback (`process.kill(pid, 'SIGTERM')`).

**Step 4: Run tests**

Run: `cd typescript && pnpm --filter @struktoai/mirage-cli test`
Expected: both subcommand-registration tests pass.

**Step 5: Commit**

```bash
git add typescript/packages/cli/src
git commit -m "feat(cli): add workspace/session/job/execute/provision/daemon subcommands"
```

______________________________________________________________________

## Task 11: Snapshot endpoint + persistence (server side)

Mirrors [python/mirage/server/persist.py](python/mirage/server/persist.py) and the `snapshot_workspace` route in [python/mirage/server/routers/workspaces.py](python/mirage/server/routers/workspaces.py).

**Files:**

- Modify: `typescript/packages/server/src/routers/workspaces.ts` (add `GET /v1/workspaces/:id/snapshot`)
- Create: `typescript/packages/server/src/persist.ts` (snapshotAll / restoreAll)
- Create: `typescript/packages/server/src/persist.test.ts`

**Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildApp } from './app.ts'
import { snapshotAll, restoreAll } from './persist.ts'

describe('snapshotAll + restoreAll', () => {
  it('round-trips a RAM workspace', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mirage-persist-'))
    try {
      const app = buildApp()
      await app.inject({
        method: 'POST',
        url: '/v1/workspaces',
        payload: { id: 'persist-w', config: { mounts: { '/': { resource: 'ram', mode: 'write' } } } },
      })
      await app.inject({
        method: 'POST',
        url: '/v1/workspaces/persist-w/execute',
        payload: { command: "echo hello > /a.txt" },
      })
      const saved = await snapshotAll(app.registry, dir)
      expect(saved).toBe(1)
      expect(existsSync(join(dir, 'persist-w.tar'))).toBe(true)
      await app.close()

      const app2 = buildApp()
      const [restored] = restoreAll(app2.registry, dir)
      expect(restored).toBe(1)
      expect(app2.registry.has('persist-w')).toBe(true)
      const r = await app2.inject({
        method: 'POST',
        url: '/v1/workspaces/persist-w/execute',
        payload: { command: 'cat /a.txt' },
      })
      expect((r.json() as { stdout: string }).stdout.trim()).toBe('hello')
      await app2.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('snapshot endpoint', () => {
  it('GET /v1/workspaces/:id/snapshot returns tar bytes', async () => {
    const app = buildApp()
    await app.inject({
      method: 'POST',
      url: '/v1/workspaces',
      payload: { id: 'snap-w', config: { mounts: { '/': { resource: 'ram', mode: 'write' } } } },
    })
    const r = await app.inject({ method: 'GET', url: '/v1/workspaces/snap-w/snapshot' })
    expect(r.statusCode).toBe(200)
    expect(r.headers['content-type']).toBe('application/x-tar')
    expect(r.rawPayload.length).toBeGreaterThan(0)
    await app.close()
  })
})
```

**Step 2: Run to verify failure**

Run: `cd typescript && pnpm --filter @struktoai/mirage-server test persist`
Expected: FAIL.

**Step 3: Implement persist + endpoint**

`src/persist.ts`:

```ts
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { Workspace } from '@struktoai/mirage-node'
import type { WorkspaceRegistry } from './registry.ts'

const INDEX_FILENAME = 'index.json'

interface IndexEntry {
  tar: string
  savedAt: number
}

interface IndexFile {
  workspaces: Record<string, IndexEntry>
}

function indexPath(dir: string): string {
  return join(dir, INDEX_FILENAME)
}

function tarPath(dir: string, id: string): string {
  return join(dir, `${id}.tar`)
}

export async function snapshotAll(
  registry: WorkspaceRegistry,
  persistDir: string,
): Promise<number> {
  mkdirSync(persistDir, { recursive: true })
  const index: IndexFile = { workspaces: {} }
  let saved = 0
  for (const entry of registry.list()) {
    const target = tarPath(persistDir, entry.id)
    await entry.runner.ws.save(target)
    index.workspaces[entry.id] = { tar: `${entry.id}.tar`, savedAt: Date.now() / 1000 }
    saved++
  }
  writeFileSync(indexPath(persistDir), JSON.stringify(index, null, 2))
  return saved
}

export function restoreAll(
  registry: WorkspaceRegistry,
  persistDir: string,
): [number, number] {
  const ip = indexPath(persistDir)
  if (!existsSync(ip)) return [0, 0]
  const index = JSON.parse(readFileSync(ip, 'utf-8')) as IndexFile
  let restored = 0
  let skipped = 0
  for (const [id, info] of Object.entries(index.workspaces)) {
    try {
      const tar = join(persistDir, info.tar)
      const ws = Workspace.load(tar)
      // load returns a Promise in TS — handle synchronously?
      // Actually it does return a Promise<Workspace>. Restore needs to be async.
      // ⚠ See Step 4 — convert restoreAll to async if Workspace.load is async.
      registry.add(ws as unknown as Workspace, id)
      restored++
    } catch {
      skipped++
    }
  }
  return [restored, skipped]
}
```

**⚠ Pre-implementation check:** TS `Workspace.load` IS async (returns `Promise<Workspace>`). Make `restoreAll` async and return `Promise<[number, number]>`. Update the test accordingly (`const [restored] = await restoreAll(...)`). Don't keep the sync stub — it will fail at runtime.

In `src/routers/workspaces.ts`, add:

```ts
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

app.get('/v1/workspaces/:id/snapshot', async (req: FastifyRequest, reply: FastifyReply) => {
  const { id } = req.params as { id: string }
  if (!deps.registry.has(id)) return reply.status(404).send({ detail: 'workspace not found' })
  const tmp = mkdtempSync(join(tmpdir(), 'mirage-snap-'))
  const out = join(tmp, `${id}.tar`)
  try {
    await deps.registry.get(id).runner.ws.save(out)
    const buf = readFileSync(out)
    reply.header('Content-Type', 'application/x-tar')
    reply.header('Content-Disposition', `attachment; filename="${id}.tar"`)
    return reply.send(buf)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})
```

**Step 4: Run tests**

Run: `cd typescript && pnpm --filter @struktoai/mirage-server test`
Expected: PASS.

**Step 5: Commit**

```bash
git add typescript/packages/server/src
git commit -m "feat(server): add snapshot endpoint + persist helpers"
```

______________________________________________________________________

## Task 12: Clone endpoint + `clone.ts`

Mirrors [python/mirage/server/clone.py](python/mirage/server/clone.py) and the `clone_workspace` route in [python/mirage/server/routers/workspaces.py](python/mirage/server/routers/workspaces.py). Required because Task 10 already wired `mirage workspace clone` on the CLI side — without this task, that subcommand 404s.

**Files:**

- Create: `typescript/packages/server/src/clone.ts`
- Create: `typescript/packages/server/src/clone.test.ts`
- Modify: `typescript/packages/server/src/routers/workspaces.ts` (add `POST /v1/workspaces/:id/clone`)

**Step 1: Write the failing test**

`typescript/packages/server/src/clone.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { RAMResource, Workspace, MountMode } from '@struktoai/mirage-node'
import { cloneWorkspaceWithOverride } from './clone.ts'

describe('cloneWorkspaceWithOverride', () => {
  it('produces an independent workspace whose writes do not touch the source', async () => {
    const src = new Workspace({ '/': new RAMResource() }, { mode: MountMode.WRITE })
    await src.execute("echo source-only > /file.txt")
    const clone = await cloneWorkspaceWithOverride(src, null)
    await clone.execute("echo clone-write > /file.txt")
    const srcRead = await src.execute('cat /file.txt')
    expect(srcRead.stdoutText.trim()).toBe('source-only')
    const cloneRead = await clone.execute('cat /file.txt')
    expect(cloneRead.stdoutText.trim()).toBe('clone-write')
    await src.close()
    await clone.close()
  })
})
```

Add to `routers/workspaces.test.ts`:

```ts
it('POST /v1/workspaces/:id/clone produces a new id', async () => {
  const app = buildApp()
  await app.inject({
    method: 'POST',
    url: '/v1/workspaces',
    payload: { id: 'src-w', config: { mounts: { '/': { resource: 'ram', mode: 'write' } } } },
  })
  const res = await app.inject({
    method: 'POST',
    url: '/v1/workspaces/src-w/clone',
    payload: {},
  })
  expect(res.statusCode).toBe(201)
  const body = res.json() as { id: string }
  expect(body.id).toMatch(/^ws_/)
  expect(body.id).not.toBe('src-w')
  await app.close()
})
```

**Step 2: Run to verify failure**

Run: `cd typescript && pnpm --filter @struktoai/mirage-server test clone`
Expected: FAIL — module + endpoint missing.

**Step 3: Implement clone**

`src/clone.ts`:

```ts
import { Workspace, buildResource, type Resource } from '@struktoai/mirage-node'

interface OverrideMountBlock {
  resource: string
  config?: Record<string, unknown>
}

interface OverrideShape {
  mounts?: Record<string, OverrideMountBlock>
}

async function buildOverrideResources(
  override: OverrideShape | null,
): Promise<Record<string, Resource>> {
  if (override === null || override.mounts === undefined) return {}
  const out: Record<string, Resource> = {}
  for (const [prefix, block] of Object.entries(override.mounts)) {
    out[prefix] = await buildResource(block.resource, block.config ?? {})
  }
  return out
}

function existingNeedsOverrideResources(
  src: Workspace,
  skip: Set<string>,
): Record<string, Resource> {
  const out: Record<string, Resource> = {}
  for (const m of src.mounts()) {
    if (skip.has(m.prefix)) continue
    const state = m.resource.getState() as { needsOverride?: boolean }
    if (state.needsOverride === true) out[m.prefix] = m.resource
  }
  return out
}

export async function cloneWorkspaceWithOverride(
  src: Workspace,
  override: OverrideShape | null,
): Promise<Workspace> {
  const overrideResources = await buildOverrideResources(override)
  const existing = existingNeedsOverrideResources(src, new Set(Object.keys(overrideResources)))
  const merged = { ...existing, ...overrideResources }
  const buf = Buffer.alloc(0)
  // Round-trip via tar: simplest way to get a Workspace.fromState with
  // overrides applied. Mirrors Python's `_to_state -> _from_state(state, resources=merged)`.
  const tmp = await import('node:os').then((os) => os.tmpdir())
  const path = await import('node:path').then((p) =>
    p.join(tmp, `mirage-clone-${String(Date.now())}.tar`),
  )
  try {
    await src.save(path)
    return await Workspace.load(path, {}, merged)
  } finally {
    const fs = await import('node:fs')
    try {
      fs.unlinkSync(path)
    } catch {
      /* ignore */
    }
    void buf
  }
}
```

**⚠ Pre-implementation check:** `Workspace.fromState` may already provide an in-memory shortcut (Python uses `Workspace._from_state(state, resources=merged)`). If `fromState` exists on TS `Workspace` and accepts an overrides map, **prefer that** over the tar round-trip — it's cheaper and matches Python more closely. Verify via:

```bash
grep -nE 'fromState|_fromState' typescript/packages/core/src/workspace/workspace.ts
```

If `fromState(state, options, overrides)` exists (likely — it's in the snapshot module), rewrite `clone.ts` to call `_to_state` (snapshot/state.ts) → `Workspace.fromState(state, {}, merged)` directly. The tar round-trip above is a fallback if the in-memory path isn't accessible from outside `core`.

**Step 4: Wire endpoint**

In `src/routers/workspaces.ts`:

```ts
import { cloneWorkspaceWithOverride } from '../clone.ts'

app.post('/v1/workspaces/:id/clone', async (req: FastifyRequest, reply: FastifyReply) => {
  const { id } = req.params as { id: string }
  if (!deps.registry.has(id)) return reply.status(404).send({ detail: 'workspace not found' })
  const body = (req.body ?? {}) as { id?: string; override?: Record<string, unknown> }
  if (body.id !== undefined && deps.registry.has(body.id))
    return reply.status(409).send({ detail: `workspace id already exists: ${body.id}` })
  const src = deps.registry.get(id).runner.ws
  const newWs = await cloneWorkspaceWithOverride(src, (body.override ?? null) as OverrideShape | null)
  let entry
  try {
    entry = deps.registry.add(newWs, body.id)
  } catch (e) {
    return reply.status(409).send({ detail: (e as Error).message })
  }
  return reply.status(201).send(makeDetail(entry))
})
```

**Step 5: Run tests**

Run: `cd typescript && pnpm --filter @struktoai/mirage-server test`
Expected: PASS (all clone tests + existing tests still green).

**Step 6: Commit**

```bash
git add typescript/packages/server/src
git commit -m "feat(server): add workspace clone endpoint + clone.ts"
```

______________________________________________________________________

## Task 13: End-to-end CLI test (real subprocess)

Mirrors [python/tests/cli/test_cli_end_to_end.py](python/tests/cli/test_cli_end_to_end.py) — spawns the actual built CLI and daemon binaries, exercises a workspace lifecycle.

**Files:**

- Create: `typescript/packages/cli/src/e2e.test.ts`

**Step 1: Write the failing test**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawnSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cliBin = join(here, '..', 'dist', 'bin', 'mirage.js')

const PORT = 18766

function runCli(env: Record<string, string>, ...args: string[]) {
  const r = spawnSync(process.execPath, [cliBin, ...args], {
    env,
    encoding: 'utf-8',
    timeout: 30000,
  })
  if (r.status !== 0) {
    throw new Error(`exit=${String(r.status)} stderr=${r.stderr} stdout=${r.stdout}`)
  }
  if (r.stdout.trim() === '') return {}
  return JSON.parse(r.stdout) as unknown
}

describe('mirage CLI end-to-end', () => {
  let tmp: string
  let env: Record<string, string>
  let daemon: ChildProcess | null = null

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'mirage-e2e-'))
    env = {
      ...(process.env as Record<string, string>),
      MIRAGE_DAEMON_URL: `http://127.0.0.1:${String(PORT)}`,
      MIRAGE_IDLE_GRACE_SECONDS: '120',
    }
  })

  afterAll(() => {
    if (daemon !== null) daemon.kill('SIGTERM')
    rmSync(tmp, { recursive: true, force: true })
  })

  it('workspace lifecycle works end-to-end', () => {
    const cfgPath = join(tmp, 'config.yaml')
    writeFileSync(cfgPath, 'mounts:\n  /:\n    resource: ram\n    mode: write\n')

    const created = runCli(env, 'workspace', 'create', cfgPath) as { id: string }
    expect(created.id).toMatch(/^ws_/)

    const listed = runCli(env, 'workspace', 'list') as Array<{ id: string }>
    expect(listed.some((w) => w.id === created.id)).toBe(true)

    const exec = runCli(
      env,
      'execute',
      '-w', created.id,
      '-c', "echo hello world",
    ) as { stdout: string }
    expect(exec.stdout.trim()).toBe('hello world')

    const deleted = runCli(env, 'workspace', 'delete', created.id) as { id: string }
    expect(deleted.id).toBe(created.id)
  }, 30000)
})
```

**Step 2: Build everything first**

```bash
cd typescript && pnpm --filter @struktoai/mirage-server build && pnpm --filter @struktoai/mirage-cli build
```

**Step 3: Run**

```bash
cd typescript && pnpm --filter @struktoai/mirage-cli test e2e
```

Expected: PASS — the CLI auto-spawns the daemon on the first `workspace create`, the workspace lifecycle completes, and the daemon stays up because `MIRAGE_IDLE_GRACE_SECONDS=120`.

If the test fails because the spawned daemon binary path resolution is wrong, that's the most likely first bug — check `client.ts` `daemonEntry = join(...)`. Trace by spawning manually and inspecting `~/.mirage/daemon.log`.

**Step 4: Commit**

```bash
git add typescript/packages/cli/src/e2e.test.ts
git commit -m "test(cli): add end-to-end workspace lifecycle test"
```

______________________________________________________________________

## Task 14: Wire packages into monorepo + lint pass

**Files:**

- Modify: `typescript/pnpm-workspace.yaml` (already includes `packages/*`, no change needed — but verify)
- Modify: `typescript/package.json` (no change — `-r --filter './packages/*'` picks them up)

**Step 1: Verify workspace picks up new packages**

```bash
cd typescript && pnpm -r --filter './packages/*' typecheck
```

Expected: PASS for all 5 packages (core, node, browser, server, cli).

**Step 2: Lint**

```bash
cd typescript && pnpm lint
```

Fix any issues that come up. The most likely:

- `@typescript-eslint/no-explicit-any` — replace `any` with `unknown` or a tighter type.
- `@typescript-eslint/no-unsafe-*` — narrow `req.body`/`req.query` casts via local `interface` types per route.
- `@typescript-eslint/consistent-type-imports` — switch runtime imports to `import type` for type-only references.

**Step 3: Run the full TS test suite**

```bash
cd typescript && pnpm test
```

Expected: PASS.

**Step 4: Commit**

```bash
git add -A
git commit -m "chore(ts): pass lint + typecheck for server + cli packages"
```

______________________________________________________________________

## Task 15: Docs page

**Files:**

- Create: `docs/typescript/server-and-cli.mdx`
- Modify: `docs/docs.json` (add the page under TS tab)

**Step 1: Write the page**

`docs/typescript/server-and-cli.mdx` — short page covering:

- Why a daemon (one process owns workspaces; CLI is stateless)
- Install (`npm i -g @struktoai/mirage-cli`)
- `mirage workspace create config.yaml` (auto-spawns the daemon)
- `mirage execute -w <id> -c "ls /"`
- `mirage daemon status` / `stop` / `kill`
- Config file location: `~/.mirage/config.toml` (mirror Python's `[daemon]` table)
- Env overrides: `MIRAGE_DAEMON_URL`, `MIRAGE_TOKEN`
- Known limitations: no AbortController for in-flight executes (cancel marks status only); `workspace load` not yet implemented
- Reference Python parity ([python/mirage/cli/](python/mirage/cli/)) so users porting code know what to expect

**Step 2: Add to nav**

In `docs/docs.json`, add `"typescript/server-and-cli"` to the TS tab → "Getting Started" group:

```json
"pages": [
  "typescript/install",
  "typescript/quickstart",
  "typescript/setup/fuse",
  "typescript/python",
  "typescript/limitations",
  "typescript/server-and-cli"
]
```

**Step 3: Commit**

```bash
git add docs/typescript/server-and-cli.mdx docs/docs.json
git commit -m "docs(ts): add server + CLI usage page"
```

______________________________________________________________________

## Task 16: Final integration sanity check

**Step 1: Manual smoke**

```bash
cd typescript && pnpm install && pnpm -r build
node typescript/packages/cli/dist/bin/mirage.js workspace create /tmp/ws.yaml
node typescript/packages/cli/dist/bin/mirage.js execute -w <id> -c "echo hi"
node typescript/packages/cli/dist/bin/mirage.js daemon stop
```

Where `/tmp/ws.yaml` is:

```yaml
mounts:
  /:
    resource: ram
    mode: write
```

Expected: all three commands succeed; second prints `{"kind":"io","stdout":"hi\n",...}`; third confirms daemon stopped.

**Step 2: pre-commit (project standard)**

```bash
./python/.venv/bin/pre-commit run --all-files
```

Fix any issues.

**Step 3: Final commit**

```bash
git status
# if there are pre-commit-driven formatting changes:
git add -A
git commit -m "chore: pre-commit pass for ts server+cli"
```

______________________________________________________________________

## Risks & Open Questions

These are things that may surface during execution and warrant a stop-and-ask:

1. **`Workspace` introspection methods (`mounts()`, `listSessions()`, `createSession()`, `closeSession()`).** If these don't exist on the TS `Workspace` (or have different names), Tasks 3 / 6 will block. Verify via `grep` before starting Task 3.
1. **`Workspace.execute` argument shape.** TS may use `{ sessionId, agentId, native, provision }` snake_case-converted. Confirm by reading [typescript/packages/core/src/workspace/workspace.ts](typescript/packages/core/src/workspace/workspace.ts) execute signature before Task 7.
1. **`Resource.kind` exists on every backend.** Used by `summary.ts`. Verify it's set on RAM, Disk, Redis, S3-family resources.
1. **Daemon binary path resolution.** `client.ts` resolves `daemonEntry` via `join(cliDir, '..', '..', '..', 'server', ...)`. This depends on the published `node_modules` layout. If pnpm hoisting changes the path, swap to `import.meta.resolve('@struktoai/mirage-server/dist/bin/daemon.js')` (Node 20+).
1. **`Workspace.load` async.** Confirmed async — make sure `restoreAll` is async (Task 11).
1. **CORS / port conflicts in tests.** E2E test pins `PORT=18766`. If multiple tests run in parallel, switch to a random free port via a port-finder helper.

## Execution Notes

- Run only TS-related commands during execution per the user's standing memory: `cd typescript && pnpm test` not `cd python && uv run pytest`.
- Frequent commits per task. If a task's TDD step breaks an earlier test, fix it in the same task — don't defer.
- Don't add features beyond what each task specifies. `workspace load` and `daemon restart --eager` are explicitly stubbed/deferred to keep this plan in-scope.
