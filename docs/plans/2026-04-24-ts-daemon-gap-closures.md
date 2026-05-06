# TS Daemon Gap Closures Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the four known limitations documented in `docs/typescript/server-and-cli.mdx` — persistence-on-shutdown, per-mount mode preservation on clone, real job cancel via AbortSignal, and the `mirage workspace load` subcommand.

**Architecture:** Four independent slices, ordered smallest-blast-radius first. Slice 1 (persistence) is pure wiring of helpers that already exist. Slice 2 (per-mount modes) is a small core change in `Workspace.fromState` to route per-mount modes through `MountRegistry.modeOverrides`. Slice 3 (AbortSignal cancel) threads `AbortSignal` from `JobTable` → `Workspace.execute({ signal })` → `spawn({ signal })` in `packages/node/src/native.ts` — Node's spawn already kills the child when its signal aborts, so we get hard-kill for free (improving on Python's soft cancel). Slice 4 (workspace load) overloads `Workspace.load` to accept `string | Uint8Array` (matching Python's `load(source)` path-or-file-like signature), adds a multipart `POST /v1/workspaces/load` route using `@fastify/multipart` (already installed), and wires the CLI stub.

**Tech Stack:** TypeScript 6 (`strictTypeChecked` + `verbatimModuleSyntax`), Fastify 5, @fastify/multipart 10, commander 14, vitest 3, pnpm workspaces.

**Scope excluded (YAGNI):**

- No new CLI flags beyond what Python already has.
- No Workspace constructor refactor — add one internal field (`modeOverrides`) to `WorkspaceOptions` and leave the positional shape alone.
- No streaming upload — in-memory buffer is fine; Python does the same (`await tar.read()` → `io.BytesIO`).
- No custom error types for AbortError — use `DOMException('...', 'AbortError')` like Node itself.

______________________________________________________________________

## Pre-flight

Before starting, verify baseline by running the full TS test suite once so regressions are caught early.

```bash
cd typescript && pnpm -r test
```

Expected: all packages green. If not green, stop and ask — don't start the plan on top of a broken tree.

Also review the gap analysis written to this plan's predecessor chat (why each gap exists in TS but not in Python) so the implementer understands the motivation rather than just following steps:

- Issue 2: Python's `build_mount_args` reads `MountKey.MODE` per mount; TS's `fromState` drops it.
- Issue 3: Python gets cancel from `concurrent.futures.Future.cancel()`; JS promises aren't cancellable → AbortSignal needed.
- Issue 4: Python's FastAPI `UploadFile` + `Workspace.load(BytesIO)` are free; TS needs explicit multipart parsing + a bytes-accepting loader.
- Issue 1: Just unwired — Python's lifespan context manager calls `restore_all`/`snapshot_all`; TS's `onClose` hook never did.

______________________________________________________________________

# Slice 1 — Persistence on shutdown (Issue #1)

Smallest slice. The helpers `snapshotAll` and `restoreAll` already exist in [`persist.ts`](typescript/packages/server/src/persist.ts). We just need to (a) thread `persistDir` from CLI settings into the daemon's `buildApp`, (b) call `restoreAll` on startup, (c) call `snapshotAll` from the `onClose` hook **before** `closeAll`.

## Task 1: Wire `persistDir` from CLI settings into daemon env

**Files:**

- Modify: [`typescript/packages/cli/src/client.ts`](typescript/packages/cli/src/client.ts) — where the daemon is auto-spawned; forward `MIRAGE_PERSIST_DIR` env var.
- Modify: [`typescript/packages/server/src/bin/daemon.ts`](typescript/packages/server/src/bin/daemon.ts:27-45) — read `MIRAGE_PERSIST_DIR` and pass to `buildApp({ persistDir })`.
- Test: [`typescript/packages/cli/src/e2e.test.ts`](typescript/packages/cli/src/e2e.test.ts) — extend existing E2E to exercise persist/restore across daemon stop+restart.

**Step 1: Write the failing test**

Append to `e2e.test.ts` a new `describe('persist across restart', ...)` block:

```ts
it('persists a workspace across daemon stop and restart', () => {
  // Spawn daemon with MIRAGE_PERSIST_DIR set to a tmp path.
  const persistDir = mkdtempSync(join(tmpdir(), 'mirage-persist-'))
  const env = { ...process.env, MIRAGE_DAEMON_URL: daemonUrl, MIRAGE_PERSIST_DIR: persistDir }

  // Create a workspace
  const cfgPath = join(tmp, 'ws.yaml')
  writeFileSync(cfgPath, 'mounts:\n  /:\n    resource: ram\n    mode: write\n')
  const created = spawnSync(process.execPath, [cliBin, 'workspace', 'create', cfgPath, '--id', 'persist-ws'], { env, encoding: 'utf-8' })
  expect(created.status).toBe(0)

  // Stop daemon — should snapshot
  spawnSync(process.execPath, [cliBin, 'daemon', 'stop'], { env, encoding: 'utf-8' })

  // Verify tar exists
  expect(existsSync(join(persistDir, 'persist-ws.tar'))).toBe(true)

  // Fresh command should auto-spawn daemon and restore
  const listed = spawnSync(process.execPath, [cliBin, 'workspace', 'list'], { env, encoding: 'utf-8' })
  expect(listed.status).toBe(0)
  expect(listed.stdout).toContain('persist-ws')

  spawnSync(process.execPath, [cliBin, 'daemon', 'stop'], { env, encoding: 'utf-8' })
  rmSync(persistDir, { recursive: true, force: true })
})
```

**Step 2: Run test to verify it fails**

```bash
cd typescript && pnpm --filter @struktoai/mirage-cli test -- --run e2e
```

Expected: FAIL — tar file not written because `MIRAGE_PERSIST_DIR` is not forwarded.

**Step 3: Forward `MIRAGE_PERSIST_DIR` in CLI client's `spawnDaemon`**

In [`client.ts`](typescript/packages/cli/src/client.ts)'s `spawnDaemon()`, add to the spawn env:

```ts
const daemonEnv: NodeJS.ProcessEnv = {
  ...process.env,
  MIRAGE_IDLE_GRACE_SECONDS: String(this.settings.idleGraceSeconds),
}
if (this.settings.persistDir !== '') {
  daemonEnv.MIRAGE_PERSIST_DIR = this.settings.persistDir
}
```

**Step 4: Read `MIRAGE_PERSIST_DIR` in `daemon.ts`**

In [`daemon.ts`](typescript/packages/server/src/bin/daemon.ts), add near the other env reads (line ~27):

```ts
const persistDir = process.env.MIRAGE_PERSIST_DIR ?? ''
const buildOpts: BuildAppOptions = { idleGraceSeconds, onIdleExit: triggerExit }
if (persistDir !== '') buildOpts.persistDir = persistDir
const app = buildApp(buildOpts)
```

**Step 5: Commit**

```bash
git add typescript/packages/cli/src/client.ts typescript/packages/server/src/bin/daemon.ts typescript/packages/cli/src/e2e.test.ts
git commit -m "feat(daemon): forward MIRAGE_PERSIST_DIR from CLI to daemon"
```

______________________________________________________________________

## Task 2: Call `snapshotAll` in `onClose` before `closeAll`

**Files:**

- Modify: [`typescript/packages/server/src/app.ts`](typescript/packages/server/src/app.ts:38-42) — extend `onClose` hook.
- Test: [`typescript/packages/server/src/app.test.ts`](typescript/packages/server/src/app.test.ts) (create if missing)

**Step 1: Write the failing test**

Add to `app.test.ts`:

```ts
import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildApp } from './app.ts'

it('snapshots workspaces on close when persistDir is set', async () => {
  const persistDir = mkdtempSync(join(tmpdir(), 'mirage-app-'))
  const app = buildApp({ persistDir })
  await app.inject({
    method: 'POST',
    url: '/v1/workspaces',
    payload: { id: 'persist-me', config: { mounts: { '/': { resource: 'ram', mode: 'write' } } } },
  })
  await app.close()
  expect(existsSync(join(persistDir, 'persist-me.tar'))).toBe(true)
  expect(existsSync(join(persistDir, 'index.json'))).toBe(true)
  rmSync(persistDir, { recursive: true, force: true })
})
```

**Step 2: Run test to verify it fails**

```bash
pnpm --filter @struktoai/mirage-server test -- app.test
```

Expected: FAIL — tar not written.

**Step 3: Extend onClose hook**

In [`app.ts`](typescript/packages/server/src/app.ts), replace current `onClose` block:

```ts
app.addHook('onClose', async () => {
  if (options.persistDir !== undefined && options.persistDir !== '') {
    try {
      const saved = await snapshotAll(registry, options.persistDir)
      app.log.info?.(`snapshotted ${saved} workspaces to ${options.persistDir}`)
    } catch (err) {
      console.warn('snapshotAll on shutdown failed:', err)
    }
  }
  await registry.closeAll()
})
```

Import `snapshotAll` at the top: `import { snapshotAll } from './persist.ts'`.

**Step 4: Verify test passes**

Expected: PASS.

**Step 5: Commit**

```bash
git add typescript/packages/server/src/app.ts typescript/packages/server/src/app.test.ts
git commit -m "feat(server): snapshot workspaces in onClose before closeAll"
```

______________________________________________________________________

## Task 3: Call `restoreAll` during `buildApp` when persistDir is set

**Files:**

- Modify: [`typescript/packages/server/src/app.ts`](typescript/packages/server/src/app.ts) — after registry construction, call restoreAll if persistDir is set.
- Test: extend `app.test.ts` to verify round-trip.

**Step 1: Write the failing test**

```ts
it('restores workspaces from persistDir on buildApp', async () => {
  const persistDir = mkdtempSync(join(tmpdir(), 'mirage-restore-'))
  // Seed: create workspace, snapshot, close
  const app1 = buildApp({ persistDir })
  await app1.inject({
    method: 'POST',
    url: '/v1/workspaces',
    payload: { id: 'round-trip', config: { mounts: { '/': { resource: 'ram', mode: 'write' } } } },
  })
  await app1.close()

  // Fresh app should restore
  const app2 = buildApp({ persistDir })
  const list = await app2.inject({ method: 'GET', url: '/v1/workspaces' })
  const body = list.json<{ id: string }[]>()
  expect(body.some((w) => w.id === 'round-trip')).toBe(true)
  await app2.close()
  rmSync(persistDir, { recursive: true, force: true })
})
```

**Step 2: Verify it fails**

Expected: FAIL — `round-trip` not in list because restoreAll isn't called.

**Step 3: Call restoreAll in buildApp**

In [`app.ts`](typescript/packages/server/src/app.ts), after `new WorkspaceRegistry(...)`:

```ts
if (options.persistDir !== undefined && options.persistDir !== '') {
  const pd = options.persistDir
  void restoreAll(registry, pd)
    .then(([restored, skipped]) => {
      console.log(`restored ${restored} workspaces (${skipped} skipped) from ${pd}`)
    })
    .catch((err: unknown) => { console.warn('restoreAll failed; starting empty:', err) })
}
```

Because `restoreAll` is async and `buildApp` is sync, the restore kicks off in the background. Route handlers may see an empty registry for the first ~ms after startup. If tests need strict ordering, make buildApp async (ripple through daemon.ts + tests). **Decision for this plan: keep buildApp sync; test calls `await` on a poll helper.**

Update the test to poll briefly if needed:

```ts
// In test: poll for up to 2s
const start = Date.now()
let body: { id: string }[] = []
while (Date.now() - start < 2000) {
  const list = await app2.inject({ method: 'GET', url: '/v1/workspaces' })
  body = list.json<{ id: string }[]>()
  if (body.some((w) => w.id === 'round-trip')) break
  await new Promise((r) => setTimeout(r, 50))
}
expect(body.some((w) => w.id === 'round-trip')).toBe(true)
```

**Step 4: Verify passes**

**Step 5: Commit**

```bash
git add typescript/packages/server/src/app.ts typescript/packages/server/src/app.test.ts
git commit -m "feat(server): restore workspaces from persistDir in buildApp"
```

______________________________________________________________________

# Slice 2 — Per-mount mode preservation on clone (Issue #2)

Core-level fix. `fromState` currently drops the `mode` field from each `MountSnapshot`. Python's `build_mount_args` reads it and passes `(resource, MountMode)` tuples to the constructor. TS's constructor takes a flat `Record<string, Resource>` — we don't want to change that shape. Instead we add an internal `modeOverrides?: Record<string, MountMode>` field to `WorkspaceOptions` that routes straight into `MountRegistry`'s `modeOverrides` parameter.

## Task 4: Add failing test that proves mode preservation is broken

**Files:**

- Test: [`typescript/packages/core/src/workspace/snapshot.test.ts`](typescript/packages/core/src/workspace/snapshot.test.ts)

**Step 1: Write the failing test**

Append:

```ts
it('preserves per-mount modes through save → load', async () => {
  const ws = new Workspace(
    { '/': new RAMResource(), '/ro': new RAMResource() },
    { mode: MountMode.WRITE, modeOverrides: { '/ro': MountMode.READ } },
  )
  const tmp = join(mkdtempSync(join(tmpdir(), 'snap-')), 'ws.tar')
  await ws.save(tmp)
  const loaded = await Workspace.load(tmp)
  const mounts = loaded.registry.allMounts()
  const roMount = mounts.find((m) => m.prefix === '/ro/')
  expect(roMount?.mode).toBe(MountMode.READ)
  const rootMount = mounts.find((m) => m.prefix === '/')
  expect(rootMount?.mode).toBe(MountMode.WRITE)
})
```

**Step 2: Verify it fails**

```bash
pnpm --filter @struktoai/mirage-core test -- snapshot.test
```

Expected: FAIL. Two possible failure modes:

- `modeOverrides` not a valid WorkspaceOptions field → TS compile error.
- Test runs but `roMount.mode === MountMode.WRITE` (global default from fromState options).

Either failure is OK for Step 2 — both prove the gap.

**Step 3: Commit the failing test only**

```bash
git add typescript/packages/core/src/workspace/snapshot.test.ts
git commit -m "test(core): failing test for per-mount mode round-trip"
```

This isolates the red → green transition in the next task's commit.

______________________________________________________________________

## Task 5: Add `modeOverrides` to `WorkspaceOptions` and restore modes in `fromState`

**Files:**

- Modify: [`typescript/packages/core/src/workspace/workspace.ts`](typescript/packages/core/src/workspace/workspace.ts) — add `modeOverrides` to `WorkspaceOptions`; thread to `MountRegistry`; populate from snapshot in `fromState`.
- Modify: [`typescript/packages/core/src/workspace/mount/registry.ts`](typescript/packages/core/src/workspace/mount/registry.ts) — already accepts `modeOverrides`; ensure call site actually passes it.

**Step 1: Locate the `WorkspaceOptions` type**

```bash
grep -n "interface WorkspaceOptions\|type WorkspaceOptions" typescript/packages/core/src/workspace/workspace.ts
```

Add a field:

```ts
export interface WorkspaceOptions {
  mode?: MountMode
  modeOverrides?: Record<string, MountMode>   // NEW
  agentId?: string
  ops?: OpsRegistry
  shellParser?: ShellParser | null
}
```

**Step 2: Thread `modeOverrides` into `MountRegistry` construction**

Locate the `new MountRegistry(...)` call in the `Workspace` constructor (~line 133). Update:

```ts
this.registry = new MountRegistry(
  resources,
  options.mode ?? MountMode.WRITE,
  options.modeOverrides ?? {},
)
```

**Step 3: Populate `modeOverrides` in `fromState` from `state.mounts`**

In the `fromState` method (~line 483), BEFORE `new this(resources, options)`:

```ts
const snapshotModes: Record<string, MountMode> = {}
for (const m of state.mounts) {
  if (m.mode !== undefined) {
    snapshotModes[m.prefix] = m.mode as MountMode
  }
}
const mergedOptions: WorkspaceOptions = {
  ...options,
  modeOverrides: { ...(options.modeOverrides ?? {}), ...snapshotModes },
}
const ws = new this(resources, mergedOptions) as InstanceType<T>
```

**Precedence rule — snapshot wins.** Spread `snapshotModes` *last* so per-mount modes from the saved state override any caller-supplied `modeOverrides`. This matches [Python's `_from_state`](python/mirage/workspace/workspace.py#L281-L291), which has no caller-facing way to override modes: `build_mount_args` reads `MountKey.MODE` from each mount unconditionally. Keeping TS strict-aligned means `fromState` is not a place to *change* modes — that's the constructor's job.

**Step 4: Run the Task 4 test**

```bash
pnpm --filter @struktoai/mirage-core test -- snapshot.test
```

Expected: PASS.

**Step 5: Run the full core suite**

```bash
pnpm --filter @struktoai/mirage-core test
```

Expected: all green. If any existing fromState-consumer test fails because it was relying on the bug, fix the test (don't revert the feature).

**Step 6: Commit**

```bash
git add typescript/packages/core/src/workspace/workspace.ts typescript/packages/core/src/workspace/mount/registry.ts
git commit -m "fix(core): preserve per-mount modes in Workspace.fromState"
```

______________________________________________________________________

## Task 6: Drop `MountMode.WRITE` override workaround from server's clone.ts

**Files:**

- Modify: [`typescript/packages/server/src/clone.ts`](typescript/packages/server/src/clone.ts:50-57) — remove workaround + TODO comment.
- Test: [`typescript/packages/server/src/routers/workspaces.test.ts`](typescript/packages/server/src/routers/workspaces.test.ts) — extend clone test to verify mode preservation.

**Step 1: Write the failing test**

Extend the existing clone test:

```ts
it('clone preserves per-mount modes', async () => {
  const app = buildApp()
  await app.inject({
    method: 'POST',
    url: '/v1/workspaces',
    payload: {
      id: 'src-modes',
      config: {
        mounts: {
          '/': { resource: 'ram', mode: 'write' },
          '/ro': { resource: 'ram', mode: 'read' },
        },
      },
    },
  })
  const res = await app.inject({
    method: 'POST',
    url: '/v1/workspaces/src-modes/clone',
    payload: { id: 'cloned-modes' },
  })
  expect(res.statusCode).toBe(201)
  const detail = await app.inject({ method: 'GET', url: '/v1/workspaces/cloned-modes?verbose=true' })
  const body = detail.json<{ mounts: { prefix: string; mode: string }[] }>()
  const ro = body.mounts.find((m) => m.prefix === '/ro/')
  expect(ro?.mode).toBe('read')
  await app.close()
})
```

(If `workspace detail` endpoint doesn't expose mount modes under `verbose`, adjust selector — or add a minimal helper that reads modes directly from `registry.get(id).runner.ws.registry.allMounts()`.)

**Step 2: Verify fails**

Expected: FAIL — clone currently forces WRITE.

**Step 3: Remove the workaround**

In [`clone.ts`](typescript/packages/server/src/clone.ts), delete lines 53-57 and replace with:

```ts
return Workspace.fromState(state, {}, merged)
```

Drop the TODO comment.

**Step 4: Verify passes**

**Step 5: Update docs**

In [`docs/typescript/server-and-cli.mdx`](docs/typescript/server-and-cli.mdx), remove the "Per-mount modes are not preserved on clone" bullet from Known limitations.

**Step 6: Commit**

```bash
git add typescript/packages/server/src/clone.ts typescript/packages/server/src/routers/workspaces.test.ts docs/typescript/server-and-cli.mdx
git commit -m "fix(server): clone preserves per-mount modes; drop WRITE workaround"
```

______________________________________________________________________

# Slice 3 — Real job cancel via AbortSignal (Issue #3)

Thread `AbortSignal` from `JobTable` → `Workspace.execute({ signal })` → `spawn({ signal })` in `packages/node/src/native.ts`.

**Design decision:** Node's `child_process.spawn({ signal })` sends `SIGTERM` (default `killSignal`) to the child on abort. The child_process close event fires with the signal. We translate that to a rejected promise with `new DOMException('execute aborted', 'AbortError')`. `JobTable.submit`'s wrapper catches the AbortError, checks `controller.signal.aborted`, and marks status CANCELED (not FAILED).

## Task 7: Add `signal?: AbortSignal` to `ExecuteOptions`

**Files:**

- Modify: [`typescript/packages/core/src/workspace/workspace.ts`](typescript/packages/core/src/workspace/workspace.ts:86-92) — extend `ExecuteOptions`.
- Test: [`typescript/packages/core/src/workspace/workspace.test.ts`](typescript/packages/core/src/workspace/workspace.test.ts) (create if missing, else extend)

**Step 1: Write the failing test**

```ts
it('execute with pre-aborted signal throws AbortError', async () => {
  const ws = new Workspace({ '/': new RAMResource() }, { mode: MountMode.WRITE })
  const controller = new AbortController()
  controller.abort()
  await expect(ws.execute('echo hi', { signal: controller.signal }))
    .rejects.toThrow(/abort/i)
})
```

**Step 2: Verify fails**

Expected: FAIL — `signal` not a valid ExecuteOptions key (TS error) OR test runs to completion because signal is ignored.

**Step 3: Extend `ExecuteOptions`**

```ts
export interface ExecuteOptions {
  stdin?: ByteSource | null
  provision?: boolean
  sessionId?: string
  agentId?: string
  native?: boolean
  signal?: AbortSignal   // NEW
}
```

**Step 4: Short-circuit in `execute` when already aborted**

At the top of `Workspace.execute`, add:

```ts
if (options?.signal?.aborted === true) {
  throw new DOMException('execute aborted', 'AbortError')
}
```

(Actual spawn-level abort is wired in Task 8. This step only handles the "already aborted" case.)

**Step 5: Verify passes**

**Step 6: Commit**

```bash
git add typescript/packages/core/src/workspace/workspace.ts typescript/packages/core/src/workspace/workspace.test.ts
git commit -m "feat(core): accept AbortSignal in ExecuteOptions (already-aborted short-circuit)"
```

______________________________________________________________________

## Task 8: Thread `signal` into `spawn` in `packages/node/src/native.ts`

**Files:**

- Modify: [`typescript/packages/node/src/native.ts`](typescript/packages/node/src/native.ts:28,78) — pass `signal` to `spawn` options (both spots).
- Trace: find the call path from `ws.execute` → `native.ts` and ensure the signal is passed through.
- Test: extend `typescript/packages/node/src/native.test.ts`.

**Step 1: Trace the call path**

```bash
grep -rn "native\." typescript/packages/core/src/workspace/executor/ typescript/packages/node/src/ | head -20
```

Identify every intermediate function that sits between `Workspace.execute` and `spawn`. Each needs a `signal?: AbortSignal` param added.

**Step 2: Write the failing test**

```ts
it('aborts a running subprocess and rejects with AbortError', async () => {
  const controller = new AbortController()
  const p = runShellCommand('sleep 10', { signal: controller.signal })
  setTimeout(() => controller.abort(), 50)
  await expect(p).rejects.toThrow(/abort/i)
})
```

(Adjust import name to whatever native.ts exports.)

**Step 3: Verify fails**

Expected: FAIL — either test function doesn't accept signal, or sleep completes.

**Step 4: Thread signal down**

In `native.ts` lines 28 and 78:

```ts
const proc = spawn('sh', ['-c', command], {
  cwd: options.cwd,
  env,
  signal: options.signal,   // NEW
})
```

On `proc.on('close', ...)`:

```ts
proc.on('close', (code, sig) => {
  if (options.signal?.aborted === true) {
    reject(new DOMException('execute aborted', 'AbortError'))
    return
  }
  // existing close handling
})
```

**Step 5: Thread signal through every intermediate**

Update `ExecuteOptions` propagation in the shell executor (core → node bridge) so `signal` reaches `native.ts`. Each function between `Workspace.execute` and `spawn` adds `signal?: AbortSignal` to its options interface and forwards it.

**Step 6: Verify passes**

**Step 7: Run full node suite**

```bash
pnpm --filter @struktoai/mirage-node test
```

Expected: all green.

**Step 8: Commit**

```bash
git add typescript/packages/node/src/native.ts typescript/packages/node/src/native.test.ts typescript/packages/core/src/workspace/executor/
git commit -m "feat(node): thread AbortSignal through shell pipeline to spawn"
```

______________________________________________________________________

## Task 9: Add `AbortController` to `JobEntry` and abort on `JobTable.cancel`

**Files:**

- Modify: [`typescript/packages/server/src/jobs.ts`](typescript/packages/server/src/jobs.ts:16-42) — add `controller: AbortController` field to `JobEntry`.
- Modify: [`typescript/packages/server/src/jobs.ts`](typescript/packages/server/src/jobs.ts:63-81,102-113) — `submit` creates controller; `cancel` aborts it.
- Modify: [`typescript/packages/server/src/routers/execute.ts`](typescript/packages/server/src/routers/execute.ts:38-44) — pass `entry.controller.signal` to `ws.execute`.
- Test: [`typescript/packages/server/src/jobs.test.ts`](typescript/packages/server/src/jobs.test.ts) or extend existing.

**Step 1: Write the failing test**

```ts
it('cancel aborts a running execute', async () => {
  const table = new JobTable()
  const job = table.submit('ws-1', 'sleep 10', async (signal) => {
    return new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })
  })
  setTimeout(() => { table.cancel(job.id) }, 20)
  const entry = await table.wait(job.id)
  expect(entry.status).toBe(JobStatus.CANCELED)
})
```

**Step 2: Verify fails**

Expected: FAIL — coroFactory doesn't accept a signal; cancel is cosmetic.

**Step 3: Update `JobEntry` and `JobTable.submit` signature**

```ts
export class JobEntry {
  public controller = new AbortController()
  // ...existing fields
}

submit(
  workspaceId: string,
  command: string,
  coroFactory: (signal: AbortSignal) => Promise<unknown>,
): JobEntry {
  const entry = new JobEntry(newJobId(), workspaceId, command)
  this.jobs.set(entry.id, entry)
  entry.status = JobStatus.RUNNING
  entry.startedAt = Date.now() / 1000
  void coroFactory(entry.controller.signal)
    .then((result) => {
      if (entry.controller.signal.aborted) {
        entry.status = JobStatus.CANCELED
      } else {
        entry.status = JobStatus.DONE
        entry.result = result
      }
    })
    .catch((err: unknown) => {
      if (entry.controller.signal.aborted) {
        entry.status = JobStatus.CANCELED
      } else {
        entry.status = JobStatus.FAILED
        entry.error = err instanceof Error ? err.message : String(err)
      }
    })
    .finally(() => {
      entry.finishedAt = Date.now() / 1000
      entry.done()
    })
  return entry
}
```

**Step 4: Make `cancel` abort the controller**

```ts
cancel(id: string): boolean {
  const entry = this.jobs.get(id)
  if (entry === undefined) return false
  if (entry.status === JobStatus.DONE ||
      entry.status === JobStatus.FAILED ||
      entry.status === JobStatus.CANCELED) return false
  entry.controller.abort()
  return true
}
```

**Step 5: Pass signal through execute router**

In [`execute.ts`](typescript/packages/server/src/routers/execute.ts), change:

```ts
const job = deps.jobs.submit(wsId, body.command, async (signal) =>
  entry.runner.ws.execute(body.command, {
    stdin: body.stdin,
    sessionId: body.sessionId,
    agentId: body.agentId,
    native: body.native,
    provision: body.provision,
    signal,            // NEW
  }),
)
```

**Step 6: Verify tests pass**

```bash
pnpm --filter @struktoai/mirage-server test
```

**Step 7: End-to-end smoke**

Build + launch daemon + start `sleep 30` via `--bg` + `job cancel`:

```bash
cd typescript && pnpm -r build
./packages/cli/dist/main.js workspace create /tmp/ws.yaml --id cancel-ws
./packages/cli/dist/main.js execute --bg -w cancel-ws -c "sleep 30"   # → job_xxx
./packages/cli/dist/main.js job cancel job_xxx
./packages/cli/dist/main.js job get job_xxx                            # status=canceled
ps aux | grep "sleep 30"                                                # should be gone
./packages/cli/dist/main.js daemon stop
```

**Step 8: Update docs**

In [`server-and-cli.mdx`](docs/typescript/server-and-cli.mdx), remove the "Job cancel is best-effort" bullet.

**Step 9: Commit**

```bash
git add typescript/packages/server/src/jobs.ts typescript/packages/server/src/routers/execute.ts typescript/packages/server/src/jobs.test.ts docs/typescript/server-and-cli.mdx
git commit -m "feat(server): real job cancel via AbortController → ws.execute → spawn signal"
```

______________________________________________________________________

# Slice 4 — Workspace load (Issue #4)

Overload `Workspace.load` to accept `string | Uint8Array` (mirrors Python's `load(source)` which accepts path OR file-like via `read_tar`), wire a multipart `POST /v1/workspaces/load` route, and un-stub the CLI subcommand.

## Task 10: Overload `Workspace.load` to accept bytes

**Python parity:** [`Workspace.load`](python/mirage/workspace/workspace.py#L244-L253) accepts `source: filesystem path OR a readable file-like object`. We mirror that shape by letting TS `load` accept `string | Uint8Array` — one method, two input types, exactly like Python.

**Files:**

- Modify: [`typescript/packages/core/src/workspace/workspace.ts`](typescript/packages/core/src/workspace/workspace.ts:473-481) — replace the path-only `load` with an overload.
- Test: [`typescript/packages/core/src/workspace/snapshot.test.ts`](typescript/packages/core/src/workspace/snapshot.test.ts).

**Step 1: Write the failing test**

```ts
it('load accepts an in-memory tar buffer', async () => {
  const ws = new Workspace({ '/': new RAMResource() }, { mode: MountMode.WRITE })
  const tmp = join(mkdtempSync(join(tmpdir(), 'snap-')), 'ws.tar')
  await ws.save(tmp)
  const buf = readFileSync(tmp)
  const restored = await Workspace.load(buf)
  expect(restored.registry.allMounts().length).toBeGreaterThan(0)
})
```

Keep the existing path-based `load` test intact — it still exercises the other branch of the overload.

**Step 2: Verify fails**

Expected: FAIL — TS rejects `Uint8Array` as `source` (type error), or `load` runs `readFileSync(buffer)` and errors.

**Step 3: Implement as an overload that dispatches on input type**

```ts
static async load<T extends typeof Workspace>(
  this: T,
  source: string | Uint8Array,
  options: WorkspaceOptions = {},
  overrides: Record<string, Resource> = {},
): Promise<InstanceType<T>> {
  const bytes = typeof source === 'string' ? readFileSync(source) : source
  const state = decodeSnapshot(bytes)
  return this.fromState(state, options, overrides)
}
```

Add `decodeSnapshot` import if not already present; it's at [`typescript/packages/core/src/snapshot/persist.ts:50`](typescript/packages/core/src/snapshot/persist.ts#L50). Remove any now-dead `loadSnapshotFromFile` import.

**Step 4: Verify both branches pass**

Run the new bytes test and the existing path-based test — both should pass.

**Step 5: Commit**

```bash
git add typescript/packages/core/src/workspace/workspace.ts typescript/packages/core/src/workspace/snapshot.test.ts
git commit -m "feat(core): Workspace.load accepts string | Uint8Array (Python parity)"
```

______________________________________________________________________

## Task 11: Add `POST /v1/workspaces/load` multipart endpoint

**Files:**

- Modify: [`typescript/packages/server/src/app.ts`](typescript/packages/server/src/app.ts) — register `@fastify/multipart` plugin.
- Modify: [`typescript/packages/server/src/routers/workspaces.ts`](typescript/packages/server/src/routers/workspaces.ts) — add route.
- Test: [`typescript/packages/server/src/routers/workspaces.test.ts`](typescript/packages/server/src/routers/workspaces.test.ts).

**Step 1: Register `@fastify/multipart`**

In `app.ts`:

```ts
import multipart from '@fastify/multipart'
// ...
await app.register(multipart)   // inside buildApp, before registerWorkspacesRoutes
```

Because `register` is async, if `buildApp` is currently sync this is a problem. Two options:

- Make `buildApp` return `Promise<MirageApp>` and ripple through daemon.ts + tests.
- Use `app.register(multipart)` without `await` — Fastify defers until `app.ready()`.

**Decision for this plan:** use the non-awaited form; Fastify's `inject()` calls `ready()` implicitly, and daemon.ts calls `app.listen(...)` which also awaits `ready()`.

**Step 2: Write the failing test**

```ts
it('POST /v1/workspaces/load creates a workspace from a tar buffer', async () => {
  // Seed: create a workspace and snapshot it
  const app1 = buildApp()
  await app1.inject({
    method: 'POST',
    url: '/v1/workspaces',
    payload: { id: 'seed', config: { mounts: { '/': { resource: 'ram', mode: 'write' } } } },
  })
  const snap = await app1.inject({ method: 'GET', url: '/v1/workspaces/seed/snapshot' })
  expect(snap.statusCode).toBe(200)
  const tarBuf = snap.rawPayload
  await app1.close()

  // Load it back on a fresh app
  const app2 = buildApp()
  const form = new FormData()
  form.append('tar', new Blob([tarBuf], { type: 'application/x-tar' }), 'ws.tar')
  form.append('id', 'loaded')
  const res = await app2.inject({
    method: 'POST',
    url: '/v1/workspaces/load',
    payload: form,
  })
  expect(res.statusCode).toBe(201)
  const body = res.json<{ id: string }>()
  expect(body.id).toBe('loaded')
  await app2.close()
})
```

**Step 3: Verify fails**

Expected: FAIL — 404 route not found.

**Step 4: Implement the route**

In `workspaces.ts`:

```ts
app.post('/v1/workspaces/load', async (req, reply) => {
  let tarBuf: Buffer | null = null
  let workspaceId: string | undefined
  let override: unknown
  const parts = req.parts()
  for await (const part of parts) {
    if (part.type === 'file' && part.fieldname === 'tar') {
      tarBuf = await part.toBuffer()
    } else if (part.type === 'field' && part.fieldname === 'id') {
      workspaceId = String(part.value)
    } else if (part.type === 'field' && part.fieldname === 'override') {
      try { override = JSON.parse(String(part.value)) }
      catch { return reply.status(400).send({ detail: 'override must be JSON' }) }
    }
  }
  if (tarBuf === null) return reply.status(400).send({ detail: 'missing tar field' })
  if (workspaceId !== undefined && deps.registry.has(workspaceId)) {
    return reply.status(409).send({ detail: `workspace id already exists: ${workspaceId}` })
  }
  const overrides = await buildOverrideResources(override as OverrideShape | null)
  let ws: Workspace
  try {
    ws = await Workspace.load(new Uint8Array(tarBuf), {}, overrides)
  } catch (err: unknown) {
    return reply.status(400).send({ detail: err instanceof Error ? err.message : String(err) })
  }
  const entry = deps.registry.add(ws, workspaceId)
  return reply.status(201).send(makeDetail(entry))
})
```

Use `buildOverrideResources` from existing [`clone.ts`](typescript/packages/server/src/clone.ts) — export it if currently local.

**Step 5: Verify passes**

**Step 6: Commit**

```bash
git add typescript/packages/server/src/app.ts typescript/packages/server/src/routers/workspaces.ts typescript/packages/server/src/clone.ts typescript/packages/server/src/routers/workspaces.test.ts
git commit -m "feat(server): POST /v1/workspaces/load accepts multipart tar upload"
```

______________________________________________________________________

## Task 12: Wire the CLI `workspace load` subcommand

**Files:**

- Modify: [`typescript/packages/cli/src/workspace.ts`](typescript/packages/cli/src/workspace.ts:100-106) — replace stub.
- Modify: [`typescript/packages/cli/src/client.ts`](typescript/packages/cli/src/client.ts) — add `uploadFile` method or inline with `FormData`.
- Test: [`typescript/packages/cli/src/e2e.test.ts`](typescript/packages/cli/src/e2e.test.ts) — add save → delete → load round-trip.

**Step 1: Write the failing E2E**

```ts
it('workspace save + load round-trips', () => {
  // ... create 'round-ws' via CLI
  const tarPath = join(tmp, 'round.tar')
  spawnSync(process.execPath, [cliBin, 'workspace', 'save', 'round-ws', tarPath], { env, encoding: 'utf-8' })
  expect(existsSync(tarPath)).toBe(true)
  spawnSync(process.execPath, [cliBin, 'workspace', 'delete', 'round-ws'], { env, encoding: 'utf-8' })
  const loaded = spawnSync(process.execPath, [cliBin, 'workspace', 'load', tarPath, '--id', 'reloaded'], { env, encoding: 'utf-8' })
  expect(loaded.status).toBe(0)
  const list = spawnSync(process.execPath, [cliBin, 'workspace', 'list'], { env, encoding: 'utf-8' })
  expect(list.stdout).toContain('reloaded')
})
```

**Step 2: Verify fails**

Expected: FAIL — stub throws "not yet implemented".

**Step 3: Replace the stub**

```ts
ws.command('load')
  .argument('<tar>')
  .option('--id <id>')
  .option('--override <path>')
  .action(async (tarPath: string, opts: { id?: string; override?: string }) => {
    const c = client()
    if (!existsSync(tarPath)) fail(`tar file not found: ${tarPath}`)
    const form = new FormData()
    const buf = readFileSync(tarPath)
    form.append('tar', new Blob([buf], { type: 'application/x-tar' }), basename(tarPath))
    if (opts.id !== undefined) form.append('id', opts.id)
    if (opts.override !== undefined) {
      const overrideText = readFileSync(opts.override, 'utf-8')
      let parsed: unknown
      try { parsed = yamlParse(overrideText) }
      catch (err: unknown) { fail(`invalid override YAML/JSON at ${opts.override}: ${String(err)}`, 2) }
      form.append('override', JSON.stringify(interpolateEnv(parsed, envRecord())))
    }
    const res = await c.requestMultipart('POST', '/v1/workspaces/load', form)
    if (res.status >= 400) fail(`load failed: ${await res.text()}`, 2)
    const body = await res.json()
    console.log(JSON.stringify(body, null, 2))
  })
```

Import `parse as yamlParse` from the `yaml` package (already used elsewhere in CLI for `workspace create`). **Python parity:** [`_resolve_override`](python/mirage/cli/workspace.py#L34-L42) uses `_load_yaml` — YAML is a JSON superset, so JSON override files still parse fine; YAML override files now work too.

**Step 3b: Fix the same bug in `workspace clone`**

The existing TS `workspace clone` subcommand has the same JSON-only override handling — Python's `clone_cmd` at [`clone_cmd`](python/mirage/cli/workspace.py#L102-L127) also uses `_resolve_override`. Switch `JSON.parse` → `yamlParse` in [`typescript/packages/cli/src/workspace.ts`](typescript/packages/cli/src/workspace.ts) `clone` action to stay consistent. Add a test case that loads a YAML override during clone to prove alignment.

**Step 4: Add `requestMultipart` helper to `client.ts`**

```ts
async requestMultipart(method: string, path: string, form: FormData): Promise<Response> {
  const url = `${this.daemonUrl}${path}`
  const headers: Record<string, string> = {}
  if (this.settings.authToken !== '') {
    headers.Authorization = `Bearer ${this.settings.authToken}`
  }
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, 60_000)
  try {
    return await fetch(url, { method, headers, body: form, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}
```

(Do NOT set Content-Type manually — fetch will add the multipart boundary.)

**Step 5: Verify E2E passes**

**Step 6: Update docs**

In [`server-and-cli.mdx`](docs/typescript/server-and-cli.mdx), remove the `mirage workspace load` known-limitation bullet and add a "Save/load round-trip" example under Workspace lifecycle.

**Step 7: Commit**

```bash
git add typescript/packages/cli/src/workspace.ts typescript/packages/cli/src/client.ts typescript/packages/cli/src/e2e.test.ts docs/typescript/server-and-cli.mdx
git commit -m "feat(cli): mirage workspace load uploads tar and restores via /v1/workspaces/load"
```

______________________________________________________________________

# Finish

## Task 13: Final verification

```bash
cd typescript && pnpm -r typecheck && pnpm -r lint && pnpm -r test
```

Expected: all green across core, node, browser, server, cli.

Manually verify all four gaps are closed:

1. **Persistence:** start daemon with `MIRAGE_PERSIST_DIR`; create a workspace; stop daemon; verify tar exists; restart daemon; verify workspace listed.
1. **Per-mount modes:** create a workspace with mixed `mode: read` and `mode: write` mounts; clone it; `workspace get <clone-id>` shows source modes.
1. **Cancel:** `execute --bg sleep 30`; `job cancel`; `ps` confirms child killed; `job get` shows CANCELED.
1. **Load:** save workspace, delete it, load from tar, verify usable.

Update [`docs/typescript/server-and-cli.mdx`](docs/typescript/server-and-cli.mdx) — the Known limitations section should be down to at most the single remaining one (if any) plus any new gaps we chose to defer. The file's `### Where things live` table should stay current.

```bash
git add docs/typescript/server-and-cli.mdx
git commit -m "docs(ts): update server-and-cli known limitations after gap closures"
```

Then use `superpowers:finishing-a-development-branch` to close out.

______________________________________________________________________

# Red flags for implementer

- **Don't make `buildApp` async.** The existing surface is sync; Fastify's `register(multipart)` works without awaiting because `inject()`/`listen()` call `ready()` for you.
- **Don't replace `WorkspaceOptions` with a richer type** that combines `mode` and `modeOverrides` into a tuple dict. That's a bigger refactor than needed; one extra field on the existing options works.
- **Don't catch `AbortError` in `native.ts` and swallow it.** Let it reject. `JobTable.submit`'s `.catch` checks `controller.signal.aborted` to distinguish CANCELED from FAILED.
- **Don't forget `verbatimModuleSyntax`.** When importing only-as-type in server/cli, use `import type { ... }`.
- **Don't hardcode `Content-Type: multipart/form-data` in the CLI.** `fetch` computes the boundary; manual header breaks parsing.
- **Don't silently mask `RuntimeError`-like patterns.** If `restoreAll` crashes, log and continue; don't `try/catch` it into oblivion.

# References

- Python source of truth for behavior:
  - Persistence: [`python/mirage/server/app.py:49-75`](python/mirage/server/app.py#L49-L75)
  - Modes: [`python/mirage/workspace/snapshot/state.py:75-116`](python/mirage/workspace/snapshot/state.py#L75-L116)
  - Cancel: [`python/mirage/server/jobs.py:142-149`](python/mirage/server/jobs.py#L142-L149) (Python's cancel is softer than ours will be — TS beats Python here because Node's spawn({signal}) kills the child).
  - Load: [`python/mirage/server/routers/workspaces.py:108-137`](python/mirage/server/routers/workspaces.py#L108-L137)
