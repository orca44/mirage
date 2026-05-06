# TypeScript pi-coding-agent integration — Implementation Plan

**Date:** 2026-04-27
**Branch:** `feat/ts-pi-agent` (off origin/main)
**Worktree:** `.worktrees/ts-pi-agent/`
**Design:** `2026-04-27-ts-pi-agent-design.md`

## Pre-conditions

- ✅ Worktree created on `feat/ts-pi-agent` off origin/main
- ✅ `.env.development` symlinked into worktree
- ✅ `pnpm install` succeeds in `typescript/`
- ✅ `@mariozechner/pi-coding-agent@0.70.2` and `@mariozechner/pi-ai@0.70.2` installed as devDeps of `@struktoai/mirage-agents`
- ✅ Verified all 7 pi tools accept `operations` injection via `*ToolOptions`

## Working conventions

- All paths in this plan are relative to the worktree root
  (`/Users/zecheng/strukto/mirage/.worktrees/ts-pi-agent/`)
- Run TypeScript commands from `typescript/`
- After each task: `pnpm --filter @struktoai/mirage-agents typecheck && pnpm --filter @struktoai/mirage-agents test` (no full test suite — see memory `feedback_scope_tests_to_changes`)
- Don't add comments at top of files (CLAUDE.md rule)
- No `// removed for X` shims, no backwards-compat — change code directly
- Keep imports at top of files; no nested functions; prefer interfaces over type aliases (eslint enforces)

## Tasks

### Task 1 — Wire package config

**Files:**

- `typescript/packages/agents/package.json` — add `./pi` subpath to `exports`; add `@mariozechner/pi-coding-agent` and `@mariozechner/pi-ai` to `peerDependencies` (already present in `devDependencies` from setup); add `picomatch` and `@types/picomatch` to `devDependencies`
- `typescript/packages/agents/tsup.config.ts` — append `'src/pi/index.ts'` to `entry`
- `typescript/packages/agents/src/pi/index.ts` — placeholder export so build doesn't fail

**Verify:** `pnpm --filter @struktoai/mirage-agents build` succeeds, `dist/pi/index.{js,d.ts}` exist.

### Task 2 — Operations adapters

**File:** `typescript/packages/agents/src/pi/operations.ts`

Implement seven adapters. Each is a small object literal returning the
`*Operations` shape from pi's `dist/core/tools/<name>.d.ts`. Mapping in
the design doc; reproduce verbatim.

**Helpers (module-scope, not nested):**

- `ensureParent(ws, path)` — recursive parent mkdir (loop calling `ws.fs.mkdir`, swallow only `FileExistsError`/already-exists; re-throw everything else with explanatory comment per CLAUDE.md)
- `globWalk(ws, cwd, pattern, opts)` — BFS via `ws.fs.readdir` + `picomatch` filter. Yields relative paths. Honors `ignore[]` and `limit`.

**Public export:**

```ts
export interface MirageOperationsBundle {
  read: ReadOperations
  write: WriteOperations
  edit: EditOperations
  bash: BashOperations
  grep: GrepOperations
  find: FindOperations
  ls: LsOperations
}
export function mirageOperations(ws: Workspace): MirageOperationsBundle
```

**Verify:** `pnpm --filter @struktoai/mirage-agents typecheck`.

### Task 3 — Operations unit tests

**File:** `typescript/packages/agents/src/pi/operations.test.ts`

Vitest test per adapter against a RAM workspace. Cover:

- `read.readFile` returns Buffer; `read.access` throws on missing
- `write.writeFile` writes bytes; `write.mkdir` creates nested dirs
- `edit.{readFile,writeFile,access}` round-trip
- `bash.exec` runs `echo hello` and observes `onData` payload, exitCode 0
- `grep.isDirectory`/`readFile` on a seeded file
- `find.glob` BFS over a seeded tree, returns expected matches; respects `limit`
- `ls.{exists,stat,readdir}` on a seeded dir

**Verify:** `pnpm --filter @struktoai/mirage-agents test src/pi/operations.test.ts`.

### Task 4 — Extension factory

**File:** `typescript/packages/agents/src/pi/extension.ts`

```ts
export interface MirageExtensionOptions {
  cwd?: string  // default '/'
}
export function mirageExtension(ws: Workspace, opts?: MirageExtensionOptions): ExtensionFactory
```

Implementation per design doc — call pi's seven `create<X>ToolDefinition(cwd, { operations })` factories and `pi.registerTool` each.

**Verify:** typecheck.

### Task 5 — End-to-end registration test

**File:** `typescript/packages/agents/src/pi/extension.test.ts`

Construct a `DefaultResourceLoader` with `extensionFactories: [mirageExtension(ws)]`, call `loader.reload()`, then inspect the registered tool names. Assert all seven names present. (No LLM call — registration only.)

**Verify:** test passes.

### Task 6 — Public exports

**File:** `typescript/packages/agents/src/pi/index.ts`

```ts
export { mirageExtension, type MirageExtensionOptions } from './extension.ts'
export { mirageOperations, type MirageOperationsBundle } from './operations.ts'
export { MIRAGE_SYSTEM_PROMPT, buildSystemPrompt } from '../prompt.ts'
export type { BuildSystemPromptOptions } from '../prompt.ts'
```

**Verify:** `pnpm --filter @struktoai/mirage-agents build` produces `dist/pi/index.{js,d.ts}` with the four exports.

### Task 7 — RAM example

**File:** `examples/typescript/agents/pi/ram_pi.ts`

Mirror `examples/typescript/agents/langchain/ram_deepagent.ts` structure:

```ts
import { config as loadEnv } from 'dotenv'
// ...path setup...
import { MountMode, OpsRegistry, RAMResource, Workspace } from '@struktoai/mirage-node'
import { getModel } from '@mariozechner/pi-ai'
import {
  AuthStorage,
  ModelRegistry,
  DefaultResourceLoader,
  SettingsManager,
  getAgentDir,
  createAgentSession,
} from '@mariozechner/pi-coding-agent'
import { mirageExtension, buildSystemPrompt } from '@struktoai/mirage-agents/pi'

// Build ws (RAM, write mode) — same as deepagents
// Build resource loader with extensionFactories: [mirageExtension(ws)]
// Build session with Anthropic model 'claude-sonnet-4-6'
// session.run(taskPrompt) where task is the RAM file-creation task
// Print messages, then dump ws.records
```

Add `examples/typescript/agents/pi` to `examples/typescript/package.json` if needed (likely auto-discovered, mirror existing pattern).

**Verify:** `pnpm --filter examples-ts build` succeeds; eyeball the file.

### Task 8 — S3 example

**File:** `examples/typescript/agents/pi/s3_pi.ts`

Mirror `s3_deepagent.ts`:

- Env-var guards (`AWS_S3_BUCKET`, etc.) via `requireEnv` helper
- S3Resource mounted READ at `/s3/`
- Two sequential `session.run` calls: (1) explore+summarize `/s3/data/`, (2) count rows in parquet/orc/h5 files
- Print message text + `ws.records` table

**Verify:** typecheck.

### Task 9 — Final verification + smoke test

1. From repo root: `./python/.venv/bin/pre-commit run --all-files` — apply autofixes; commit any fixes.
1. From `typescript/`: `pnpm --filter @struktoai/mirage-agents typecheck && pnpm --filter @struktoai/mirage-agents test`.
1. Smoke-test: `cd .worktrees/ts-pi-agent && node --import tsx examples/typescript/agents/pi/ram_pi.ts` (or whatever invocation pattern existing examples use). Verify the agent creates the file and lists it.
1. If `.env.development` has `AWS_*` set: smoke-test `s3_pi.ts` similarly.
1. Final review: read `git diff main...HEAD` end-to-end to catch dead code, missing imports, leaked debug prints.

## Subagent execution

Run via `superpowers:subagent-driven-development` if available, otherwise dispatch
each task to a `general-purpose` agent and review with `superpowers:code-reviewer`
between tasks. Same workflow as PRs #17 and #18.

For each task: implementer agent → spec reviewer → code-quality reviewer →
incorporate feedback → mark task complete in TodoWrite.

## Risks / open issues

- **`picomatch` dep weight** — small (~30KB, no transitive deps), already
  used by lots of node tools; should be fine. If pi pulls in a different
  glob lib transitively, prefer that one.
- **Bash adapter ignores `cwd`/`env`/`signal`/`timeout`** — document in
  JSDoc on `mirageOperations`. If pi tests rely on cwd-relative behavior,
  may need to prepend `cd <cwd> && ` to commands; flag during testing.
- **Find adapter custom glob** — minimal implementation may diverge from pi's
  fd-backed default in edge cases (case sensitivity, hidden files). Match
  `picomatch` defaults to `{ dot: false }` initially; revisit if examples reveal issues.
- **Pi's `DefaultResourceLoader` may try to read from `getAgentDir()`** — if
  the agent dir has user-level config that interferes with tests, pass an
  empty/temp dir in tests.
