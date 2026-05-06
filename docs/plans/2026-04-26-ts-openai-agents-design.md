# TypeScript OpenAI Agents Integration — Design

**Goal:** Mirror Python's `mirage.agents.openai_agents` in TypeScript so users can build OpenAI Agents SDK apps backed by a Mirage `Workspace`. Ship the editor + shell adapters and prompt helpers that the JS SDK can actually consume today; defer the sandbox surface until OpenAI ports it to JS.

## Scope

In scope:

- New package `@struktoai/mirage-agents` at `typescript/packages/agents/`, with subpath `@struktoai/mirage-agents/openai`
- `MirageEditor` (implements `@openai/agents`'s `Editor` interface)
- `MirageShell` (implements `@openai/agents`'s `Shell` interface)
- `MIRAGE_SYSTEM_PROMPT` constant + `buildSystemPrompt(...)` helper
- Three examples in `examples/typescript/agents/openai/`
- Vitest unit tests for editor + shell (no API key required)

Out of scope (deferred):

- `MirageSandbox*` — the JS SDK has no `BaseSandboxClient` / `SandboxAgent` / `SandboxRunConfig` interfaces to plug into. Hosted-container mode of `shellTool` is OpenAI-managed, not pluggable. When OpenAI ships `agents.sandbox` parity in JS, add this then.
- LangChain/PydanticAI TS adapters (the `agents` package is structured to grow these later as `@struktoai/mirage-agents/langchain` etc.)

## Why a single `@struktoai/mirage-agents` package (not per-integration)

Mirrors Python's `mirage/agents/` directory holding multiple integrations as sibling subpackages. Subpath exports keep peer-deps targeted: importing `@struktoai/mirage-agents/openai` only requires `@openai/agents`; future `@struktoai/mirage-agents/langchain` would only require `langchain`.

Single-package also dodges the awkward name collision with OpenAI's own internal sub-package `@openai/agents-openai`.

## Package layout

```
typescript/packages/agents/
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── src/
    ├── index.ts             # re-exports each integration's namespace
    ├── prompt.ts            # MIRAGE_SYSTEM_PROMPT, buildSystemPrompt (canonical)
    └── openai/
        ├── index.ts         # editor + shell + re-exports prompt
        ├── editor.ts        # MirageEditor
        ├── shell.ts         # MirageShell
        ├── editor.test.ts
        └── shell.test.ts
```

`prompt.ts` lives at the package root because it's intended to be shared across integrations (Python's `langchain/prompt.py` is the canonical home, and `openai_agents/prompt.py` re-exports from it). For TS, top-level keeps it discoverable by future integrations without coupling to one.

## `package.json`

```json
{
  "name": "@struktoai/mirage-agents",
  "version": "0.0.0",
  "type": "module",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./openai": {
      "types": "./dist/openai/index.d.ts",
      "import": "./dist/openai/index.js"
    }
  },
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

Latest OpenAI Agents JS as of 2026-04-26: `@openai/agents` 0.8.5, `@openai/agents-extensions` 0.8.5. Peer dep is `zod` ^4.0.0.

## API surface — `@struktoai/mirage-agents/openai`

### `MirageShell`

```ts
import type { Workspace } from '@struktoai/mirage-core'

export class MirageShell {
  constructor(private ws: Workspace) {}
  async exec(request: ShellRequest): Promise<string>
}
```

Mirrors Python `MirageShellExecutor.__call__`: walk `request.data.action.commands`, call `ws.execute(cmd)` for each, decode stdout/stderr, join with `\n`. Stderr-only output flows through; both → `${stdout}\n${stderr}`.

### `MirageEditor`

```ts
export class MirageEditor {
  constructor(private ws: Workspace) {}
  async createFile(op: ApplyPatchOperation): Promise<ApplyPatchResult>
  async updateFile(op: ApplyPatchOperation): Promise<ApplyPatchResult>
  async deleteFile(op: ApplyPatchOperation): Promise<ApplyPatchResult>
}
```

Mirrors Python `MirageEditor` create/update/delete:

- `createFile`: `mkdir -p` parent (swallow already-exists), `applyDiff('', op.diff, mode: 'create')`, `ws.ops.write` UTF-8, return `{ status: 'completed' }`.
- `updateFile`: `ws.ops.read` (catch not-found → `{ status: 'failed', output: 'File not found: ${path}' }`), decode, `applyDiff(current, op.diff)`, `ws.ops.write`, return completed.
- `deleteFile`: `ws.ops.unlink` (catch not-found → failed), return completed.

The exact `applyDiff` import comes from `@openai/agents` if exposed; otherwise re-port the Python `agents.apply_diff` algorithm. Pinned during implementation.

### Prompt module

```ts
export const MIRAGE_SYSTEM_PROMPT: string  // byte-identical to Python's

export function buildSystemPrompt(opts?: {
  workspace?: Workspace
  mountInfo?: Record<string, string>
  extraInstructions?: string
}): string
```

Identical control flow to Python's `build_system_prompt`: prepend `MIRAGE_SYSTEM_PROMPT`, append `workspace.filePrompt` if `workspace` is given, else format `mountInfo` map, then append `extraInstructions`.

### `src/openai/index.ts`

Exports: `MirageEditor`, `MirageShell`, `MIRAGE_SYSTEM_PROMPT`, `buildSystemPrompt`. Nothing else.

## Examples

Three examples in `examples/typescript/agents/openai/`.

### `ram_agent.ts`

Mirrors Python `examples/python/agents/openai_agents/ram_agent.py`.

- `RAMResource` mounted at `/`, `Workspace` in WRITE mode
- `buildSystemPrompt({ mountInfo: { '/': 'In-memory filesystem (read/write)' }, extraInstructions: '...' })`
- `new Agent({ name, model: 'gpt-5.4-mini', instructions, tools: [shellTool({ shell: new MirageShell(ws) }), applyPatchTool({ editor: new MirageEditor(ws) })] })`
- Same task as Python: create `/hello.txt`, mkdir `/data`, write CSV, list+cat
- Verification: `ws.execute('find / -type f')`, cat each file, dump `ws.ops.records`

### `multi_resource_agent.ts`

Mirrors Python `examples/python/agents/openai_agents/sandbox_agent.py` — minus the Sandbox plumbing.

- Mounts: `/` → RAM (WRITE), `/s3` → S3 (READ), `/slack` → Slack (READ)
- `buildSystemPrompt({ workspace: ws })` (uses `Workspace.filePrompt`)
- Standard `Agent` + `Runner.run` (no `SandboxRunConfig` since none exists in JS SDK)
- Same task as Python: latest Slack message in general; summarize parquet in `/s3/data/`; write `/report.txt`
- Verification: `find / -type f`, dump file list

### `snapshot.ts`

The persist/hydrate demo decoupled from agent run — covers what Python's `sandbox_agent.py` shows post-`hydrate_workspace`.

- Build the same multi-mount workspace, run a small agent task to populate `/report.txt`
- `Workspace.save(stream)` → buffer → `Workspace.load(buffer)` into a fresh workspace with the same mount shape
- Diff file lists + per-file content match
- Cat `/report.txt` from the restored workspace

### Common conventions

- Run via `tsx` (matches existing `examples/typescript/` setup)
- `dotenv` config: load `.env.development` from repo root
- `examples/typescript/package.json` deps gain: `@struktoai/mirage-agents` (workspace:\*), `@openai/agents` ^0.8.0, `zod` ^4.0.0

## Tests

Two vitest files in `typescript/packages/agents/src/openai/`. Both run against a real `RAMResource`-backed `Workspace` — no `OPENAI_API_KEY` needed.

### `editor.test.ts`

- `createFile` writes content; verify with `ws.ops.read`
- `createFile` auto-mkdirs missing parent
- `createFile` is idempotent on existing parent
- `updateFile` applies a diff; verify result
- `updateFile` returns `{ status: 'failed', output: 'File not found: ...' }` for missing path
- `deleteFile` removes; subsequent `ws.ops.read` rejects
- `deleteFile` returns failed for missing path

### `shell.test.ts`

- Single command — stdout returned as string
- Multi-command request — outputs joined with `\n`
- Stderr-only output flows through
- Both stdout+stderr → `${stdout}\n${stderr}` ordering
- Empty stdout/stderr → empty string

Test request/op literals are minimal hand-built shapes matching `@openai/agents`'s `Shell.exec` request and `Editor` op types; tests target the adapter classes directly, no need to invoke the tool factories.

Examples are not part of CI (need API key + live network). Vitest is the CI signal.

## Out-of-scope, captured

- **`MirageSandbox*`** — `@openai/agents` 0.8.5 has no sandbox abstraction. Python `agents.sandbox` provides `SandboxAgent`, `BaseSandboxClient`, `UnixLocalSandboxClient`, `Manifest`, `SandboxRunConfig`, `LocalSnapshotSpec`. None exist in JS. When parity lands in JS, add `MirageSandbox` modeled on Python.
- **Codex tool wrapper** — `codexTool` from `@openai/agents-extensions/experimental/codex` runs Codex in a `workingDirectory`, requiring a real on-disk path. Mirage-backing it would need FUSE mount lifecycle plumbing (`@struktoai/mirage-node` `FuseManager`); orthogonal to this package's scope.
- **`MirageWorkspaceTools` sugar factory** — bundling `[shellTool, applyPatchTool]` + instructions into one call saves ~4 lines but adds an abstraction the SDK doesn't shape. Users compose primitives directly.
