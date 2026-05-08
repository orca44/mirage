# TS ExecuteOptions: per-call `cwd`, `env`, and mid-flight `AbortSignal` — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-call `cwd` and `env` to `Workspace.execute()` (issues #4, #5) and observe `AbortSignal` cooperatively mid-execution (issue #6), so a single TS PR closes all three issues.

**Architecture:**

1. **Per-call cwd/env (#4, #5):** When either option is provided, construct a per-call ephemeral `Session` that shallow-clones the target session with overrides applied (`cwd` overridden, `env` = `{...session.env, ...options.env}`). The executor runs against the clone. Only `lastExitCode` propagates back to the persistent session — `cd`/`export` inside the call do not mutate the caller's session. The semantics match a bash subshell: `execute('ls', { cwd: '/data' })` is the JS equivalent of `(cd /data && ls)`. The clone is the software stand-in for what `fork()` provides automatically in Unix.

1. **Mid-flight abort (#6):** Thread `signal` through `ExecuteNodeDeps`. Check `signal.aborted` at the top of `executeNode()` — every recursion (LIST, PIPELINE, FOR/WHILE/UNTIL iterations, COMMAND) passes through this gate, so cancellation lands within one boundary. For the long-blocking primitive `sleep`, race the timer against the signal so wall-clock aborts don't have to wait for sleep to finish.

**Two-scope model (do not introduce a third):**

| Need                                        | API                                     | Bash equivalent     |
| ------------------------------------------- | --------------------------------------- | ------------------- |
| One isolated command                        | `execute(cmd, { cwd, env })`            | `(cd /data && cmd)` |
| Many isolated commands sharing scoped state | `createSession(id)` + pass `sessionId`  | a separate terminal |
| Persistent shell-like state                 | mutate the default session (no options) | `cd /data; cmd`     |

Do **not** add a `subshell: {...}` option, an `isolated: true` flag, or any other third mode. Per-call cwd/env via flat options + sessions cover every case. If a "scoped multi-call helper" is ever needed, add it later as `ws.withScope(fn)` (additive, non-breaking).

**Tech Stack:** TypeScript, Vitest, `@struktoai/mirage-core`. Tests live next to source as `*.test.ts`.

**Key files:**

- [workspace.ts:164](typescript/packages/core/src/workspace/workspace.ts#L164) — `ExecuteOptions` interface
- [workspace.ts:526](typescript/packages/core/src/workspace/workspace.ts#L526) — `execute()` body
- [execute_node.ts:99](typescript/packages/core/src/workspace/node/execute_node.ts#L99) — `ExecuteNodeDeps`
- [execute_node.ts:119](typescript/packages/core/src/workspace/node/execute_node.ts#L119) — `executeNode()` top
- [builtins.ts:684](typescript/packages/core/src/workspace/executor/builtins.ts#L684) — `handleSleep`
- [session.ts:27](typescript/packages/core/src/workspace/session/session.ts#L27) — `Session` class

**Out of scope:**

- `FOO=bar cmd` prefix bug (mentioned in #5 context). User to decide whether to bundle in a follow-up.
- Python-side abort/cwd/env work.
- Issue #3 (batched reads) — separate plan.

______________________________________________________________________

## Test harness

All tests live in one new file: `typescript/packages/core/src/workspace/execute_options.test.ts`. Run from `typescript/packages/core`:

```bash
npx vitest run src/workspace/execute_options.test.ts
```

Use `RAMResource` mounted at `/data` and a default `Workspace` for setup. Reuse the existing test scaffolding pattern from [execute.test.ts](typescript/packages/core/src/workspace/execute.test.ts) and [cwd_integration.test.ts](typescript/packages/core/src/workspace/cwd_integration.test.ts).

______________________________________________________________________

## Task 1 — Per-call `cwd`: failing tests

**Files:**

- Create: `typescript/packages/core/src/workspace/execute_options.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest'
import { Workspace } from './workspace.ts'
import { RAMResource } from '../resource/ram.ts'
import { MountMode } from '../mount/types.ts'

async function makeWorkspace() {
  // Use the same factory pattern as cwd_integration.test.ts.
  // Returns a Workspace with /data mounted RW.
}

describe('execute({ cwd }): bash subshell semantics', () => {
  it('runs the command in the override cwd, like (cd /data && pwd)', async () => {
    const ws = await makeWorkspace()
    const r = await ws.execute('pwd', { cwd: '/data' })
    expect(r.stdoutText.trim()).toBe('/data')
  })

  it('does not mutate session.cwd', async () => {
    const ws = await makeWorkspace()
    const before = ws.cwd
    await ws.execute('pwd', { cwd: '/data' })
    expect(ws.cwd).toBe(before)
  })

  it('does not let `cd` inside the call leak back to session.cwd', async () => {
    const ws = await makeWorkspace()
    const before = ws.cwd
    await ws.execute('cd /data', { cwd: '/' })
    expect(ws.cwd).toBe(before)
  })

  it('does not leak between parallel calls (isolation regression guard)', async () => {
    const ws = await makeWorkspace()
    const [a, b] = await Promise.all([
      ws.execute('pwd', { cwd: '/data' }),
      ws.execute('pwd', { cwd: '/' }),
    ])
    expect(a.stdoutText.trim()).toBe('/data')
    expect(b.stdoutText.trim()).toBe('/')
  })

  it("Fred's pattern: setup mutates session, per-call overrides inherit and don't leak", async () => {
    const ws = await makeWorkspace()
    await ws.execute('export DEBUG=1')
    const [a, b] = await Promise.all([
      ws.execute('printenv DEBUG; pwd', { cwd: '/data' }),
      ws.execute('printenv DEBUG; pwd', { cwd: '/' }),
    ])
    expect(a.stdoutText).toContain('1')
    expect(a.stdoutText).toContain('/data')
    expect(b.stdoutText).toContain('1')
    expect(b.stdoutText).toContain('/')
    expect(ws.env.DEBUG).toBe('1')
    expect(ws.cwd).not.toBe('/data')
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/workspace/execute_options.test.ts`
Expected: FAIL — TS error "object literal may only specify known properties, 'cwd' does not exist on type 'ExecuteOptions'".

**Step 3: Commit failing tests**

```bash
git add typescript/packages/core/src/workspace/execute_options.test.ts
git commit -m "test: add failing tests for per-call cwd in ExecuteOptions"
```

______________________________________________________________________

## Task 2 — Per-call `cwd`: implementation

**Files:**

- Modify: [workspace.ts:164](typescript/packages/core/src/workspace/workspace.ts#L164) — add field to `ExecuteOptions`
- Modify: [workspace.ts:526](typescript/packages/core/src/workspace/workspace.ts#L526) — build ephemeral session

**Step 1: Add field to interface**

```typescript
export interface ExecuteOptions {
  stdin?: ByteSource | null
  provision?: boolean
  sessionId?: string
  agentId?: string
  native?: boolean
  signal?: AbortSignal
  noHistory?: boolean
  /**
   * Per-call working directory. Providing this runs the command in an
   * isolated session, like a bash subshell `(cd <cwd> && cmd)`. Mutations
   * (cd, export) inside the call do NOT persist back to the workspace's
   * session. To change the persistent cwd, assign `ws.cwd` directly or run
   * `ws.execute('cd <path>')` without this option.
   */
  cwd?: string
}
```

**Step 2: Build ephemeral session in `execute()`**

After this block (around line 603):

```typescript
const targetSessionId = options.sessionId ?? this.sessionManager.defaultId
const targetSession = this.sessionManager.get(targetSessionId)
```

Insert:

```typescript
const useOverride = options.cwd !== undefined
const effectiveSession = useOverride
  ? new Session({
      sessionId: targetSession.sessionId,
      cwd: options.cwd ?? targetSession.cwd,
      env: { ...targetSession.env },
      createdAt: targetSession.createdAt,
      functions: targetSession.functions,
      lastExitCode: targetSession.lastExitCode,
      positionalArgs: targetSession.positionalArgs,
    })
  : targetSession
```

Replace `targetSession` with `effectiveSession` only in the `executeNode(...)` call (line 606). Keep `targetSession` for `lastExitCode` write-back, `sessionCwd`, observer logging, and history — those should still reference the persistent session.

After execute, replace `targetSession.lastExitCode = io.exitCode` with:

```typescript
targetSession.lastExitCode = io.exitCode
```

(unchanged — write-back to real session preserves `$?` semantics).

Add the import for `Session` at the top of the file.

**Step 3: Run tests**

Run: `npx vitest run src/workspace/execute_options.test.ts`
Expected: All four `cwd` tests PASS.

**Step 4: Run the broader workspace test suite to catch regressions**

Run: `npx vitest run src/workspace/` from `typescript/packages/core`.
Expected: PASS. If any test fails because it relied on session mutation through execute, investigate before patching the test.

**Step 5: Commit**

```bash
git add typescript/packages/core/src/workspace/workspace.ts
git commit -m "feat(core): support per-call cwd in ExecuteOptions (#4)"
```

______________________________________________________________________

## Task 3 — Per-call `env`: failing tests

**Files:**

- Modify: `typescript/packages/core/src/workspace/execute_options.test.ts`

**Step 1: Append to test file**

```typescript
describe('execute({ env }): bash subshell semantics', () => {
  it('exposes override env to the command', async () => {
    const ws = await makeWorkspace()
    const r = await ws.execute('printenv FOO', { env: { FOO: 'bar' } })
    expect(r.exitCode).toBe(0)
    expect(r.stdoutText.trim()).toBe('bar')
  })

  it('does not mutate session.env', async () => {
    const ws = await makeWorkspace()
    const before = { ...ws.env }
    await ws.execute('printenv FOO', { env: { FOO: 'bar' } })
    expect(ws.env).toEqual(before)
  })

  it('does not let `export` inside the call leak back to session.env', async () => {
    const ws = await makeWorkspace()
    await ws.execute('export LEAKED=yes', { env: { FOO: 'bar' } })
    expect(ws.env.LEAKED).toBeUndefined()
  })

  it('layers onto, does not replace, session env', async () => {
    const ws = await makeWorkspace()
    ws.env = { BASE: 'keep' }
    const r = await ws.execute('printenv BASE; printenv FOO', { env: { FOO: 'bar' } })
    expect(r.stdoutText).toContain('keep')
    expect(r.stdoutText).toContain('bar')
  })

  it('isolates concurrent calls with different env', async () => {
    const ws = await makeWorkspace()
    const [a, b] = await Promise.all([
      ws.execute('printenv X', { env: { X: 'one' } }),
      ws.execute('printenv X', { env: { X: 'two' } }),
    ])
    expect(a.stdoutText.trim()).toBe('one')
    expect(b.stdoutText.trim()).toBe('two')
  })
})
```

**Step 2: Run tests, confirm they fail**

Run: `npx vitest run src/workspace/execute_options.test.ts`
Expected: FAIL on the `env` describe block — TS error on the `env:` literal.

**Step 3: Commit**

```bash
git add typescript/packages/core/src/workspace/execute_options.test.ts
git commit -m "test: add failing tests for per-call env in ExecuteOptions"
```

______________________________________________________________________

## Task 4 — Per-call `env`: implementation

**Files:**

- Modify: [workspace.ts:164](typescript/packages/core/src/workspace/workspace.ts#L164)
- Modify: [workspace.ts:526](typescript/packages/core/src/workspace/workspace.ts#L526)

**Step 1: Extend interface**

```typescript
export interface ExecuteOptions {
  // ...existing fields...
  cwd?: string
  /**
   * Per-call environment variable overrides, layered on top of the
   * session's env. Providing this runs the command in an isolated session,
   * like `env FOO=bar cmd` or `(export FOO=bar; cmd)`. Mutations
   * (export) inside the call do NOT persist back to the workspace's
   * session. To change the persistent env, assign `ws.env` directly or run
   * `ws.execute('export FOO=bar')` without this option.
   */
  env?: Record<string, string>
}
```

**Step 2: Extend ephemeral-session construction**

Update the `useOverride` line and clone:

```typescript
const useOverride = options.cwd !== undefined || options.env !== undefined
const effectiveSession = useOverride
  ? new Session({
      sessionId: targetSession.sessionId,
      cwd: options.cwd ?? targetSession.cwd,
      env: { ...targetSession.env, ...(options.env ?? {}) },
      createdAt: targetSession.createdAt,
      functions: targetSession.functions,
      lastExitCode: targetSession.lastExitCode,
      positionalArgs: targetSession.positionalArgs,
    })
  : targetSession
```

The `env: { ...session.env, ...options.env }` spread guarantees per-call additions/overrides on top of the session baseline, and `export` mutations during the call land on the clone.

**Step 3: Run tests**

Run: `npx vitest run src/workspace/execute_options.test.ts`
Expected: All `env` tests PASS.

**Step 4: Run the wider suite**

Run: `npx vitest run src/workspace/`
Expected: PASS.

**Step 5: Commit**

```bash
git add typescript/packages/core/src/workspace/workspace.ts
git commit -m "feat(core): support per-call env in ExecuteOptions (#5)"
```

______________________________________________________________________

## Task 5 — Mid-flight abort: failing tests

**Files:**

- Modify: `typescript/packages/core/src/workspace/execute_options.test.ts`

**Step 1: Append to test file**

```typescript
describe('execute({ signal }) — mid-flight cancellation', () => {
  it('rejects with AbortError when signal is pre-aborted', async () => {
    const ws = await makeWorkspace()
    const ac = new AbortController()
    ac.abort()
    await expect(ws.execute('echo hi', { signal: ac.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
  })

  it('aborts a sleeping command within ~timeout window', async () => {
    const ws = await makeWorkspace()
    const t0 = Date.now()
    await expect(
      ws.execute('sleep 5', { signal: AbortSignal.timeout(100) }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    const elapsed = Date.now() - t0
    expect(elapsed).toBeLessThan(1000)
  })

  it('aborts inside a for loop within one iteration', async () => {
    const ws = await makeWorkspace()
    const t0 = Date.now()
    const ac = new AbortController()
    setTimeout(() => ac.abort(), 100)
    await expect(
      ws.execute('for i in 1 2 3 4 5 6 7 8 9 10; do sleep 1; done', {
        signal: ac.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(Date.now() - t0).toBeLessThan(1500)
  })

  it('aborts between LIST stages', async () => {
    const ws = await makeWorkspace()
    const ac = new AbortController()
    setTimeout(() => ac.abort(), 100)
    await expect(
      ws.execute('sleep 1 && sleep 1 && sleep 1 && echo done', {
        signal: ac.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
```

**Step 2: Run, confirm only the pre-abort case passes**

Run: `npx vitest run src/workspace/execute_options.test.ts`
Expected: pre-abort PASS (existing behavior); the three mid-flight cases FAIL because `sleep 5` runs to completion.

**Step 3: Commit**

```bash
git add typescript/packages/core/src/workspace/execute_options.test.ts
git commit -m "test: add failing tests for mid-flight abort observation"
```

______________________________________________________________________

## Task 6 — Thread signal through `ExecuteNodeDeps` and gate at recursion boundary

**Files:**

- Modify: [execute_node.ts:99](typescript/packages/core/src/workspace/node/execute_node.ts#L99) — `ExecuteNodeDeps`
- Modify: [execute_node.ts:113](typescript/packages/core/src/workspace/node/execute_node.ts#L113) — top of `executeNode`
- Modify: [workspace.ts:587](typescript/packages/core/src/workspace/workspace.ts#L587) — pass signal in `deps`

**Step 1: Add `signal` to `ExecuteNodeDeps`**

```typescript
export interface ExecuteNodeDeps {
  // ...existing fields...
  history?: CommandHistory
  signal?: AbortSignal
}
```

**Step 2: Gate at top of `executeNode`**

After `const ntype = node.type` (line 128), add:

```typescript
if (deps.signal?.aborted === true) {
  throw new DOMException('execute aborted', 'AbortError')
}
```

This single check fires on every recursion — LIST connections, PIPELINE stages, FOR/WHILE/UNTIL iterations (each iteration recurses into the body), and per-COMMAND. That handles the loop and LIST tests in Task 5.

**Step 3: Pass signal in `deps` from `workspace.ts`**

In the `deps` object built around line 588, add:

```typescript
const deps = {
  // ...existing fields...
  history: this.history,
  signal: options.signal,
}
```

**Step 4: Run tests**

Run: `npx vitest run src/workspace/execute_options.test.ts`
Expected: pre-abort PASS, for-loop PASS, LIST PASS. `sleep 5` test still FAILS (sleep doesn't yield).

______________________________________________________________________

## Task 7 — Make `handleSleep` honor the signal

**Files:**

- Modify: [builtins.ts:684](typescript/packages/core/src/workspace/executor/builtins.ts#L684)
- Modify: [execute_node.ts](typescript/packages/core/src/workspace/node/execute_node.ts) — pass signal into `handleSleep`

**Step 1: Find how `handleSleep` is dispatched**

Run: `grep -n "handleSleep" typescript/packages/core/src/workspace/`
Identify the call site (likely a builtin dispatch in `executor/command.ts` or `node/execute_node.ts`) — document the call site here before editing.

**Step 2: Change `handleSleep` to accept a signal**

```typescript
export async function handleSleep(
  args: string[],
  signal?: AbortSignal,
): Promise<Result> {
  const raw = args[0]
  if (raw === undefined) {
    return [null, new IOResult(), new ExecutionNode({ command: 'sleep', exitCode: 0 })]
  }
  const seconds = Number(raw)
  if (!Number.isFinite(seconds)) {
    const err = new TextEncoder().encode(`sleep: invalid argument: ${raw}\n`)
    return [
      null,
      new IOResult({ exitCode: 1, stderr: err }),
      new ExecutionNode({ command: 'sleep', exitCode: 1 }),
    ]
  }
  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(new DOMException('execute aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, seconds * 1000)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('execute aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
  return [null, new IOResult(), new ExecutionNode({ command: 'sleep', exitCode: 0 })]
}
```

**Step 3: Pass `deps.signal` through to `handleSleep` at the dispatch site**

At the location identified in Step 1, change `handleSleep(args)` → `handleSleep(args, deps.signal)`. If `handleSleep` is dispatched from inside `executeCommand` which doesn't currently receive `deps`, plumb `signal` in via the call signature (smallest change first — don't refactor the whole deps object).

**Step 4: Run tests**

Run: `npx vitest run src/workspace/execute_options.test.ts`
Expected: All abort tests PASS, including `sleep 5` aborting in \<1s.

**Step 5: Run wider suite**

Run: `npx vitest run src/workspace/`
Expected: PASS.

**Step 6: Commit**

```bash
git add typescript/packages/core/src/
git commit -m "feat(core): observe AbortSignal mid-execution (#6)"
```

______________________________________________________________________

## Task 8 — Final verification

**Step 1: Lint and format**

```bash
./python/.venv/bin/pre-commit run --all-files
```

Expected: PASS. Fix any reported issues.

**Step 2: Full TS test suite**

```bash
cd typescript && npm test --workspaces
```

Expected: PASS across all TS packages.

**Step 3: Confirm no Python regressions in scope**

This change is TS-only, so per `feedback_scope_tests_to_changes` we do not run pytest.

**Step 4: Smoke-test Fred's repro inline**

Save and run a small TS scratch script that reproduces the example from issue #6 and asserts the AbortError fires fast for `sleep 5`. Delete the scratch file before committing.

**Step 5: Verify all three issues are addressed by reviewing the diff**

- #4: `cwd?: string` in `ExecuteOptions`, ephemeral session, no `session.cwd` mutation.
- #5: `env?: Record<string, string>` in `ExecuteOptions`, layered with spread, no `session.env` mutation.
- #6: `signal` threaded into deps, top-of-`executeNode` gate, `handleSleep` race.

______________________________________________________________________

## Open question for the user

Should the `FOO=bar cmd` prefix bug (mentioned in issue #5 context) be bundled into this PR or filed as a separate follow-up? The fix is unrelated to `ExecuteOptions` — it's a missing call to `getCommandAssignments` in the executor — and bundling it would expand scope. Default recommendation: file it as a follow-up issue and reference it in the #5 PR.
