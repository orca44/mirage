# TS ↔ Python API Parity Pass

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bring `@struktoai/mirage-{core,node,browser}` public APIs into 1:1 parity with the Python `mirage` package. Eliminate all known divergences except FUSE/native (deferred — Node-only system features).

**Architecture:** Touch the universal `core` Workspace + supporting types, then surface platform-package additions through subclass passthrough. Keep snake-vs-camel renaming. Add tests per change.

**Tech Stack:** TypeScript, vitest, Node + browser packages, web-tree-sitter parser.

______________________________________________________________________

## Phase 1 — Public types: PathSpec everywhere ops/dispatch travel

### Task 1: `Workspace.dispatch` takes `PathSpec`, returns `[value, IOResult]`, supports kwargs

**Files:**

- Modify: `typescript/packages/core/src/workspace/workspace.ts:207-211`
- Modify: `typescript/packages/core/src/workspace/fs.ts` (callers that pass `string` — need to wrap into `PathSpec` first)
- Test: `typescript/packages/core/src/workspace/dispatch.test.ts` (new)

**Step 1: Change the signature**

Current:

```ts
async dispatch(opName: string, path: string, args: readonly unknown[] = []): Promise<unknown> {
  const [resource, spec] = await this.resolve(path)
  return this.opsRegistry.call(opName, resource.kind, resource, spec, args)
}
```

New (mirrors Python `async def dispatch(op, path: PathSpec, **kwargs) -> tuple[Any, IOResult]`):

```ts
async dispatch(
  opName: string,
  path: PathSpec,
  kwargs: Record<string, unknown> = {},
): Promise<[unknown, IOResult]> {
  const mount = this.registry.mountFor(path.original)
  if (mount === null) throw new Error(`no mount matches ${path.original}`)

  // Cache check on read ops (matches Python semantics)
  if (DISPATCH_READ_OPS.has(opName)) {
    const cached = await this.cache.get(path.original)
    if (cached !== null) {
      // ALWAYS consistency: stat + fingerprint check
      if (this.consistency === ConsistencyPolicy.ALWAYS) {
        const remoteStat = await mount.executeOp('stat', path.original) as FileStat | null
        if (remoteStat !== null && remoteStat.fingerprint !== null) {
          const fresh = await this.cache.isFresh(path.original, remoteStat.fingerprint)
          if (!fresh) await this.cache.remove(path.original)
        }
      }
      return [cached, new IOResult({ reads: { [path.original]: cached } })]
    }
  }

  // Open + dispatch
  const [resource] = await this.resolve(path.original)
  const args = Object.keys(kwargs).length > 0 ? [kwargs] : []
  const result = await this.opsRegistry.call(opName, resource.kind, resource, path, args)
  if (DISPATCH_WRITE_OPS.has(opName)) {
    await this.cache.remove(path.original)
  }
  return [result, new IOResult()]
}
```

**Step 2: Wire `consistency` field on Workspace** (needed by step 1)

Add to constructor body:

```ts
this.consistency = options.consistency ?? ConsistencyPolicy.LAZY
this.registry.setConsistency(this.consistency)
```

Add field declaration: `private readonly consistency: ConsistencyPolicy`

Add to `WorkspaceOptions`: `consistency?: ConsistencyPolicy`

Import `ConsistencyPolicy` from `../types.js`.

**Step 3: Write the test**

```ts
// dispatch.test.ts
import { describe, expect, it } from 'vitest'
import { MountMode, RAMResource } from '../../resource/ram/ram.js'
// ... etc
import { PathSpec } from '../../types.js'
import { Workspace } from './workspace.js'

describe('Workspace.dispatch', () => {
  it('takes PathSpec and returns [value, IOResult]', async () => {
    const ws = new Workspace({ '/data': new RAMResource() }, { mode: MountMode.WRITE })
    await ws.dispatch('write', PathSpec.fromStrPath('/data/x'), { /* kwargs unused */ })
    const [data, io] = await ws.dispatch('read', PathSpec.fromStrPath('/data/x'))
    expect(data).toBeInstanceOf(Uint8Array)
    expect(io).toBeDefined()
  })

  it('returns cached on second read (LAZY consistency)', async () => { /* ... */ })

  it('passes kwargs to op fn', async () => {
    // register a custom op that captures the last arg
    // ws.dispatch('myop', spec, { hello: 'world' })
    // assert op fn saw { hello: 'world' } as last positional arg
  })
})
```

**Step 4: Update WorkspaceFS callers**

`WorkspaceFS.readFile/writeFile/etc.` already use `ops.call` directly, not `dispatch`. No change needed there.

**Step 5: Run + commit**

```bash
cd typescript/packages/core && pnpm test --run
git add typescript/packages/core/src/workspace/{workspace.ts,dispatch.test.ts}
git commit -m "feat(core): align Workspace.dispatch with Python (PathSpec + tuple return + kwargs)"
```

______________________________________________________________________

### Task 2: Per-call `sessionId`/`agentId` overrides on `Workspace.execute`

**Files:**

- Modify: `typescript/packages/core/src/workspace/workspace.ts` (the `execute` overloads at line ~240)
- Modify: `typescript/packages/core/src/workspace/execute.test.ts` (add cases)

**Step 1: Extend options**

```ts
interface ExecuteOptions {
  provision?: boolean
  sessionId?: string
  agentId?: string
}

async execute(command: string, stdin?: ByteSource | null): Promise<ExecuteResult>
async execute(command: string, stdin: ByteSource | null, options: { provision: true } & Omit<ExecuteOptions, 'provision'>): Promise<ProvisionResult>
async execute(command: string, stdin?: ByteSource | null, options?: ExecuteOptions): Promise<ExecuteResult | ProvisionResult>
```

**Step 2: Use overrides in body**

```ts
const sessionId = options.sessionId ?? this.sessionManager.defaultId
const session = this.sessionManager.get(sessionId)
const agentId = options.agentId ?? this.agentId
// ... pass agentId to deps
```

**Step 3: Test**

```ts
it('honors per-call sessionId override', async () => {
  const ws = new Workspace({ '/data': new RAMResource() }, { mode: MountMode.WRITE })
  ws.createSession('alt')
  await ws.execute('cd /data', null, { sessionId: 'alt' })
  // assert default session.cwd unchanged, alt session.cwd = '/data'
})
```

**Step 4: Commit**

______________________________________________________________________

### Task 3: Public `Workspace.applyIo(io)`

**Files:**

- Modify: `typescript/packages/core/src/workspace/workspace.ts` (add public method)
- Test: `typescript/packages/core/src/workspace/applyIo.test.ts` (new)

**Step 1: Method**

```ts
async applyIo(io: IOResult): Promise<void> {
  await applyIo(this.cache, io)
}
```

**Step 2: Test**

```ts
it('writes io.cache entries into the workspace cache', async () => {
  const ws = new Workspace({ '/data': new RAMResource() }, { mode: MountMode.WRITE })
  const io = new IOResult({
    cache: ['/data/x'],
    reads: { '/data/x': new TextEncoder().encode('hello') },
  })
  await ws.applyIo(io)
  // dispatch a read; should hit cache
})
```

**Step 3: Commit**

______________________________________________________________________

### Task 4: Public `Workspace.jobTable`

**Files:**

- Modify: `typescript/packages/core/src/workspace/workspace.ts` (line ~70: drop `private`)
- Test: extend `workspace.test.ts`

**Step 1:** `readonly jobTable = new JobTable()` (drop `private`)

**Step 2: Test**

```ts
it('exposes jobTable for inspection', () => {
  const ws = new Workspace({}, {})
  expect(ws.jobTable.runningJobs()).toEqual([])
})
```

**Step 3: Commit**

______________________________________________________________________

## Phase 2 — Constructor option parity

### Task 5: `consistency` option (already touched in Task 1; ensure documented + tested)

**Files:** confirmed in Task 1.

**Step 1: Test**

```ts
it('defaults consistency to LAZY', () => {
  const ws = new Workspace({}, {})
  expect(ws.registry.getConsistency()).toBe(ConsistencyPolicy.LAZY)
})

it('respects explicit consistency=ALWAYS', () => {
  const ws = new Workspace({}, { consistency: ConsistencyPolicy.ALWAYS })
  expect(ws.registry.getConsistency()).toBe(ConsistencyPolicy.ALWAYS)
})
```

**Step 2: Commit**

______________________________________________________________________

### Task 6: `history` constructor option + `Workspace.history` public

**Files:**

- New: `typescript/packages/core/src/workspace/execution_history.ts`
- Modify: `typescript/packages/core/src/workspace/workspace.ts`
- Test: `typescript/packages/core/src/workspace/execution_history.test.ts` (new)

**Step 1: Build `ExecutionHistory` class**

```ts
import type { ExecutionRecord } from './types.js'

export interface ExecutionHistoryOptions {
  maxEntries?: number | null
  onPersist?: (record: ExecutionRecord) => void | Promise<void>
}

export class ExecutionHistory {
  private readonly entries: ExecutionRecord[] = []
  private readonly maxEntries: number | null
  private readonly onPersist: ((r: ExecutionRecord) => void | Promise<void>) | null

  constructor(options: ExecutionHistoryOptions = {}) {
    this.maxEntries = options.maxEntries ?? 100
    this.onPersist = options.onPersist ?? null
  }

  async append(record: ExecutionRecord): Promise<void> {
    this.entries.push(record)
    if (this.maxEntries !== null && this.entries.length > this.maxEntries) {
      this.entries.shift()
    }
    if (this.onPersist !== null) await this.onPersist(record)
  }

  get records(): readonly ExecutionRecord[] { return this.entries }
  clear(): void { this.entries.length = 0 }
}
```

**Step 2: Wire into Workspace**

Constructor:

```ts
this.history = options.history === null
  ? null
  : new ExecutionHistory({
      maxEntries: options.history ?? 100,
      onPersist: options.historyOnPersist,
    })
```

Field:

```ts
readonly history: ExecutionHistory | null
```

In `execute()` after the run completes:

```ts
if (this.history !== null && options.provision !== true) {
  await this.history.append(new ExecutionRecord({
    command, stdout: stdoutBytes, stderr: stderrBytes,
    exitCode: io.exitCode, agent: agentId, sessionId, /* ... */
  }))
}
```

**Step 3: Tests**

```ts
it('records each execute() into history', async () => {
  const ws = new Workspace({}, {})
  await ws.execute('echo a')
  await ws.execute('echo b')
  expect(ws.history!.records.length).toBe(2)
})

it('disables history when history: null', async () => {
  const ws = new Workspace({}, { history: null })
  await ws.execute('echo a')
  expect(ws.history).toBeNull()
})

it('caps at maxEntries', async () => {
  const ws = new Workspace({}, { history: 2 })
  await ws.execute('echo 1')
  await ws.execute('echo 2')
  await ws.execute('echo 3')
  expect(ws.history!.records.length).toBe(2)
})

it('calls onPersist callback', async () => {
  const seen: ExecutionRecord[] = []
  const ws = new Workspace({}, { historyOnPersist: (r) => { seen.push(r) } })
  await ws.execute('echo x')
  expect(seen.length).toBe(1)
})
```

**Step 4: Commit**

______________________________________________________________________

### Task 7: `observerResource` constructor option (already exists — verify only)

**Step 1: Read existing code**, confirm `WorkspaceOptions.observerResource` works.

**Step 2: Test**

```ts
it('uses provided observerResource when given', () => {
  const obs = new RAMResource()
  const ws = new Workspace({}, { observerResource: obs })
  expect(ws.observer.resource).toBe(obs)
})
```

**Step 3: Commit if test reveals nothing missing.**

______________________________________________________________________

## Phase 3 — IOResult + OpsRegistry

### Task 8: `IOResult.stdoutStr/stderrStr` accept `errors` option

**Files:**

- Modify: `typescript/packages/core/src/io/types.ts` (find `stdoutStr` / `stderrStr` methods)
- Test: `typescript/packages/core/src/io/types.test.ts` (or wherever IOResult is tested)

**Step 1: Signature**

```ts
async stdoutStr(options: { errors?: 'replace' | 'fatal' | 'ignore' } = { errors: 'replace' }): Promise<string> {
  const fatal = options.errors === 'fatal'
  const ignore = options.errors === 'ignore'
  // 'ignore' → strip invalid bytes via try/catch
  const bytes = await this.materializeStdout()
  if (ignore) return new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/\uFFFD/g, '')
  return new TextDecoder('utf-8', { fatal }).decode(bytes)
}
```

Same for `stderrStr`.

**Step 2: Test**

```ts
it('decodes invalid utf-8 with replacement chars by default', async () => {
  const io = new IOResult({ stdout: new Uint8Array([0xff, 0xfe]) })
  expect(await io.stdoutStr()).toBe('\uFFFD\uFFFD')
})

it('throws when errors=fatal on invalid utf-8', async () => {
  const io = new IOResult({ stdout: new Uint8Array([0xff]) })
  await expect(io.stdoutStr({ errors: 'fatal' })).rejects.toThrow()
})

it('strips replacement chars when errors=ignore', async () => {
  const io = new IOResult({ stdout: new TextEncoder().encode('hi'), /* + bad bytes appended */ })
  expect(await io.stdoutStr({ errors: 'ignore' })).toBe('hi')
})
```

**Step 3: Commit**

______________________________________________________________________

### Task 9: `OpsRegistry.call` accepts kwargs (passes as last positional arg)

**Files:**

- Modify: `typescript/packages/core/src/ops/registry.ts`
- Modify: `typescript/packages/core/src/workspace/workspace.ts` (dispatch call site)
- Modify: `typescript/packages/core/src/workspace/fs.ts` (no change — none use kwargs)
- Modify: `typescript/packages/core/src/workspace/mount/mount.ts` (`Mount.executeOp` already takes args)
- Test: `typescript/packages/core/src/ops/registry.test.ts` (extend)

**Step 1: Decision** — Python's `**kwargs` becomes a final positional dict in TS:

```ts
// op fn:
fn: (accessor, path, ...args) => {
  const last = args[args.length - 1]
  const kwargs = (typeof last === 'object' && last !== null && !ArrayBuffer.isView(last)) ? last : {}
  // ... use kwargs.index, kwargs.foo, etc.
}
```

(Convention: ops that accept kwargs document it; ops that take Uint8Array as last positional won't be confused since `ArrayBuffer.isView` filters.)

**Step 2: Update `OpsRegistry.call`**

```ts
async call(
  name: string,
  resourceKind: string,
  accessor: Resource,
  path: PathSpec,
  args: readonly unknown[] = [],
  filetype: string | null = null,
  kwargs?: Record<string, unknown>,
): Promise<unknown> {
  // ... existing cascade
  const finalArgs = kwargs !== undefined && Object.keys(kwargs).length > 0
    ? [...args, kwargs]
    : args
  for (const fn of levels) {
    const result = await fn(accessor, path, ...finalArgs)
    if (result !== null && result !== undefined) return result
  }
  return null
}
```

**Step 3: Test**

```ts
it('appends kwargs as the last positional arg when provided', async () => {
  let seen: unknown
  const reg = new OpsRegistry()
  reg.register({
    name: 'capture', resource: 'ram', filetype: null, write: false,
    fn: (_a, _p, ...args) => { seen = args[args.length - 1]; return 'ok' },
  })
  await reg.call('capture', 'ram', stubAcc, stubPath, [], null, { index: 'idx' })
  expect(seen).toEqual({ index: 'idx' })
})

it('does not append empty kwargs', async () => {
  let argsLen = -1
  const reg = new OpsRegistry()
  reg.register({
    name: 'count', resource: 'ram', filetype: null, write: false,
    fn: (_a, _p, ...args) => { argsLen = args.length; return 'ok' },
  })
  await reg.call('count', 'ram', stubAcc, stubPath, [], null, {})
  expect(argsLen).toBe(0)
})
```

**Step 4: Commit**

______________________________________________________________________

## Phase 4 — Examples + verification

### Task 10: Update examples to demonstrate new APIs

**Files:**

- Modify (sparse): `examples/typescript/ram/ram.ts` — add a `ws.dispatch(...)` example or `ws.history` use to show the parity.
- Modify: `examples/typescript/ram/ram.ts` — show per-call `sessionId`.

**Step 1:** Add to `ram.ts` after the existing run:

```ts
// Per-call session override
ws.createSession('alt')
await ws.execute('cd /data && pwd', null, { sessionId: 'alt' })

// History
console.log(`history: ${ws.history!.records.length} commands recorded`)

// Direct dispatch (PathSpec + tuple return)
const [bytes, io] = await ws.dispatch('read', PathSpec.fromStrPath('/data/hello.txt'))
console.log(`read ${(bytes as Uint8Array).byteLength} bytes (cached: ${Object.keys(io.reads).length > 0})`)
```

**Step 2: Run all examples to verify**

```bash
cd examples/typescript
pnpm tsx ram/ram.ts && pnpm tsx ram/ram_filetypes.ts && pnpm tsx ram/ram_parquet.ts && \
  pnpm tsx ram/ram_rare.ts && pnpm tsx ram/ram_vfs.ts && pnpm tsx disk/disk.ts
```

**Step 3: Browser smoke**

```bash
cd examples/typescript/browser && pnpm tsx scripts/smoke.ts
```

**Step 4: Commit**

______________________________________________________________________

### Task 11: Final verification

**Step 1: Build all packages**

```bash
cd typescript && pnpm -r build
```

**Step 2: Typecheck**

```bash
pnpm -r typecheck
```

**Step 3: All tests**

```bash
pnpm -r test
```

Expected: ~150+ tests in core (added), still 38 files in node, 38 in browser.

**Step 4: Re-run audit checklist**

Confirm every item from the original divergence list is now addressed (except FUSE/native, which are explicitly deferred).

**Step 5: Final commit + summary message to user.**

______________________________________________________________________

## Out of scope (deferred)

- **FUSE / native execution.** Node-only; requires `macFUSE`/`libfuse` integration and a separate spawn-based executor. Not a one-session task.
- **Redis cache backend.** `@struktoai/mirage-core` doesn't have a Redis client; would need `@struktoai/mirage-redis-cache` package. Defer to follow-up.
- **`Workspace.__enter__/__exit__`.** Not idiomatic TS — `await ws.close()` covers it.
- **`Workspace.__deepcopy__`.** TS already has `ws.copy()`; equivalent.

______________________________________________________________________

## Notes on PathSpec everywhere

User asked: "every ops and commands should have pathspec as the input, why path is string?"

**Already PathSpec:**

- Op functions: `(accessor: Resource, path: PathSpec, ...args)` ✓
- Command functions: `ctx.paths: PathSpec[]` ✓
- Mount-level `register(cmd)` paths flow as PathSpec ✓
- Resource interface methods: `streamPath/readFile/writeFile/...(p: PathSpec, ...)` ✓

**Currently `string` (and intentionally so — high-level convenience):**

- `Workspace.fs.readFile(path: string)` — user-facing helper, mirrors Python `WorkspaceFS` pattern
- `Workspace.stat(path: string)` / `readdir(path: string)` — match Python
- `Workspace.fs.*` overall — string-based for ergonomics

**Currently `string` (will switch to PathSpec in Task 1):**

- `Workspace.dispatch(opName, path, args)` — Python takes `PathSpec`; TS will too.

So after Task 1: every internal API takes `PathSpec`. Only the user-facing helpers (`ws.fs.*`, `ws.stat/readdir`) accept string for ergonomics, matching Python exactly.
