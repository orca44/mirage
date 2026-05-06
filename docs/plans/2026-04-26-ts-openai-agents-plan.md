# TypeScript OpenAI Agents Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement `@struktoai/mirage-agents` (TypeScript) with `@struktoai/mirage-agents/openai` subpath that exposes `MirageEditor`, `MirageShell`, `MIRAGE_SYSTEM_PROMPT`, and `buildSystemPrompt` for the OpenAI Agents SDK. Ship three examples that mirror the Python `examples/python/agents/openai_agents/` set.

**Architecture:** Single `@struktoai/mirage-agents` workspace package at `typescript/packages/agents/` with a `src/openai/` subdirectory and `src/prompt.ts` shared module. `MirageShell implements Shell` from `@openai/agents` (returns structured `ShellResult`); `MirageEditor implements Editor` (uses the SDK's `applyDiff` helper). Vitest unit tests run against a real `RAMResource`-backed `Workspace`. Examples use `Agent` + `Runner.run` with `shellTool({ shell })` and `applyPatchTool({ editor })`.

**Tech Stack:** TypeScript 6 (`strictTypeChecked`, `verbatimModuleSyntax`, `exactOptionalPropertyTypes`), Vitest 3, `tsup` build, pnpm workspaces. Peer deps: `@openai/agents` ^0.8.0, `zod` ^4.0.0.

**Reference docs:**

- Design: [`docs/plans/2026-04-26-ts-openai-agents-design.md`](2026-04-26-ts-openai-agents-design.md)
- Python source to mirror:
  - `python/mirage/agents/openai_agents/{editor,shell,prompt}.py`
  - `python/mirage/agents/langchain/prompt.py` (canonical prompt module — TS puts it at `src/prompt.ts`)
  - `examples/python/agents/openai_agents/{ram_agent,sandbox_agent}.py`
- TS Workspace API (used by the adapters):
  - `Workspace.fs.{readFile,writeFile,mkdir,unlink,exists,readFileText}` (`typescript/packages/core/src/workspace/fs.ts`)
  - `Workspace.execute(cmd)` → `IOResult` with `stdoutStr()`, `stderrStr()`, `exitCode` (`typescript/packages/core/src/io/types.ts`)
  - `Workspace.filePrompt` getter (`typescript/packages/core/src/workspace/workspace.ts:250`)
- OpenAI Agents JS types (pinned 0.8.5):
  - `Editor` (createFile/updateFile/deleteFile each take `Extract<ApplyPatchOperation, { type: 'create_file' | ... }>`, return `Promise<ApplyPatchResult | void>`)
  - `Shell` (`run(action: ShellAction): Promise<ShellResult>` where `ShellAction = { commands: string[]; timeoutMs?; maxOutputLength? }`)
  - `applyDiff(input: string, diff: string, mode?: 'default' | 'create'): string` from `@openai/agents`

______________________________________________________________________

## Task 1: Bootstrap `@struktoai/mirage-agents` package skeleton

**Files:**

- Create: `typescript/packages/agents/package.json`
- Create: `typescript/packages/agents/tsconfig.json`
- Create: `typescript/packages/agents/tsup.config.ts`
- Create: `typescript/packages/agents/src/index.ts`

**Step 1: Create `package.json`**

```json
{
  "name": "@struktoai/mirage-agents",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./openai": {
      "types": "./dist/openai/index.d.ts",
      "import": "./dist/openai/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@struktoai/mirage-core": "workspace:*"
  },
  "peerDependencies": {
    "@openai/agents": "^0.8.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@openai/agents": "^0.8.0",
    "tsup": "^8.5.0",
    "typescript": "^6.0.0",
    "vitest": "^3.0.0",
    "zod": "^4.0.0"
  }
}
```

**Step 2: Create `tsconfig.json` (mirrors core/tsconfig.json)**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

**Step 3: Create `tsup.config.ts`** — needs **two** entries to emit both `dist/index.js` and `dist/openai/index.js`

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/openai/index.ts'],
  format: ['esm'],
  dts: {
    compilerOptions: {
      ignoreDeprecations: '6.0',
    },
  },
  sourcemap: true,
  clean: true,
  target: 'es2022',
})
```

**Step 4: Create `src/index.ts`** — top-level placeholder; openai re-exports happen via the subpath, not the root entry

```ts
export {} // intentionally empty; integrations are accessed via subpath exports (e.g. '@struktoai/mirage-agents/openai')
```

**Step 5: Install deps and verify the workspace picks the package up**

Run: `cd typescript && pnpm install`
Expected: `@struktoai/mirage-agents` appears in `pnpm list --depth -1` output (no errors). The package is discovered via `pnpm-workspace.yaml`'s `packages/*` glob — no edit needed.

**Step 6: Commit**

```bash
git add typescript/packages/agents
git commit -m "feat(agents): bootstrap @struktoai/mirage-agents package"
```

______________________________________________________________________

## Task 2: Implement prompt module with tests

**Files:**

- Create: `typescript/packages/agents/src/prompt.ts`
- Create: `typescript/packages/agents/src/prompt.test.ts`

**Step 1: Write the failing tests**

`src/prompt.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { OpsRegistry } from '@struktoai/mirage-core'
import { RAMResource, MountMode, Workspace } from '@struktoai/mirage-core'
import { MIRAGE_SYSTEM_PROMPT, buildSystemPrompt } from './prompt.ts'

function mkWs(): Workspace {
  const ram = new RAMResource()
  const ops = new OpsRegistry()
  for (const op of ram.ops()) ops.register(op)
  return new Workspace({ '/': ram }, { mode: MountMode.WRITE, ops })
}

describe('buildSystemPrompt', () => {
  it('returns base prompt when no options provided', () => {
    expect(buildSystemPrompt()).toBe(MIRAGE_SYSTEM_PROMPT)
  })

  it('appends extraInstructions', () => {
    const out = buildSystemPrompt({ extraInstructions: 'be terse.' })
    expect(out).toContain(MIRAGE_SYSTEM_PROMPT)
    expect(out.endsWith('be terse.')).toBe(true)
  })

  it('formats mountInfo entries', () => {
    const out = buildSystemPrompt({
      mountInfo: { '/': 'In-memory FS', '/s3': 'AWS S3 bucket' },
    })
    expect(out).toContain('Mounted data sources:')
    expect(out).toContain('- / — In-memory FS')
    expect(out).toContain('- /s3 — AWS S3 bucket')
  })

  it('uses workspace.filePrompt when workspace given', () => {
    const ws = mkWs()
    const out = buildSystemPrompt({ workspace: ws })
    expect(out).toContain('Mounted data sources:\n' + ws.filePrompt)
  })

  it('workspace takes precedence over mountInfo', () => {
    const ws = mkWs()
    const out = buildSystemPrompt({
      workspace: ws,
      mountInfo: { '/foo': 'should not appear' },
    })
    expect(out).not.toContain('/foo')
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `cd typescript/packages/agents && pnpm test`
Expected: FAIL — module `./prompt.ts` doesn't exist yet.

**Step 3: Implement `src/prompt.ts`** — port from `python/mirage/agents/langchain/prompt.py`

```ts
import type { Workspace } from '@struktoai/mirage-core'

export const MIRAGE_SYSTEM_PROMPT = `Your filesystem is powered by Mirage — a virtual filesystem that mounts cloud storage, local files, and in-memory data as a unified file tree.

All file paths live under /mirage/. Do not access paths outside this folder.

Capabilities beyond standard filesystem:
- cat on .parquet, .orc, .feather files returns a formatted table
- head -n 5 on data files returns the first 5 rows/seconds
- grep works natively on CSV, JSON, Parquet — not just text
- Pipes work: cat data.parquet | grep error | sort | uniq | wc -l
- head, tail, cut, wc, sort, uniq, tee, xargs are all available

You can write Python code and execute it. The workspace is pre-configured with your data sources mounted at their respective paths.

Use the execute tool for complex operations. Use read_file/write_file/edit_file for simple file operations.
`

export interface BuildSystemPromptOptions {
  workspace?: Workspace
  mountInfo?: Record<string, string>
  extraInstructions?: string
}

export function buildSystemPrompt(opts: BuildSystemPromptOptions = {}): string {
  const parts: string[] = [MIRAGE_SYSTEM_PROMPT]
  if (opts.workspace !== undefined) {
    parts.push('Mounted data sources:\n' + opts.workspace.filePrompt)
  } else if (opts.mountInfo !== undefined) {
    parts.push('\nMounted data sources:')
    for (const [prefix, description] of Object.entries(opts.mountInfo)) {
      parts.push(`- ${prefix} — ${description}`)
    }
    parts.push('')
  }
  if (opts.extraInstructions !== undefined && opts.extraInstructions.length > 0) {
    parts.push(opts.extraInstructions)
  }
  return parts.join('\n')
}
```

**Note on prompt text:** the constant must be **byte-identical** to Python's `MIRAGE_SYSTEM_PROMPT`. Diff it against `python/mirage/agents/langchain/prompt.py:1-19` after pasting.

**Step 4: Run tests to verify they pass**

Run: `cd typescript/packages/agents && pnpm test`
Expected: 5 tests PASS in `prompt.test.ts`.

**Step 5: Commit**

```bash
git add typescript/packages/agents/src/prompt.ts typescript/packages/agents/src/prompt.test.ts
git commit -m "feat(agents): add MIRAGE_SYSTEM_PROMPT and buildSystemPrompt"
```

______________________________________________________________________

## Task 3: Implement `MirageShell` with tests

**Files:**

- Create: `typescript/packages/agents/src/openai/shell.ts`
- Create: `typescript/packages/agents/src/openai/shell.test.ts`

**Step 1: Write the failing tests**

`src/openai/shell.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { OpsRegistry, RAMResource, MountMode, Workspace } from '@struktoai/mirage-core'
import { MirageShell } from './shell.ts'

function mkWs(): Workspace {
  const ram = new RAMResource()
  const ops = new OpsRegistry()
  for (const op of ram.ops()) ops.register(op)
  return new Workspace({ '/': ram }, { mode: MountMode.WRITE, ops })
}

describe('MirageShell', () => {
  it('runs a single command and returns structured output', async () => {
    const ws = mkWs()
    const shell = new MirageShell(ws)
    const result = await shell.run({ commands: ["echo hello"] })

    expect(result.output).toHaveLength(1)
    const first = result.output[0]!
    expect(first.stdout).toBe('hello\n')
    expect(first.stderr).toBe('')
    expect(first.outcome).toEqual({ type: 'exit', exitCode: 0 })
  })

  it('runs multiple commands in order, one entry each', async () => {
    const ws = mkWs()
    const shell = new MirageShell(ws)
    const result = await shell.run({
      commands: ['echo first', 'echo second'],
    })

    expect(result.output.map((o) => o.stdout)).toEqual(['first\n', 'second\n'])
  })

  it('captures stderr and exitCode for failing commands', async () => {
    const ws = mkWs()
    await ws.fs.writeFile('/exists.txt', 'x')
    const shell = new MirageShell(ws)
    const result = await shell.run({ commands: ['cat /missing-file.txt'] })

    const out = result.output[0]!
    expect(out.stderr.length).toBeGreaterThan(0)
    expect(out.outcome.type).toBe('exit')
    if (out.outcome.type === 'exit') {
      expect(out.outcome.exitCode).not.toBe(0)
    }
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `cd typescript/packages/agents && pnpm test src/openai/shell.test.ts`
Expected: FAIL — `./shell.ts` doesn't exist.

**Step 3: Implement `src/openai/shell.ts`**

```ts
import type { Workspace } from '@struktoai/mirage-core'
import type { Shell, ShellAction, ShellResult, ShellOutputResult } from '@openai/agents'

export class MirageShell implements Shell {
  constructor(private readonly ws: Workspace) {}

  async run(action: ShellAction): Promise<ShellResult> {
    const output: ShellOutputResult[] = []
    for (const cmd of action.commands) {
      const io = await this.ws.execute(cmd)
      const stdout = await io.stdoutStr()
      const stderr = await io.stderrStr()
      output.push({
        stdout,
        stderr,
        outcome: { type: 'exit', exitCode: io.exitCode },
      })
    }
    return { output }
  }
}
```

**Note on Python parity:** Python's `MirageShellExecutor.__call__` joins stdout+stderr into a single string because the Python SDK expects `Promise<str>`. The JS SDK expects structured `ShellResult` — so we preserve `stdout` and `stderr` separately per command. This is a *signature-driven* difference, not a behavioral one.

**Note on `ws.execute` return type:** `Workspace.execute` may return `ExecuteResult` (which extends `IOResult`) or `ProvisionResult` depending on overload. For our purposes the `IOResult` shape (`stdoutStr/stderrStr/exitCode`) is what we touch. If the type system complains, narrow with a cast: `(io as IOResult).stdoutStr()`.

**Step 4: Run tests to verify they pass**

Run: `cd typescript/packages/agents && pnpm test src/openai/shell.test.ts`
Expected: 3 tests PASS.

**Step 5: Commit**

```bash
git add typescript/packages/agents/src/openai/shell.ts typescript/packages/agents/src/openai/shell.test.ts
git commit -m "feat(agents/openai): add MirageShell"
```

______________________________________________________________________

## Task 4: Implement `MirageEditor` with tests

**Files:**

- Create: `typescript/packages/agents/src/openai/editor.ts`
- Create: `typescript/packages/agents/src/openai/editor.test.ts`

**Step 1: Write the failing tests**

`src/openai/editor.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { OpsRegistry, RAMResource, MountMode, Workspace } from '@struktoai/mirage-core'
import { MirageEditor } from './editor.ts'

function mkWs(): Workspace {
  const ram = new RAMResource()
  const ops = new OpsRegistry()
  for (const op of ram.ops()) ops.register(op)
  return new Workspace({ '/': ram }, { mode: MountMode.WRITE, ops })
}

describe('MirageEditor', () => {
  it('createFile writes content from a create-mode diff', async () => {
    const ws = mkWs()
    const editor = new MirageEditor(ws)

    const result = await editor.createFile({
      type: 'create_file',
      path: '/hello.txt',
      diff: '+hello world\n',
    })

    expect(result).toEqual({ status: 'completed' })
    expect(await ws.fs.readFileText('/hello.txt')).toBe('hello world\n')
  })

  it('createFile auto-mkdirs missing parent directories', async () => {
    const ws = mkWs()
    const editor = new MirageEditor(ws)

    const result = await editor.createFile({
      type: 'create_file',
      path: '/data/sub/file.txt',
      diff: '+content\n',
    })

    expect(result).toEqual({ status: 'completed' })
    expect(await ws.fs.readFileText('/data/sub/file.txt')).toBe('content\n')
  })

  it('createFile is idempotent on existing parent', async () => {
    const ws = mkWs()
    await ws.fs.mkdir('/data')
    const editor = new MirageEditor(ws)

    const result = await editor.createFile({
      type: 'create_file',
      path: '/data/file.txt',
      diff: '+hi\n',
    })

    expect(result).toEqual({ status: 'completed' })
  })

  it('updateFile applies a diff to existing content', async () => {
    const ws = mkWs()
    await ws.fs.writeFile('/notes.txt', 'one\ntwo\nthree\n')
    const editor = new MirageEditor(ws)

    const diff = '@@\n one\n-two\n+TWO\n three\n'
    const result = await editor.updateFile({
      type: 'update_file',
      path: '/notes.txt',
      diff,
    })

    expect(result).toEqual({ status: 'completed' })
    expect(await ws.fs.readFileText('/notes.txt')).toBe('one\nTWO\nthree\n')
  })

  it('updateFile returns failed for missing path', async () => {
    const ws = mkWs()
    const editor = new MirageEditor(ws)

    const result = await editor.updateFile({
      type: 'update_file',
      path: '/nope.txt',
      diff: '@@\n+ x\n',
    })

    expect(result).toEqual({
      status: 'failed',
      output: 'File not found: /nope.txt',
    })
  })

  it('deleteFile removes the file', async () => {
    const ws = mkWs()
    await ws.fs.writeFile('/gone.txt', 'bye')
    const editor = new MirageEditor(ws)

    const result = await editor.deleteFile({
      type: 'delete_file',
      path: '/gone.txt',
    })

    expect(result).toEqual({ status: 'completed' })
    expect(await ws.fs.exists('/gone.txt')).toBe(false)
  })

  it('deleteFile returns failed for missing path', async () => {
    const ws = mkWs()
    const editor = new MirageEditor(ws)

    const result = await editor.deleteFile({
      type: 'delete_file',
      path: '/missing.txt',
    })

    expect(result).toEqual({
      status: 'failed',
      output: 'File not found: /missing.txt',
    })
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `cd typescript/packages/agents && pnpm test src/openai/editor.test.ts`
Expected: FAIL — `./editor.ts` doesn't exist.

**Step 3: Implement `src/openai/editor.ts`** — port from `python/mirage/agents/openai_agents/editor.py`

```ts
import type { Workspace } from '@struktoai/mirage-core'
import { applyDiff } from '@openai/agents'
import type { ApplyPatchOperation, ApplyPatchResult, Editor } from '@openai/agents'

function parentOf(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  const idx = trimmed.lastIndexOf('/')
  if (idx <= 0) return '/'
  return trimmed.slice(0, idx)
}

async function ensureParent(ws: Workspace, path: string): Promise<void> {
  const parent = parentOf(path)
  if (parent === '/' || parent === '') return
  if (await ws.fs.exists(parent)) return
  try {
    await ws.fs.mkdir(parent)
  } catch {
    // Race on parent creation — if it now exists, fine; otherwise rethrow.
    if (!(await ws.fs.exists(parent))) throw new Error(`mkdir failed: ${parent}`)
  }
}

export class MirageEditor implements Editor {
  constructor(private readonly ws: Workspace) {}

  async createFile(
    op: Extract<ApplyPatchOperation, { type: 'create_file' }>,
  ): Promise<ApplyPatchResult> {
    await ensureParent(this.ws, op.path)
    const content = applyDiff('', op.diff, 'create')
    await this.ws.fs.writeFile(op.path, content)
    return { status: 'completed' }
  }

  async updateFile(
    op: Extract<ApplyPatchOperation, { type: 'update_file' }>,
  ): Promise<ApplyPatchResult> {
    if (!(await this.ws.fs.exists(op.path))) {
      return { status: 'failed', output: `File not found: ${op.path}` }
    }
    const current = await this.ws.fs.readFileText(op.path)
    const next = applyDiff(current, op.diff)
    await this.ws.fs.writeFile(op.path, next)
    return { status: 'completed' }
  }

  async deleteFile(
    op: Extract<ApplyPatchOperation, { type: 'delete_file' }>,
  ): Promise<ApplyPatchResult> {
    if (!(await this.ws.fs.exists(op.path))) {
      return { status: 'failed', output: `File not found: ${op.path}` }
    }
    await this.ws.fs.unlink(op.path)
    return { status: 'completed' }
  }
}
```

**Note on parity:** Python catches `FileExistsError`/`ValueError` on the mkdir; TS `WorkspaceFS.mkdir` throws on existing dirs, so we use the `exists` pre-check. Same observable behavior. Python catches `FileNotFoundError` on read/unlink; TS uses `exists` pre-check for the same reason.

**Step 4: Run tests to verify they pass**

Run: `cd typescript/packages/agents && pnpm test src/openai/editor.test.ts`
Expected: 7 tests PASS. If `applyDiff` rejects a hand-written test diff, simplify the diff to match V4A format exactly (see `python/mirage/agents/openai_agents/editor.py` and the SDK's `applyDiff` doc) — this may take one iteration of the update-diff string.

**Step 5: Commit**

```bash
git add typescript/packages/agents/src/openai/editor.ts typescript/packages/agents/src/openai/editor.test.ts
git commit -m "feat(agents/openai): add MirageEditor"
```

______________________________________________________________________

## Task 5: Wire `src/openai/index.ts` public exports

**Files:**

- Create: `typescript/packages/agents/src/openai/index.ts`

**Step 1: Write the file**

```ts
export { MirageEditor } from './editor.ts'
export { MirageShell } from './shell.ts'
export { MIRAGE_SYSTEM_PROMPT, buildSystemPrompt } from '../prompt.ts'
export type { BuildSystemPromptOptions } from '../prompt.ts'
```

**Step 2: Verify build emits both entry points**

Run: `cd typescript/packages/agents && pnpm build`
Expected: `dist/index.{js,d.ts}` and `dist/openai/index.{js,d.ts}` exist. No TS errors.

```bash
ls typescript/packages/agents/dist
ls typescript/packages/agents/dist/openai
```

**Step 3: Verify typecheck**

Run: `cd typescript/packages/agents && pnpm typecheck`
Expected: 0 errors.

**Step 4: Verify tests still pass**

Run: `cd typescript/packages/agents && pnpm test`
Expected: 15 tests PASS (5 prompt + 3 shell + 7 editor).

**Step 5: Commit**

```bash
git add typescript/packages/agents/src/openai/index.ts
git commit -m "feat(agents/openai): wire public exports"
```

______________________________________________________________________

## Task 6: Add agent example dependencies

**Files:**

- Modify: `examples/typescript/package.json`

**Step 1: Add `@struktoai/mirage-agents`, `@openai/agents`, `zod` to deps**

In `examples/typescript/package.json`, add to `dependencies`:

```json
{
  "@struktoai/mirage-agents": "workspace:*",
  "@openai/agents": "^0.8.0",
  "zod": "^4.0.0"
}
```

(Place alphabetically among existing deps. Keep `dotenv` in `devDependencies` as it already is.)

**Step 2: Install**

Run: `cd typescript && pnpm install`
Expected: `@openai/agents` and `zod` resolved into `examples/typescript/node_modules/`.

**Step 3: Commit**

```bash
git add examples/typescript/package.json typescript/pnpm-lock.yaml
git commit -m "chore(examples): add @openai/agents deps for examples/typescript/agents/"
```

______________________________________________________________________

## Task 7: Write `ram_agent.ts` example

**Files:**

- Create: `examples/typescript/agents/openai/ram_agent.ts`

**Step 1: Write the example** — mirrors `examples/python/agents/openai_agents/ram_agent.py`

```ts
import 'dotenv/config'
import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  MountMode,
  OpsRegistry,
  RAMResource,
  Workspace,
} from '@struktoai/mirage-core'
import { Agent, Runner, applyPatchTool, shellTool } from '@openai/agents'
import {
  MirageEditor,
  MirageShell,
  buildSystemPrompt,
} from '@struktoai/mirage-agents/openai'

loadEnv({
  path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../../.env.development'),
})

const ram = new RAMResource()
const ops = new OpsRegistry()
for (const op of ram.ops()) ops.register(op)
const ws = new Workspace({ '/': ram }, { mode: MountMode.WRITE, ops })

const instructions = buildSystemPrompt({
  mountInfo: { '/': 'In-memory filesystem (read/write)' },
  extraInstructions:
    'All file paths start from /. ' +
    'For example: /hello.txt, /data/numbers.csv. ' +
    'Use the shell tool to run commands like: ' +
    "echo 'content' > /hello.txt, mkdir /data, " +
    'cat /hello.txt, ls /.',
})

const agent = new Agent({
  name: 'Mirage RAM Agent',
  model: 'gpt-5.4-mini',
  instructions,
  tools: [
    shellTool({ shell: new MirageShell(ws) }),
    applyPatchTool({ editor: new MirageEditor(ws) }),
  ],
})

const task =
  "Create a file /hello.txt with the content 'Hello from Mirage!'. " +
  'Then create a directory /data and write a CSV file /data/numbers.csv ' +
  'with columns: name, value. Add 3 rows of sample data. ' +
  'Finally, list all files and cat the CSV.'

const result = await Runner.run(agent, task)
console.log(result.finalOutput)

console.log('\n--- Verifying files in workspace ---')
const findAll = await ws.execute('find / -type f')
const findOut = await findAll.stdoutStr()
console.log(`find / -type f:\n${findOut}`)

for (const path of findOut.trim().split('\n').filter(Boolean)) {
  const cat = await ws.execute(`cat ${path}`)
  console.log(`cat ${path}:\n${await cat.stdoutStr()}`)
}
```

**Step 2: Verify it typechecks**

Run: `cd examples/typescript && pnpm exec tsc --noEmit agents/openai/ram_agent.ts`
Expected: 0 errors. (If `pnpm exec tsc` complains about isolatedModules, run `pnpm exec tsx --no-cache --check agents/openai/ram_agent.ts` instead, or skip and rely on the runtime import from Step 3 to surface type issues.)

**Step 3: (Optional, requires `OPENAI_API_KEY`) Smoke-test runtime**

Run: `cd /Users/zecheng/strukto/mirage && pnpm --filter @struktoai/mirage-examples exec tsx examples/typescript/agents/openai/ram_agent.ts`
Expected: agent creates files, prints final output and verification block.

**Step 4: Commit**

```bash
git add examples/typescript/agents/openai/ram_agent.ts
git commit -m "feat(examples/ts): add openai ram_agent example"
```

______________________________________________________________________

## Task 8: Write `multi_resource_agent.ts` example

**Files:**

- Create: `examples/typescript/agents/openai/multi_resource_agent.ts`

**Step 1: Write the example** — mirrors `sandbox_agent.py`'s mount setup minus Sandbox plumbing

```ts
import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  MountMode,
  OpsRegistry,
  RAMResource,
  Workspace,
} from '@struktoai/mirage-core'
import {
  S3Resource,
  SlackResource,
  normalizeSlackConfig,
} from '@struktoai/mirage-node'
import { Agent, Runner, applyPatchTool, shellTool } from '@openai/agents'
import {
  MirageEditor,
  MirageShell,
  buildSystemPrompt,
} from '@struktoai/mirage-agents/openai'

loadEnv({
  path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../../.env.development'),
})

const ram = new RAMResource()
const s3 = new S3Resource({
  bucket: process.env.AWS_S3_BUCKET!,
  region: process.env.AWS_DEFAULT_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})
const slack = new SlackResource({
  config: normalizeSlackConfig({ token: process.env.SLACK_BOT_TOKEN! }),
})

const ops = new OpsRegistry()
for (const op of ram.ops()) ops.register(op)
for (const op of s3.ops()) ops.register(op)
for (const op of slack.ops()) ops.register(op)

const ws = new Workspace(
  {
    '/': [ram, MountMode.WRITE],
    '/s3': [s3, MountMode.READ],
    '/slack': [slack, MountMode.READ],
  },
  { mode: MountMode.WRITE, ops },
)

const agent = new Agent({
  name: 'Mirage Multi-Resource Agent',
  model: 'gpt-5.4',
  instructions: buildSystemPrompt({ workspace: ws }),
  tools: [
    shellTool({ shell: new MirageShell(ws) }),
    applyPatchTool({ editor: new MirageEditor(ws) }),
  ],
})

const task =
  '1. Find the date of the latest Slack message in the general channel. ' +
  '2. Summarize the parquet file in /s3/data/. ' +
  'Write your findings to /report.txt.'

const result = await Runner.run(agent, task)
console.log(result.finalOutput)

const findAll = await ws.execute('find / -type f')
console.log('\n--- Files in workspace ---')
console.log(await findAll.stdoutStr())
```

**Step 2: Verify it typechecks**

Run: `cd examples/typescript && pnpm exec tsc --noEmit agents/openai/multi_resource_agent.ts`
Expected: 0 errors. **If `S3Resource` / `SlackResource` constructor signatures don't match the snippet above** (the TS API may differ from Python), check the existing `examples/typescript/{s3,slack}/` for the canonical instantiation pattern and adjust accordingly. Do not invent fields — copy from a working example.

**Step 3: Commit**

```bash
git add examples/typescript/agents/openai/multi_resource_agent.ts
git commit -m "feat(examples/ts): add openai multi_resource_agent example"
```

______________________________________________________________________

## Task 9: Write `snapshot.ts` example

**Files:**

- Create: `examples/typescript/agents/openai/snapshot.ts`

**Step 1: Write the example** — agent runs against a workspace, then `ws.save()` → `Workspace.load()` into a fresh workspace, diff content

```ts
import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  MountMode,
  OpsRegistry,
  RAMResource,
  Workspace,
} from '@struktoai/mirage-core'
import { Agent, Runner, applyPatchTool, shellTool } from '@openai/agents'
import {
  MirageEditor,
  MirageShell,
  buildSystemPrompt,
} from '@struktoai/mirage-agents/openai'

loadEnv({
  path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../../.env.development'),
})

function makeWorkspace(): Workspace {
  const ram = new RAMResource()
  const ops = new OpsRegistry()
  for (const op of ram.ops()) ops.register(op)
  return new Workspace({ '/': ram }, { mode: MountMode.WRITE, ops })
}

const ws = makeWorkspace()

const agent = new Agent({
  name: 'Snapshot Demo',
  model: 'gpt-5.4-mini',
  instructions: buildSystemPrompt({
    workspace: ws,
    extraInstructions: 'Write a 3-line note about Mirage to /report.txt using the shell tool.',
  }),
  tools: [
    shellTool({ shell: new MirageShell(ws) }),
    applyPatchTool({ editor: new MirageEditor(ws) }),
  ],
})

const result = await Runner.run(agent, 'Create the report.')
console.log('Agent output:', result.finalOutput)

const origFiles = (await (await ws.execute('find / -type f')).stdoutStr())
  .trim().split('\n').filter(Boolean)
console.log('\n--- Original files ---')
console.log(origFiles.join('\n'))

console.log('\n--- Persisting snapshot ---')
const snapshot = await ws.save()
console.log(`snapshot bytes: ${snapshot.byteLength.toLocaleString()}`)

console.log('\n--- Restoring into fresh workspace ---')
const fresh = await Workspace.load(snapshot)
const freshFiles = (await (await fresh.execute('find / -type f')).stdoutStr())
  .trim().split('\n').filter(Boolean)
console.log(freshFiles.join('\n'))

console.log('\n--- Per-file content match ---')
for (const path of origFiles) {
  const a = await (await ws.execute(`cat ${path}`)).stdoutStr()
  const b = await (await fresh.execute(`cat ${path}`)).stdoutStr()
  console.log(`${a === b ? '✓' : '✗'} ${path} (${a.length} chars)`)
}
```

**Step 2: Verify Workspace.save / Workspace.load signatures**

The exact return types of `Workspace.save` and signature of `Workspace.load` should match `typescript/packages/core/src/workspace/workspace.ts` (the `tar_io.ts`-backed snapshot path). Read these and adjust the types in the example if they differ — e.g. `save` may return `Promise<Uint8Array>` or take a stream; `load` may be a static method or factory. Pin from the actual source, do not guess.

**Step 3: Typecheck**

Run: `cd examples/typescript && pnpm exec tsc --noEmit agents/openai/snapshot.ts`
Expected: 0 errors.

**Step 4: Commit**

```bash
git add examples/typescript/agents/openai/snapshot.ts
git commit -m "feat(examples/ts): add openai snapshot example"
```

______________________________________________________________________

## Task 10: Final verification sweep

**Step 1: Build the package**

Run: `cd typescript && pnpm --filter @struktoai/mirage-agents build`
Expected: clean build, both entry points emitted.

**Step 2: Run the package's tests**

Run: `cd typescript && pnpm --filter @struktoai/mirage-agents test`
Expected: 15 tests PASS (5 prompt + 3 shell + 7 editor).

**Step 3: Typecheck the package**

Run: `cd typescript && pnpm --filter @struktoai/mirage-agents typecheck`
Expected: 0 errors.

**Step 4: Typecheck the examples**

Run: `cd examples/typescript && pnpm exec tsc --noEmit -p .` (if a tsconfig is set up for the examples; otherwise typecheck individual files)
Expected: 0 errors in `agents/openai/*.ts`.

**Step 5: Run pre-commit on the whole repo**

Run: `cd /Users/zecheng/strukto/mirage && ./python/.venv/bin/pre-commit run --all-files`
Expected: all hooks PASS (this runs ESLint/Prettier on TS too).

**Step 6: Confirm no Python regressions** *(per CLAUDE.md "scope tests to changed code", we only touch TS and one Python doc-adjacent file is unchanged — skip pytest)*

No action needed. (TS-only changeset.)

**Step 7: Final commit if pre-commit auto-fixed anything**

```bash
git status
# If pre-commit modified files:
git add -u && git commit -m "chore: pre-commit fixes"
```

______________________________________________________________________

## Out of scope (do not implement)

- `MirageSandbox*` — no JS SDK interfaces exist (see design doc)
- `mirageCodexTool` wrapper — orthogonal, would require FUSE lifecycle plumbing
- `MirageWorkspaceTools` factory sugar — premature abstraction (per `CLAUDE.md`'s YAGNI rule)
- Re-exporting from `@struktoai/mirage-node` — users opt in via the `@struktoai/mirage-agents` package directly
- Adding `@struktoai/mirage-agents` to `pnpm-workspace.yaml` — already covered by the `packages/*` glob

## Risks / open items

- **Editor diff format in tests**: hand-written V4A diffs in `editor.test.ts` may need tweaking to satisfy `applyDiff`'s exact expectations. If a test's diff string is rejected, simplify or look at an example diff in `@openai/agents`'s test fixtures (under `node_modules/@openai/agents-core/dist/utils/`).
- **`Workspace.save` / `Workspace.load` API**: the snapshot example assumes `Promise<Uint8Array>` and a static `load(buffer)` — pin from source before writing the example. Adjust if the API takes a writable stream or returns differently.
- **Resource constructor signatures in `multi_resource_agent.ts`**: copy-paste from existing `examples/typescript/{s3,slack}/` rather than guessing — TS resources may take options as a single arg, not destructured-config like Python.
