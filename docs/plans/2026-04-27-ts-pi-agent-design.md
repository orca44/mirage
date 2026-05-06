# TypeScript pi-coding-agent integration — Design

**Date:** 2026-04-27
**Status:** approved
**Sibling docs:** `2026-04-26-ts-deepagents-plan.md`, OpenAI agents PR #17, deepagents PR #18

## Goal

Add a third agent integration to `@struktoai/mirage-agents` that lets users run
`@mariozechner/pi-coding-agent` against a Mirage Workspace instead of the
local filesystem. Mirrors the structural pattern of the existing
`./openai` and `./langchain` subpaths.

No Python parity exists (pi is TypeScript-only).

## Public API

New subpath: `@struktoai/mirage-agents/pi`

```ts
import {
  mirageExtension,             // ExtensionFactory — registers all 7 tools
  mirageOperations,            // composable per-tool operations adapters
  buildSystemPrompt,           // re-exported from prompt.ts
  MIRAGE_SYSTEM_PROMPT,
} from '@struktoai/mirage-agents/pi'
```

Two surfaces:

- `mirageExtension(ws, opts?)` — primary surface. Returns an `ExtensionFactory`
  (`(pi: ExtensionAPI) => void`). When invoked, registers all seven of pi's
  built-in tools (`read`, `write`, `edit`, `bash`, `grep`, `find`, `ls`)
  with their stock `ToolDefinition` (from pi's own `create<X>ToolDefinition`)
  but with operations injected from the Mirage workspace. This means the
  LLM-facing schemas, prompt snippets, and renderers stay byte-identical to
  pi's defaults — only the file/exec backend is swapped.
- `mirageOperations(ws, opts?)` — composable lower-level escape hatch. Returns
  `{ read, write, edit, bash, grep, find, ls }` where each is a stock pi
  `*Operations` object. Use when you want to construct individual tool
  definitions yourself (e.g. only register a subset, or wrap with extra logic).

## How `mirageExtension` works

```ts
function mirageExtension(ws, opts = {}): ExtensionFactory {
  const cwd = opts.cwd ?? '/'
  const ops = mirageOperations(ws)
  return (pi) => {
    pi.registerTool(createReadToolDefinition(cwd,  { operations: ops.read }))
    pi.registerTool(createWriteToolDefinition(cwd, { operations: ops.write }))
    pi.registerTool(createEditToolDefinition(cwd,  { operations: ops.edit }))
    pi.registerTool(createBashToolDefinition(cwd,  { operations: ops.bash }))
    pi.registerTool(createGrepToolDefinition(cwd,  { operations: ops.grep }))
    pi.registerTool(createFindToolDefinition(cwd,  { operations: ops.find }))
    pi.registerTool(createLsToolDefinition(cwd,    { operations: ops.ls }))
  }
}
```

Pi's own agent-session loop overrides built-ins by name when the extension
registers a tool with the same name (verified: `agent-session.ts` lines
2287-2291). So this gives us full override of the seven built-ins, with
prompt parity and TUI renderers inherited automatically.

## Operations adapter mapping

Each `*Operations` adapter is a thin wrapper around `ws.fs` / `ws.execute`.
All paths from pi are absolute strings already resolved against `cwd`.

| pi Operation                                   | Mirage call                                                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `ReadOperations.readFile(path)`                | `Buffer.from(await ws.fs.readFile(path))`                                                                                                  |
| `ReadOperations.access(path)`                  | `await ws.fs.stat(path)` (throws if missing)                                                                                               |
| `WriteOperations.writeFile(path, content)`     | `await ws.ops.write(path, content)`                                                                                                        |
| `WriteOperations.mkdir(dir)`                   | recursive walk calling `ws.fs.mkdir` per segment (mirage `mkdir` is non-recursive)                                                         |
| `EditOperations.{readFile, writeFile, access}` | same as Read/Write                                                                                                                         |
| `BashOperations.exec(cmd, cwd, opts)`          | `const r = await ws.execute(cmd); opts.onData(Buffer.from(r.stdoutText + r.stderrText)); return { exitCode: r.exitCode }`                  |
| `GrepOperations.isDirectory(path)`             | `ws.fs.isDir(path)`                                                                                                                        |
| `GrepOperations.readFile(path)`                | `ws.fs.readFileText(path)`                                                                                                                 |
| `FindOperations.exists(path)`                  | `ws.fs.exists(path)`                                                                                                                       |
| `FindOperations.glob(pattern, cwd, opts)`      | walk `ws.fs.readdir` recursively from `cwd`, filter via `picomatch(pattern)` against the relative path; obey `ignore` patterns and `limit` |
| `LsOperations.exists(path)`                    | `ws.fs.exists(path)`                                                                                                                       |
| `LsOperations.stat(path)`                      | `{ isDirectory: () => await ws.fs.isDir(path) }` (return a thenable-resolving stat object)                                                 |
| `LsOperations.readdir(path)`                   | `ws.fs.readdir(path)`                                                                                                                      |

### Bash adapter notes

- Pi's bash signature has `cwd`, `env`, `signal`, `timeout`. Mirage
  `Workspace.execute` accepts a single command string and returns a
  buffered `IOResult`. We **ignore** `cwd`/`env`/`signal`/`timeout` for the
  first cut (Mirage's virtual shell doesn't model them) and emit all
  output in one `onData` call after completion. Document this limitation
  in the JSDoc.

### Glob adapter (find) — minimal implementation

Pi's `find` tool relies on `glob(pattern, cwd, { ignore, limit })`. We can't
shell out to `find` because pi expects glob semantics (`**/*.ts` etc).
Implementation: BFS over `ws.fs.readdir` from `cwd`, push relative paths
through `picomatch(pattern)`, exclude via `picomatch(ignore[i])`, stop at
`limit`. `picomatch` is already a transitive dep of the workspace.

## Examples

Two examples mirroring the deepagents pair:

- `examples/typescript/agents/pi/ram_pi.ts` — RAM workspace, write-then-list
  task. Uses `getModel('anthropic', 'claude-sonnet-4-6')`.
- `examples/typescript/agents/pi/s3_pi.ts` — S3 mounted READ at `/s3/`,
  two sequential `session.run` calls (explore + count rows). Same env-var
  guard pattern as `s3_deepagent.ts`.

## Tests

`typescript/packages/agents/tests/pi/` — unit tests against a RAM workspace:

- One test per operations adapter (read/write/edit/bash/grep/find/ls)
  exercising happy path + one error case.
- One end-to-end test that constructs a `DefaultResourceLoader` with
  `mirageExtension(ws)`, calls `loader.reload()`, and verifies all seven
  tools appear in the registry under the expected names.

No live LLM tests — agent invocation is smoke-tested manually via examples.

## Dependencies

`packages/agents/package.json`:

- `peerDependencies`: add `@mariozechner/pi-coding-agent`, `@mariozechner/pi-ai`
- `devDependencies`: same packages pinned for tests

`examples/typescript/package.json`:

- `dependencies`: add `@mariozechner/pi-coding-agent`, `@mariozechner/pi-ai`

`tsup.config.ts`: add `src/pi/index.ts` to entry list.
`package.json`: add `./pi` subpath under `exports`.

## Out of scope

- Hook integration (pi's `./hooks` subpath) — different feature, not needed
  for filesystem override.
- Streaming bash output — pi's `onData` callback is invoked once after
  completion (no streaming through Mirage's virtual shell).
- Image MIME detection — `ReadOperations.detectImageMimeType` is left
  unimplemented (optional in the contract).
- TUI customization — we inherit pi's default renderers by reusing the
  stock `ToolDefinition`.
