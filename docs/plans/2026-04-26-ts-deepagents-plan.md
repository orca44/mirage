# TypeScript DeepAgents Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `@struktoai/mirage-agents/langchain` subpath to the existing `@struktoai/mirage-agents` package that exports `LangchainWorkspace` (implements `deepagents`'s `SandboxBackendProtocol`) plus an `extractText` helper. Mirrors `python/mirage/agents/langchain/`. Ship two examples: `ram_deepagent.ts` (smoke-testable, no secrets) and `s3_deepagent.ts` (Python parity).

**Architecture:** Reuse the established package shape from the OpenAI integration (already merged). New subpath `./langchain` joins the existing `./openai` subpath in `package.json`'s `exports`. The `prompt.ts` module at the package root is already canonical and shared — `langchain/index.ts` just re-exports it. `LangchainWorkspace` implements `SandboxBackendProtocol` from `deepagents` and proxies file ops through `Workspace.fs.*` and shell ops through `Workspace.execute()`.

**Tech Stack:** Same as OpenAI integration (TS 6 strict, vitest 3, tsup, pnpm workspaces). New peer dep: `deepagents` ^1.9.0.

**Reference docs:**

- Python source to mirror:
  - `python/mirage/agents/langchain/{backend,_convert,_messages,prompt}.py`
  - `examples/python/agents/langchain/s3_deepagent.py`
- TS Workspace API:
  - `Workspace.fs.{readFile,readFileText,writeFile,mkdir,unlink,exists,readdir,stat,isDir,isFile}` (`typescript/packages/core/src/workspace/fs.ts`)
  - `Workspace.execute(cmd)` → `ExecuteResult` with `stdoutText`/`stderrText`/`exitCode` getters (`typescript/packages/core/src/workspace/workspace.ts:60-90`)
  - `FileStat.size`/`modified` (`typescript/packages/core/src/types.ts:80-92`)
- DeepAgents TS protocol (pinned 1.9.0):
  - `SandboxBackendProtocol` extends `BackendProtocolV1` (12 required methods + 2 optional)
  - All methods return `MaybePromise<T> = T | Promise<T>` — async-only is fine
  - Types: `FileInfo`, `GrepMatch`, `WriteResult`, `EditResult`, `ExecuteResponse`, `FileData{V1,V2}`, `FileDownloadResponse`, `FileUploadResponse`
  - Method names are camelCase (`lsInfo`, `grepRaw`, `globInfo`, `uploadFiles`, `downloadFiles`)
  - `ExecuteResponse.exitCode` is `number | null`; has `truncated: boolean` field (Python doesn't)
- Existing branch context:
  - The `@struktoai/mirage-agents` package already exists at `typescript/packages/agents/` (merged from PR #17). It currently exports `./` (empty) and `./openai`.
  - `src/prompt.ts` already exports `MIRAGE_SYSTEM_PROMPT`, `buildSystemPrompt`, `BuildSystemPromptOptions`. Re-export from new subpath.

**Lessons baked in from OpenAI implementation (do NOT repeat):**

- Tests: import `Workspace`/`RAMResource`/`OpsRegistry`/`MountMode` from `@struktoai/mirage-node` (NOT `@struktoai/mirage-core` — core's Workspace requires a shellParser).
- `Workspace.execute(cmd)` returns `ExecuteResult` whose decoded-string accessors are getters: `io.stdoutText` / `io.stderrText` (NOT `io.stdoutStr()`).
- Tests must avoid `!` non-null assertions (ESLint bans `@typescript-eslint/no-non-null-assertion`). Use destructuring + explicit guards.
- Helper functions go at module scope (CLAUDE.md bans nested functions).
- Don't silently swallow exceptions; document with comments or convert to structured failure results.
- Keep imports minimal; type-only where possible (`verbatimModuleSyntax` on).

______________________________________________________________________

## Task 1: Add `./langchain` subpath to package config

**Files:**

- Modify: `typescript/packages/agents/package.json`
- Modify: `typescript/packages/agents/tsup.config.ts`
- Create: `typescript/packages/agents/src/langchain/index.ts` (stub)

**Step 1: Update `package.json`**

Add `deepagents` to peerDeps and devDeps. Add `./langchain` to `exports`:

```jsonc
"exports": {
  ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
  "./openai": { "types": "./dist/openai/index.d.ts", "import": "./dist/openai/index.js" },
  "./langchain": { "types": "./dist/langchain/index.d.ts", "import": "./dist/langchain/index.js" }
},
```

```jsonc
"peerDependencies": {
  "@openai/agents": "^0.8.0",
  "deepagents": "^1.9.0",
  "zod": "^4.0.0"
},
"devDependencies": {
  "@openai/agents": "^0.8.0",
  "deepagents": "^1.9.0",
  ...
},
```

**Step 2: Update `tsup.config.ts`** — add the new entry:

```ts
entry: ['src/index.ts', 'src/openai/index.ts', 'src/langchain/index.ts'],
```

**Step 3: Create stub `src/langchain/index.ts`**

```ts
export {}
```

(Real exports go in Task 5 after the implementation lands. The stub lets `pnpm build` succeed for downstream tasks.)

**Step 4: Install + verify**

```bash
cd typescript && pnpm install
cd typescript/packages/agents && pnpm build
```

Expected: builds emit `dist/langchain/index.{js,d.ts}` alongside the existing `dist/openai/...`. `pnpm typecheck` passes.

**Step 5: Commit**

```bash
git add typescript/packages/agents/package.json typescript/packages/agents/tsup.config.ts typescript/packages/agents/src/langchain typescript/pnpm-lock.yaml
git commit -m "feat(agents): bootstrap @struktoai/mirage-agents/langchain subpath"
```

______________________________________________________________________

## Task 2: Implement `extractText` helper with tests

**Files:**

- Create: `typescript/packages/agents/src/langchain/messages.ts`
- Create: `typescript/packages/agents/src/langchain/messages.test.ts`

Port of `python/mirage/agents/langchain/_messages.py`. Extracts text content from LangGraph message arrays.

**Step 1: Write failing tests**

`messages.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { extractText } from './messages.ts'

describe('extractText', () => {
  it('returns empty array for empty messages', () => {
    expect(extractText([])).toEqual([])
  })

  it('extracts plain string content from messages', () => {
    const msgs = [{ content: 'hello' }, { content: 'world' }]
    expect(extractText(msgs)).toEqual(['hello', 'world'])
  })

  it('skips empty/whitespace strings', () => {
    const msgs = [{ content: '  ' }, { content: 'x' }, { content: '' }]
    expect(extractText(msgs)).toEqual(['x'])
  })

  it('ignores messages without content field', () => {
    const msgs = [{ role: 'tool' }, { content: 'hi' }, { foo: 'bar' }]
    expect(extractText(msgs)).toEqual(['hi'])
  })

  it('extracts text from array-form content (Anthropic style)', () => {
    const msgs = [
      {
        content: [
          { type: 'text', text: 'first' },
          { type: 'tool_use', id: 'x' },
          { type: 'text', text: 'second' },
        ],
      },
    ]
    expect(extractText(msgs)).toEqual(['first', 'second'])
  })
})
```

**Step 2: Run tests, confirm FAIL** (`Cannot find module './messages.ts'`)

**Step 3: Implement `messages.ts`** — port from Python's `_messages.py:1-27`:

```ts
type MessageLike = {
  content?: unknown
}

type ContentBlock = {
  type?: string
  text?: string
}

export function extractText(messages: readonly MessageLike[]): string[] {
  const texts: string[] = []
  for (const msg of messages) {
    if (!('content' in msg) || msg.content === undefined || msg.content === null) continue
    const content = msg.content
    if (typeof content === 'string') {
      if (content.trim().length > 0) texts.push(content)
      continue
    }
    if (Array.isArray(content)) {
      for (const block of content) {
        if (
          typeof block === 'object' &&
          block !== null &&
          (block as ContentBlock).type === 'text' &&
          typeof (block as ContentBlock).text === 'string' &&
          ((block as ContentBlock).text as string).trim().length > 0
        ) {
          texts.push((block as ContentBlock).text as string)
        }
      }
    }
  }
  return texts
}
```

The Python only handles plain string content. The TS adds Anthropic's array-of-blocks shape (since the example will use `claude-sonnet-4` which returns array content). This is a deliberate enhancement, not a deviation.

**Step 4: Run tests, confirm 5 PASS**

**Step 5: Lint + typecheck clean**

```bash
cd typescript && pnpm exec eslint packages/agents/src/langchain
cd typescript/packages/agents && pnpm typecheck
```

**Step 6: Commit**

```bash
git add typescript/packages/agents/src/langchain/messages.ts typescript/packages/agents/src/langchain/messages.test.ts
git commit -m "feat(agents/langchain): add extractText helper"
```

______________________________________________________________________

## Task 3: Implement `convert` helpers (private, used by backend)

**Files:**

- Create: `typescript/packages/agents/src/langchain/convert.ts`
- Create: `typescript/packages/agents/src/langchain/convert.test.ts`

Port of `python/mirage/agents/langchain/_convert.py`. Three pure functions that translate `IOResult`-shaped objects (we use `ExecuteResult` from TS Workspace) into deepagents result types.

**Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { ioToExecuteResponse, ioToFileInfos, ioToGrepMatches } from './convert.ts'

type FakeIO = { stdoutText: string; stderrText: string; exitCode: number | null }

function fakeIO(stdout = '', stderr = '', exitCode: number | null = 0): FakeIO {
  return { stdoutText: stdout, stderrText: stderr, exitCode }
}

describe('ioToExecuteResponse', () => {
  it('combines stdout and stderr', () => {
    const r = ioToExecuteResponse(fakeIO('out', 'err', 1))
    expect(r.output).toBe('out\nerr')
    expect(r.exitCode).toBe(1)
    expect(r.truncated).toBe(false)
  })

  it('returns stdout only when stderr empty', () => {
    expect(ioToExecuteResponse(fakeIO('out', '')).output).toBe('out')
  })

  it('returns stderr only when stdout empty', () => {
    expect(ioToExecuteResponse(fakeIO('', 'err')).output).toBe('err')
  })

  it('returns empty string when both empty', () => {
    expect(ioToExecuteResponse(fakeIO('', '')).output).toBe('')
  })
})

describe('ioToGrepMatches', () => {
  it('parses grep -n output', () => {
    const out = '/a.txt:3:hello\n/b.txt:7:world\n'
    expect(ioToGrepMatches(fakeIO(out))).toEqual([
      { path: '/a.txt', line: 3, text: 'hello' },
      { path: '/b.txt', line: 7, text: 'world' },
    ])
  })

  it('returns empty for empty stdout', () => {
    expect(ioToGrepMatches(fakeIO(''))).toEqual([])
  })

  it('skips lines without parseable line number', () => {
    expect(ioToGrepMatches(fakeIO('/a:notanumber:x\n'))).toEqual([])
  })
})

describe('ioToFileInfos', () => {
  it('parses find output (files and dirs)', () => {
    const out = '/a.txt\n/data/\n/b.csv\n'
    expect(ioToFileInfos(fakeIO(out))).toEqual([
      { path: '/a.txt', is_dir: false },
      { path: '/data', is_dir: true },
      { path: '/b.csv', is_dir: false },
    ])
  })

  it('returns empty for empty stdout', () => {
    expect(ioToFileInfos(fakeIO(''))).toEqual([])
  })
})
```

**Step 2: Run tests, confirm FAIL**

**Step 3: Implement `convert.ts`** — port from `_convert.py`:

```ts
import type { ExecuteResponse, FileInfo, GrepMatch } from 'deepagents'

interface IOLike {
  stdoutText: string
  stderrText: string
  exitCode: number | null
}

export function ioToExecuteResponse(io: IOLike): ExecuteResponse {
  const stdout = io.stdoutText
  const stderr = io.stderrText
  let output = stdout
  if (stderr.length > 0) {
    output = stdout.length > 0 ? `${stdout}\n${stderr}` : stderr
  }
  return { output, exitCode: io.exitCode, truncated: false }
}

export function ioToGrepMatches(io: IOLike): GrepMatch[] {
  const stdout = io.stdoutText.trim()
  if (stdout.length === 0) return []
  const matches: GrepMatch[] = []
  for (const line of stdout.split('\n')) {
    const firstColon = line.indexOf(':')
    if (firstColon < 0) continue
    const secondColon = line.indexOf(':', firstColon + 1)
    if (secondColon < 0) continue
    const path = line.slice(0, firstColon)
    const lineNumStr = line.slice(firstColon + 1, secondColon)
    const text = line.slice(secondColon + 1)
    const lineNum = Number.parseInt(lineNumStr, 10)
    if (Number.isNaN(lineNum)) continue
    matches.push({ path, line: lineNum, text })
  }
  return matches
}

export function ioToFileInfos(io: IOLike): FileInfo[] {
  const stdout = io.stdoutText.trim()
  if (stdout.length === 0) return []
  const infos: FileInfo[] = []
  for (const raw of stdout.split('\n')) {
    const entry = raw.trim()
    if (entry.length === 0) continue
    const isDir = entry.endsWith('/')
    infos.push({ path: isDir ? entry.slice(0, -1) : entry, is_dir: isDir })
  }
  return infos
}
```

**Step 4: Run tests, confirm 9 PASS**

**Step 5: Commit**

```bash
git add typescript/packages/agents/src/langchain/convert.ts typescript/packages/agents/src/langchain/convert.test.ts
git commit -m "feat(agents/langchain): add IO conversion helpers"
```

______________________________________________________________________

## Task 4: Implement `LangchainWorkspace` (file ops + shell ops)

**Files:**

- Create: `typescript/packages/agents/src/langchain/backend.ts`
- Create: `typescript/packages/agents/src/langchain/backend.test.ts`

Port of `python/mirage/agents/langchain/backend.py:17-238`. Implements `SandboxBackendProtocol` from `deepagents`. Single class with ~10 methods.

### Step 1: Write failing tests

`backend.test.ts` — covers all methods via a real `RAMResource`-backed Workspace from `@struktoai/mirage-node`:

```ts
import { describe, expect, it } from 'vitest'
import { OpsRegistry, RAMResource, MountMode, Workspace } from '@struktoai/mirage-node'
import { LangchainWorkspace } from './backend.ts'

function mkWs(): Workspace {
  const ram = new RAMResource()
  const ops = new OpsRegistry()
  for (const op of ram.ops()) ops.register(op)
  return new Workspace({ '/': ram }, { mode: MountMode.WRITE, ops })
}

describe('LangchainWorkspace.id', () => {
  it('defaults to "mirage"', () => {
    const lw = new LangchainWorkspace(mkWs())
    expect(lw.id).toBe('mirage')
  })

  it('accepts custom sandboxId', () => {
    const lw = new LangchainWorkspace(mkWs(), { sandboxId: 'custom' })
    expect(lw.id).toBe('custom')
  })
})

describe('LangchainWorkspace.execute', () => {
  it('runs a command and returns ExecuteResponse', async () => {
    const lw = new LangchainWorkspace(mkWs())
    const r = await lw.execute('echo hello')
    expect(r.output).toBe('hello\n')
    expect(r.exitCode).toBe(0)
    expect(r.truncated).toBe(false)
  })
})

describe('LangchainWorkspace.write', () => {
  it('creates new file', async () => {
    const ws = mkWs()
    const lw = new LangchainWorkspace(ws)
    const r = await lw.write('/hello.txt', 'hi')
    expect(r.error).toBeUndefined()
    expect(r.path).toBe('/hello.txt')
    expect(await ws.fs.readFileText('/hello.txt')).toBe('hi')
  })

  it('rejects existing path', async () => {
    const ws = mkWs()
    await ws.fs.writeFile('/exists.txt', 'x')
    const lw = new LangchainWorkspace(ws)
    const r = await lw.write('/exists.txt', 'new')
    expect(r.error).toContain('already exists')
    expect(r.path).toBeUndefined()
  })

  it('mkdirs missing parent', async () => {
    const ws = mkWs()
    const lw = new LangchainWorkspace(ws)
    const r = await lw.write('/sub/nested.txt', 'x')
    expect(r.error).toBeUndefined()
    expect(await ws.fs.readFileText('/sub/nested.txt')).toBe('x')
  })
})

describe('LangchainWorkspace.read', () => {
  it('returns numbered lines from existing file', async () => {
    const ws = mkWs()
    await ws.fs.writeFile('/notes.txt', 'one\ntwo\nthree\n')
    const lw = new LangchainWorkspace(ws)
    const text = await lw.read('/notes.txt')
    expect(text).toContain('     1\tone\n')
    expect(text).toContain('     2\ttwo\n')
    expect(text).toContain('     3\tthree\n')
  })

  it('honors offset and limit', async () => {
    const ws = mkWs()
    await ws.fs.writeFile('/n.txt', 'a\nb\nc\nd\n')
    const lw = new LangchainWorkspace(ws)
    const text = await lw.read('/n.txt', 1, 2)
    expect(text).toContain('     2\tb\n')
    expect(text).toContain('     3\tc\n')
    expect(text).not.toContain('     1\ta\n')
    expect(text).not.toContain('     4\td\n')
  })

  it('returns error string for missing file', async () => {
    const lw = new LangchainWorkspace(mkWs())
    const text = await lw.read('/nope.txt')
    expect(text.startsWith('Error:')).toBe(true)
  })
})

describe('LangchainWorkspace.edit', () => {
  it('replaces single occurrence', async () => {
    const ws = mkWs()
    await ws.fs.writeFile('/f.txt', 'foo bar baz')
    const lw = new LangchainWorkspace(ws)
    const r = await lw.edit('/f.txt', 'bar', 'BAR')
    expect(r.error).toBeUndefined()
    expect(r.occurrences).toBe(1)
    expect(await ws.fs.readFileText('/f.txt')).toBe('foo BAR baz')
  })

  it('rejects multiple occurrences without replaceAll', async () => {
    const ws = mkWs()
    await ws.fs.writeFile('/f.txt', 'aa aa')
    const lw = new LangchainWorkspace(ws)
    const r = await lw.edit('/f.txt', 'aa', 'X')
    expect(r.error).toContain('appears 2 times')
  })

  it('replaces all when replaceAll=true', async () => {
    const ws = mkWs()
    await ws.fs.writeFile('/f.txt', 'aa aa')
    const lw = new LangchainWorkspace(ws)
    const r = await lw.edit('/f.txt', 'aa', 'X', true)
    expect(r.occurrences).toBe(2)
    expect(await ws.fs.readFileText('/f.txt')).toBe('X X')
  })

  it('returns error for missing file', async () => {
    const lw = new LangchainWorkspace(mkWs())
    const r = await lw.edit('/nope.txt', 'x', 'y')
    expect(r.error).toContain('not found')
  })

  it('returns error when string not in file', async () => {
    const ws = mkWs()
    await ws.fs.writeFile('/f.txt', 'abc')
    const lw = new LangchainWorkspace(ws)
    const r = await lw.edit('/f.txt', 'zzz', 'y')
    expect(r.error).toContain('not found')
  })
})

describe('LangchainWorkspace.lsInfo', () => {
  it('lists files and directories with is_dir flag', async () => {
    const ws = mkWs()
    await ws.fs.writeFile('/a.txt', 'a')
    await ws.fs.mkdir('/d')
    await ws.fs.writeFile('/d/b.txt', 'b')
    const lw = new LangchainWorkspace(ws)
    const items = await lw.lsInfo('/')
    const paths = items.map((i) => i.path).sort()
    expect(paths).toContain('/a.txt')
    expect(paths).toContain('/d')
    const dirEntry = items.find((i) => i.path === '/d')
    expect(dirEntry?.is_dir).toBe(true)
    const fileEntry = items.find((i) => i.path === '/a.txt')
    expect(fileEntry?.is_dir).toBe(false)
  })
})

describe('LangchainWorkspace.globInfo', () => {
  it('finds files matching a pattern', async () => {
    const ws = mkWs()
    await ws.fs.writeFile('/a.csv', 'a')
    await ws.fs.writeFile('/b.csv', 'b')
    await ws.fs.writeFile('/c.txt', 'c')
    const lw = new LangchainWorkspace(ws)
    const items = await lw.globInfo('*.csv', '/')
    const paths = items.map((i) => i.path).sort()
    expect(paths).toContain('/a.csv')
    expect(paths).toContain('/b.csv')
    expect(paths).not.toContain('/c.txt')
  })
})

describe('LangchainWorkspace.grepRaw', () => {
  it('returns matches with line numbers', async () => {
    const ws = mkWs()
    await ws.fs.writeFile('/log.txt', 'one\nerror here\ntwo\nerror again\n')
    const lw = new LangchainWorkspace(ws)
    const result = await lw.grepRaw('error', '/log.txt')
    expect(Array.isArray(result)).toBe(true)
    if (Array.isArray(result)) {
      expect(result.length).toBe(2)
      expect(result[0]?.path).toBe('/log.txt')
      expect(result[0]?.line).toBe(2)
      expect(result[0]?.text).toContain('error here')
    }
  })

  it('returns empty array for no matches', async () => {
    const ws = mkWs()
    await ws.fs.writeFile('/log.txt', 'no match\n')
    const lw = new LangchainWorkspace(ws)
    const result = await lw.grepRaw('zzz', '/log.txt')
    expect(result).toEqual([])
  })
})

describe('LangchainWorkspace.uploadFiles / downloadFiles', () => {
  it('upload writes files', async () => {
    const ws = mkWs()
    const lw = new LangchainWorkspace(ws)
    const responses = await lw.uploadFiles([
      ['/up1.txt', new TextEncoder().encode('one')],
      ['/up2.txt', new TextEncoder().encode('two')],
    ])
    expect(responses).toHaveLength(2)
    expect(responses[0]?.error).toBeNull()
    expect(await ws.fs.readFileText('/up1.txt')).toBe('one')
    expect(await ws.fs.readFileText('/up2.txt')).toBe('two')
  })

  it('download returns content for existing files', async () => {
    const ws = mkWs()
    await ws.fs.writeFile('/d.txt', 'data')
    const lw = new LangchainWorkspace(ws)
    const [r] = await lw.downloadFiles(['/d.txt'])
    if (r === undefined) throw new Error('expected one response')
    expect(r.error).toBeNull()
    expect(r.content).not.toBeNull()
    if (r.content !== null) {
      expect(new TextDecoder().decode(r.content)).toBe('data')
    }
  })

  it('download returns error for missing files', async () => {
    const lw = new LangchainWorkspace(mkWs())
    const [r] = await lw.downloadFiles(['/missing.txt'])
    if (r === undefined) throw new Error('expected one response')
    expect(r.content).toBeNull()
    expect(r.error).toBe('file_not_found')
  })
})

describe('LangchainWorkspace.readRaw', () => {
  it('returns FileDataV2 with string content for text files', async () => {
    const ws = mkWs()
    await ws.fs.writeFile('/text.txt', 'hello')
    const lw = new LangchainWorkspace(ws)
    const data = await lw.readRaw('/text.txt')
    expect(data.content).toBe('hello')
    expect(typeof data.mimeType).toBe('string')
    expect(data.modified_at).toBeDefined()
  })
})
```

### Step 2: Run tests, confirm FAIL

### Step 3: Implement `backend.ts`

```ts
import type { Workspace } from '@struktoai/mirage-node'
import type {
  EditResult,
  ExecuteResponse,
  FileData,
  FileDownloadResponse,
  FileInfo,
  FileUploadResponse,
  GrepMatch,
  SandboxBackendProtocol,
  WriteResult,
} from 'deepagents'
import { ioToExecuteResponse, ioToFileInfos, ioToGrepMatches } from './convert.ts'

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'json', 'jsonl', 'yaml', 'yml', 'csv', 'tsv', 'xml', 'html', 'htm',
  'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'rb', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'hpp',
  'sh', 'bash', 'zsh', 'fish', 'sql', 'log', 'env', 'ini', 'toml', 'conf', 'cfg',
])

function shellQuote(s: string): string {
  if (/^[A-Za-z0-9_./-]+$/.test(s)) return s
  return `'${s.replaceAll(`'`, `'\\''`)}'`
}

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
  await ensureParent(ws, parent)
  try {
    await ws.fs.mkdir(parent)
  } catch (err) {
    if (!(await ws.fs.exists(parent))) throw err
  }
}

function extOf(path: string): string {
  const dot = path.lastIndexOf('.')
  if (dot < 0) return ''
  return path.slice(dot + 1).toLowerCase()
}

function mimeFor(path: string): string {
  const ext = extOf(path)
  if (ext === 'json' || ext === 'jsonl') return 'application/json'
  if (ext === 'csv') return 'text/csv'
  if (ext === 'html' || ext === 'htm') return 'text/html'
  if (ext === 'md') return 'text/markdown'
  if (TEXT_EXTENSIONS.has(ext)) return 'text/plain'
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'pdf') return 'application/pdf'
  return 'application/octet-stream'
}

export interface LangchainWorkspaceOptions {
  sandboxId?: string
}

export class LangchainWorkspace implements SandboxBackendProtocol {
  readonly id: string
  private readonly ws: Workspace

  constructor(workspace: Workspace, options: LangchainWorkspaceOptions = {}) {
    this.ws = workspace
    this.id = options.sandboxId ?? 'mirage'
  }

  async execute(command: string): Promise<ExecuteResponse> {
    const io = await this.ws.execute(command)
    return ioToExecuteResponse(io)
  }

  async lsInfo(path: string): Promise<FileInfo[]> {
    const io = await this.ws.execute(`ls ${shellQuote(path)}`)
    const stdout = io.stdoutText.trim()
    if (stdout.length === 0) return []
    const base = path.replace(/\/+$/, '')
    const result: FileInfo[] = []
    for (const raw of stdout.split('\n')) {
      const name = raw.trim()
      if (name.length === 0) continue
      const isDir = name.endsWith('/')
      const clean = isDir ? name.slice(0, -1) : name
      result.push({ path: `${base}/${clean}`, is_dir: isDir })
    }
    return result
  }

  async read(filePath: string, offset = 0, limit = 2000): Promise<string> {
    let bytes: Uint8Array
    try {
      bytes = await this.ws.fs.readFile(filePath)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return `Error: ${msg}`
    }
    const text = new TextDecoder('utf-8').decode(bytes)
    const lines = text.split(/(?<=\n)/)
    const sliced = lines.slice(offset, offset + limit)
    let out = ''
    for (let i = 0; i < sliced.length; i += 1) {
      const num = String(offset + i + 1).padStart(6)
      out += `${num}\t${sliced[i] ?? ''}`
    }
    return out
  }

  async readRaw(filePath: string): Promise<FileData> {
    const stat = await this.ws.fs.stat(filePath)
    const bytes = await this.ws.fs.readFile(filePath)
    const mimeType = mimeFor(filePath)
    const isText = mimeType.startsWith('text/') || mimeType === 'application/json'
    const content: string | Uint8Array = isText
      ? new TextDecoder('utf-8').decode(bytes)
      : bytes
    const modified = stat.modified ?? new Date().toISOString()
    return {
      content,
      mimeType,
      created_at: modified,
      modified_at: modified,
    }
  }

  async write(filePath: string, content: string): Promise<WriteResult> {
    if (await this.ws.fs.exists(filePath)) {
      return { error: `Error: file '${filePath}' already exists` }
    }
    await ensureParent(this.ws, filePath)
    await this.ws.fs.writeFile(filePath, content)
    return { path: filePath }
  }

  async edit(
    filePath: string,
    oldString: string,
    newString: string,
    replaceAll = false,
  ): Promise<EditResult> {
    let current: string
    try {
      current = await this.ws.fs.readFileText(filePath)
    } catch {
      return { error: `Error: file '${filePath}' not found` }
    }
    const count = current.split(oldString).length - 1
    if (count === 0) {
      return { error: `Error: string not found in file: '${oldString}'` }
    }
    if (count > 1 && !replaceAll) {
      return {
        error: `Error: string '${oldString}' appears ${count} times. Use replaceAll=true`,
      }
    }
    const next = replaceAll
      ? current.split(oldString).join(newString)
      : current.replace(oldString, newString)
    await this.ws.fs.writeFile(filePath, next)
    return { path: filePath, occurrences: replaceAll ? count : 1 }
  }

  async grepRaw(
    pattern: string,
    path?: string | null,
    glob?: string | null,
  ): Promise<GrepMatch[] | string> {
    const parts: string[] = ['grep', '-rn']
    if (glob !== undefined && glob !== null && glob.length > 0) {
      parts.push('--include', shellQuote(glob))
    }
    parts.push(shellQuote(pattern))
    parts.push(shellQuote(path ?? '/'))
    const io = await this.ws.execute(parts.join(' '))
    return ioToGrepMatches(io)
  }

  async globInfo(pattern: string, path = '/'): Promise<FileInfo[]> {
    const name = pattern.includes('/') ? (pattern.split('/').pop() ?? pattern) : pattern
    const io = await this.ws.execute(`find ${shellQuote(path)} -name ${shellQuote(name)}`)
    return ioToFileInfos(io)
  }

  async uploadFiles(
    files: ReadonlyArray<readonly [string, Uint8Array]>,
  ): Promise<FileUploadResponse[]> {
    const results: FileUploadResponse[] = []
    for (const [path, data] of files) {
      await ensureParent(this.ws, path)
      await this.ws.fs.writeFile(path, data)
      results.push({ path, error: null })
    }
    return results
  }

  async downloadFiles(paths: readonly string[]): Promise<FileDownloadResponse[]> {
    const results: FileDownloadResponse[] = []
    for (const path of paths) {
      try {
        const content = await this.ws.fs.readFile(path)
        results.push({ path, content, error: null })
      } catch {
        results.push({ path, content: null, error: 'file_not_found' })
      }
    }
    return results
  }
}
```

**Notes/gotchas:**

- `shellQuote` is a hand-rolled `shlex.quote` — covers safe-char passthrough + single-quote escape.
- `parentOf` + `ensureParent` recursive — same pattern as `MirageEditor` since `WorkspaceFS.mkdir` is non-recursive.
- `read`'s line splitter uses `(?<=\n)` lookbehind so trailing-newline lines are preserved (mirrors Python's `splitlines(keepends=True)`).
- `edit`'s `count = content.split(oldString).length - 1` is the JS idiom for `str.count(substr)`.
- `readRaw` is a TS-only method (Python's backend doesn't implement it). MIME detection is best-effort by extension.
- `globInfo` behavior mirrors Python literally: extracts the basename of the pattern and runs `find -name`. So `*.csv` works; `**/*.csv` would match the same as `*.csv` (since basename is the same). Acceptable parity.
- Did NOT implement V2 protocol — the alias `SandboxBackendProtocol = SandboxBackendProtocolV1` is what we target (matches Python).

### Step 4: Run tests, confirm all 18 PASS

### Step 5: Lint + typecheck clean

### Step 6: Commit

```bash
git add typescript/packages/agents/src/langchain/backend.ts typescript/packages/agents/src/langchain/backend.test.ts
git commit -m "feat(agents/langchain): add LangchainWorkspace backend"
```

______________________________________________________________________

## Task 5: Wire `langchain/index.ts` public exports

**Files:**

- Modify: `typescript/packages/agents/src/langchain/index.ts`

```ts
export { LangchainWorkspace, type LangchainWorkspaceOptions } from './backend.ts'
export { extractText } from './messages.ts'
export { MIRAGE_SYSTEM_PROMPT, buildSystemPrompt } from '../prompt.ts'
export type { BuildSystemPromptOptions } from '../prompt.ts'
```

**Verify:**

```bash
cd typescript/packages/agents && pnpm build && pnpm test && pnpm typecheck
```

Smoke import:

```bash
cat > /tmp/smoke-langchain.mjs <<'EOF'
import { LangchainWorkspace, extractText, buildSystemPrompt, MIRAGE_SYSTEM_PROMPT } from '@struktoai/mirage-agents/langchain'
console.log({ LangchainWorkspace: typeof LangchainWorkspace, extractText: typeof extractText, buildSystemPrompt: typeof buildSystemPrompt, MIRAGE_SYSTEM_PROMPT: typeof MIRAGE_SYSTEM_PROMPT })
EOF
cd /Users/zecheng/strukto/mirage/.worktrees/ts-deepagents/examples/typescript && node /tmp/smoke-langchain.mjs
rm /tmp/smoke-langchain.mjs
```

(Requires `examples/typescript/package.json` to have `@struktoai/mirage-agents` already — it does, from the earlier work.)

**Commit:**

```bash
git add typescript/packages/agents/src/langchain/index.ts
git commit -m "feat(agents/langchain): wire public exports"
```

______________________________________________________________________

## Task 6: Add deepagents + LangChain provider deps to examples

**Files:**

- Modify: `examples/typescript/package.json`

Add to `dependencies` (alphabetically):

```json
"deepagents": "^1.9.0",
"@langchain/anthropic": "^0.3.0",
"@langchain/core": "^0.3.0"
```

Verify by running `pnpm install` then `node -e "console.log(require.resolve('deepagents'))"` from `examples/typescript/`.

**Commit:**

```bash
git add examples/typescript/package.json typescript/pnpm-lock.yaml
git commit -m "chore(examples): add deepagents + langchain anthropic deps"
```

______________________________________________________________________

## Task 7: Write `ram_deepagent.ts` example

**Files:**

- Create: `examples/typescript/agents/langchain/ram_deepagent.ts`

A self-contained smoke-testable example: RAM workspace, LangchainWorkspace backend, simple "create + summarize" task, verification via `ws.execute` + records dump.

```ts
import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { MountMode, OpsRegistry, RAMResource, Workspace } from '@struktoai/mirage-node'
import { ChatAnthropic } from '@langchain/anthropic'
import { createDeepAgent } from 'deepagents'
import {
  LangchainWorkspace,
  buildSystemPrompt,
  extractText,
} from '@struktoai/mirage-agents/langchain'

loadEnv({
  path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../../.env.development'),
})

const ram = new RAMResource()
const ops = new OpsRegistry()
for (const op of ram.ops()) ops.register(op)
const ws = new Workspace({ '/': ram }, { mode: MountMode.WRITE, ops })

const agent = createDeepAgent({
  model: new ChatAnthropic({ model: 'claude-sonnet-4-20250514' }),
  systemPrompt: buildSystemPrompt({
    mountInfo: { '/': 'In-memory filesystem (read/write)' },
  }),
  backend: new LangchainWorkspace(ws),
})

const task =
  "Create /hello.txt with 'Hello from Mirage!' and /data/numbers.csv " +
  'with columns name,value and 3 sample rows. Then list all files.'

const result = await agent.invoke({
  messages: [{ role: 'user', content: task }],
})

for (const text of extractText(result.messages)) {
  console.log(text)
}

console.log('\n--- Files in workspace ---')
const findAll = await ws.execute('find / -type f')
const findOut = findAll.stdoutText
console.log(findOut)

for (const path of findOut.trim().split('\n').filter(Boolean)) {
  const content = await ws.fs.readFileText(path)
  console.log(`cat ${path}:\n${content}`)
}

const records = ws.records
if (records.length > 0) {
  const total = records.reduce((sum, r) => sum + r.bytes, 0)
  console.log(`\n--- ${records.length} ops, ${total.toLocaleString()} bytes ---`)
  for (const r of records) {
    console.log(
      `  ${r.op.padEnd(8)} ${r.source.padEnd(8)} ` +
        `${String(r.bytes).padStart(10)} B ` +
        `${String(r.durationMs).padStart(5)} ms  ${r.path}`,
    )
  }
}
```

VERIFY:

- `createDeepAgent` is the actual factory name (read `node_modules/deepagents/dist/index.d.ts` for the export name — could be `createDeepAgent`, `create_deep_agent`, or `createAgent`).
- `result.messages` type — what does `agent.invoke({messages: [...]})` actually return? May be `{ messages: BaseMessage[] }` or similar. Adjust if needed.
- `ChatAnthropic` constructor signature.

If any of these diverge, adjust per the actual `deepagents` package types. Do NOT guess.

**Commit:**

```bash
git add examples/typescript/agents/langchain/ram_deepagent.ts
git commit -m "feat(examples/ts): add langchain ram_deepagent example"
```

______________________________________________________________________

## Task 8: Write `s3_deepagent.ts` example

**Files:**

- Create: `examples/typescript/agents/langchain/s3_deepagent.ts`

Mirror Python's `examples/python/agents/langchain/s3_deepagent.py`. Add early env-var guards for AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, ANTHROPIC_API_KEY (matches the env-guard pattern from the OpenAI multi_resource_agent).

Use the same setup/verification scaffolding as `ram_deepagent.ts`. Run two tasks sequentially (Python parity), print extracted text + records dump.

**Commit:**

```bash
git add examples/typescript/agents/langchain/s3_deepagent.ts
git commit -m "feat(examples/ts): add langchain s3_deepagent example"
```

______________________________________________________________________

## Task 9: Final verification sweep

1. `pnpm --filter @struktoai/mirage-agents build` — emits `dist/index.js`, `dist/openai/index.js`, `dist/langchain/index.js`.
1. `pnpm --filter @struktoai/mirage-agents test` — total tests pass: 17 (existing) + 5 (extractText) + 9 (convert) + 18 (backend) = **49**.
1. `pnpm --filter @struktoai/mirage-agents typecheck` — 0 errors.
1. `pnpm exec eslint packages/agents/src` — 0 errors.
1. Run the lint-only scoped pre-commit on the new files (mirror Task 10 of the OpenAI plan).
1. Smoke-test `ram_deepagent.ts` against live Anthropic API if `ANTHROPIC_API_KEY` set (defer to user — don't run unattended).

______________________________________________________________________

## Out of scope

- **V2 protocol implementation** — `SandboxBackendProtocol` aliases V1; matches Python parity. V2 can be added later if/when needed.
- **Sync API surface** — Python's backend wraps async with `asyncio.run` to expose sync methods because Python's protocol allows sync. TS `MaybePromise<T>` makes async-only natural; no sync wrappers.
- **`create_at` accuracy in `readRaw`** — `FileStat` only exposes `modified`. We use that for both `created_at` and `modified_at`. Adding real `created` would require core API changes.
- **Streaming `agent.stream()`** — examples use `invoke()` for parity with Python.
- **Custom MIME detection beyond extensions** — the `mimeFor` helper is deliberately simple. If users need richer detection, they can implement their own backend.
