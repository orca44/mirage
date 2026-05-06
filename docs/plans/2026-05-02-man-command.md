# `man` shell builtin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `man` shell builtin that prints a cross-resource view (description, options, RESOURCES list) for any command, plus an index of all commands grouped by resource when called with no args.

**Architecture:** `man` is a shell builtin (like `whoami`/`printenv`/`cd`), not a registered general command. The dispatch site already has `MountRegistry` in scope, so no new plumbing is needed on `CommandOpts`. Adds optional `description` fields to `CommandSpec` and `Option` (no breaking changes). Backfills descriptions on all general commands; resource-specific descriptions deferred.

**Tech Stack:** TypeScript, vitest, existing mirage core (`typescript/packages/core`).

**Design doc:** [docs/plans/2026-05-02-man-command-design.md](2026-05-02-man-command-design.md)

**Precedent:** [whoami builtin design](2026-05-02-whoami-builtin-design.md) — same architecture pattern.

______________________________________________________________________

## Task 1: Add `description` field to `CommandSpec` and `Option`

**Files:**

- Modify: `typescript/packages/core/src/commands/spec/types.ts`
- Test: `typescript/packages/core/src/commands/spec/types.test.ts` (new)

**Step 1: Write the failing tests**

Create `typescript/packages/core/src/commands/spec/types.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { CommandSpec, Option } from './types.ts'

describe('CommandSpec.description', () => {
  it('defaults to null', () => {
    const spec = new CommandSpec()
    expect(spec.description).toBeNull()
  })

  it('round-trips an explicit value', () => {
    const spec = new CommandSpec({ description: 'do a thing' })
    expect(spec.description).toBe('do a thing')
  })
})

describe('Option.description', () => {
  it('defaults to null', () => {
    const opt = new Option({ short: 'n' })
    expect(opt.description).toBeNull()
  })

  it('round-trips an explicit value', () => {
    const opt = new Option({ short: 'n', description: 'number lines' })
    expect(opt.description).toBe('number lines')
  })
})
```

**Step 2: Run tests — verify they fail**

Run: `cd typescript && pnpm --filter @struktoai/mirage-core test src/commands/spec/types.test.ts`
Expected: FAIL with "Property 'description' does not exist" or similar.

**Step 3: Implement**

Edit `typescript/packages/core/src/commands/spec/types.ts`:

- In `OptionInit` interface, add: `description?: string`
- In `Option` class:
  - Add field: `readonly description: string | null`
  - In constructor: `this.description = init.description ?? null` (before `Object.freeze(this)`)
- In `CommandSpecInit` interface, add: `description?: string`
- In `CommandSpec` class:
  - Add field: `readonly description: string | null`
  - In constructor: `this.description = init.description ?? null`

**Step 4: Run tests — verify they pass**

Run: `cd typescript && pnpm --filter @struktoai/mirage-core test src/commands/spec/types.test.ts`
Expected: PASS (4 tests).

**Step 5: Commit**

```bash
git add typescript/packages/core/src/commands/spec/types.ts \
        typescript/packages/core/src/commands/spec/types.test.ts
git commit -m "feat(ts): add optional description fields to CommandSpec and Option"
```

______________________________________________________________________

## Task 2: Add `MAN` to the `ShellBuiltin` enum

**Files:**

- Modify: `typescript/packages/core/src/shell/types.ts`

**Step 1: Edit the enum**

In `typescript/packages/core/src/shell/types.ts` around [line 140](../../typescript/packages/core/src/shell/types.ts#L140), add `MAN: 'man'` to the `ShellBuiltin` table. Place alphabetically (between `LOCAL` and `PRINTENV`, or wherever the existing pattern dictates).

**Step 2: Confirm no behavior changes yet**

Run: `cd typescript && pnpm --filter @struktoai/mirage-core test`
Expected: PASS (no behavior change yet — the dispatch branch doesn't exist).

**Step 3: Commit**

```bash
git add typescript/packages/core/src/shell/types.ts
git commit -m "feat(ts): add MAN to ShellBuiltin enum"
```

______________________________________________________________________

## Task 3: Implement `handleMan` — entry mode (`man <cmd>`)

**Files:**

- Modify: `typescript/packages/core/src/workspace/executor/builtins.ts`
- Modify: `typescript/packages/core/src/workspace/executor/builtins.test.ts`

**Step 1: Read the existing patterns**

Read `handleWhoami` ([builtins.ts:121-133](../../typescript/packages/core/src/workspace/executor/builtins.ts#L121-L133)) and `handleCd` ([builtins.ts:29-79](../../typescript/packages/core/src/workspace/executor/builtins.ts#L29-L79)) to match the `Result` triple shape and how injected dependencies are passed.

**Step 2: Write the failing tests**

Add to `typescript/packages/core/src/workspace/executor/builtins.test.ts` (look at how existing `handleWhoami`/`handlePrintenv` tests construct a Session and call the handler — match that pattern). Tests:

```ts
describe('handleMan', () => {
  it('renders header, description, and RESOURCES list for a known command', async () => {
    const registry = new MountRegistry({ '/ram/': new RAMResource() }, MountMode.WRITE)
    const session = makeSession({ cwd: '/' })
    const [body, io] = handleMan(['date'], session, registry)
    const out = await readBody(body)
    expect(io.exitCode ?? 0).toBe(0)
    expect(out).toContain('# date')
    expect(out).toContain('## RESOURCES')
    expect(out).toContain('- general')
  })

  it('renders OPTIONS table when the spec has options', async () => {
    const registry = new MountRegistry({ '/ram/': new RAMResource() }, MountMode.WRITE)
    const session = makeSession({ cwd: '/' })
    const [body] = handleMan(['date'], session, registry)
    const out = await readBody(body)
    expect(out).toContain('## OPTIONS')
  })

  it('dedupes by resource kind across multiple mounts of the same resource', async () => {
    const registry = new MountRegistry(
      { '/ram-a/': new RAMResource(), '/ram-b/': new RAMResource() },
      MountMode.WRITE,
    )
    const session = makeSession({ cwd: '/' })
    // Use a command that RAMResource registers (verify the name by reading RAMResource.commands()).
    const [body] = handleMan(['ls'], session, registry)
    const out = await readBody(body)
    const matches = (out.match(/^- ram\b/gm) ?? []).length
    expect(matches).toBe(1)
  })

  it('exits 1 with a clear error for unknown commands', async () => {
    const registry = new MountRegistry({ '/ram/': new RAMResource() }, MountMode.WRITE)
    const session = makeSession({ cwd: '/' })
    const [, io] = handleMan(['definitely-not-a-real-command-xyz'], session, registry)
    expect(io.exitCode).toBe(1)
    const stderr = new TextDecoder().decode(io.stderr ?? new Uint8Array())
    expect(stderr).toContain('no entry for definitely-not-a-real-command-xyz')
  })
})
```

(Helpers `makeSession` and `readBody` likely exist in the test file already — reuse them. If not, follow how `handleWhoami` is tested.)

**Step 3: Run tests — verify they fail**

Run: `cd typescript && pnpm --filter @struktoai/mirage-core test src/workspace/executor/builtins.test.ts`
Expected: FAIL — `handleMan` does not exist.

**Step 4: Implement `handleMan` (entry mode only)**

In `typescript/packages/core/src/workspace/executor/builtins.ts`, add (place near `handleWhoami`):

```ts
import type { MountRegistry } from '../mount/registry.ts'
import type { Mount } from '../mount/mount.ts'
import type { RegisteredCommand } from '../../commands/config.ts'

const DEV_PREFIX = '/dev/'

interface ManHit {
  mount: Mount
  cmd: RegisteredCommand
  isGeneral: boolean
}

function collectManHits(name: string, registry: MountRegistry): ManHit[] {
  const hits: ManHit[] = []
  for (const mount of registry.allMounts()) {
    if (mount.prefix === DEV_PREFIX) continue
    const cmd = mount.resolveCommand(name)
    if (cmd === null) continue
    hits.push({ mount, cmd, isGeneral: mount.isGeneralCommand(name) })
  }
  return hits
}

function renderManEntry(name: string, hits: ManHit[]): string {
  const first = hits[0]
  if (first === undefined) return ''
  const spec = first.cmd.spec
  const lines: string[] = []
  lines.push(`# ${name}`, '')
  lines.push(spec.description ?? '(no description)', '')
  if (spec.options.length > 0) {
    lines.push('## OPTIONS', '')
    lines.push('| short | long | value | description |')
    lines.push('| ----- | ---- | ----- | ----------- |')
    for (const opt of spec.options) {
      const short = opt.short !== null ? `-${opt.short}` : ''
      const long = opt.long !== null ? `--${opt.long}` : ''
      lines.push(`| ${short} | ${long} | ${opt.valueKind} | ${opt.description ?? ''} |`)
    }
    lines.push('')
  }
  lines.push('## RESOURCES', '')
  const seen = new Set<string>()
  let hasGeneral = false
  const rows: string[] = []
  for (const h of hits) {
    if (h.isGeneral) {
      hasGeneral = true
      continue
    }
    const kind = h.mount.resource.kind
    const filetype = h.cmd.filetype
    const key = `${kind}\u0000${filetype ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push(filetype !== null ? `- ${kind} (filetype: ${filetype})` : `- ${kind}`)
  }
  rows.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  if (hasGeneral) lines.push('- general')
  for (const r of rows) lines.push(r)
  return lines.join('\n') + '\n'
}

export function handleMan(args: string[], _session: Session, registry: MountRegistry): Result {
  if (args.length === 0) {
    // Index mode — implemented in Task 4.
    const err = new TextEncoder().encode('man: index mode not implemented\n')
    return [
      null,
      new IOResult({ exitCode: 2, stderr: err }),
      new ExecutionNode({ command: 'man', exitCode: 2, stderr: err }),
    ]
  }
  const name = args[0] as string
  const hits = collectManHits(name, registry)
  if (hits.length === 0) {
    const err = new TextEncoder().encode(`man: no entry for ${name}\n`)
    return [
      null,
      new IOResult({ exitCode: 1, stderr: err }),
      new ExecutionNode({ command: `man ${name}`, exitCode: 1, stderr: err }),
    ]
  }
  const out = new TextEncoder().encode(renderManEntry(name, hits))
  return [out, new IOResult(), new ExecutionNode({ command: `man ${name}`, exitCode: 0 })]
}
```

**Step 5: Run tests — verify they pass**

Run: `cd typescript && pnpm --filter @struktoai/mirage-core test src/workspace/executor/builtins.test.ts`
Expected: PASS for the entry-mode and unknown-command tests; index-mode test still fails (expected — that's Task 4).

**Step 6: Commit**

```bash
git add typescript/packages/core/src/workspace/executor/builtins.ts \
        typescript/packages/core/src/workspace/executor/builtins.test.ts
git commit -m "feat(ts): add handleMan entry mode (man <cmd>)"
```

______________________________________________________________________

## Task 4: Implement `handleMan` — index mode (no args)

**Files:**

- Modify: `typescript/packages/core/src/workspace/executor/builtins.ts`
- Modify: `typescript/packages/core/src/workspace/executor/builtins.test.ts`

**Step 1: Add failing tests**

Append to the `describe('handleMan', ...)` block:

```ts
it('groups commands by resource kind, cwd resource first, general last', async () => {
  const registry = new MountRegistry({ '/ram/': new RAMResource() }, MountMode.WRITE)
  const session = makeSession({ cwd: '/ram/' })
  const [body, io] = handleMan([], session, registry)
  const out = await readBody(body)
  expect(io.exitCode ?? 0).toBe(0)
  const ramIdx = out.indexOf('# ram')
  const generalIdx = out.indexOf('# general')
  expect(ramIdx).toBeGreaterThanOrEqual(0)
  expect(generalIdx).toBeGreaterThan(ramIdx)
})

it('dedupes when the same resource kind is mounted at multiple prefixes', async () => {
  const registry = new MountRegistry(
    { '/ram-a/': new RAMResource(), '/ram-b/': new RAMResource() },
    MountMode.WRITE,
  )
  const session = makeSession({ cwd: '/' })
  const [body] = handleMan([], session, registry)
  const out = await readBody(body)
  const matches = (out.match(/^# ram\b/gm) ?? []).length
  expect(matches).toBe(1)
})
```

**Step 2: Run tests — verify they fail**

Run: `cd typescript && pnpm --filter @struktoai/mirage-core test src/workspace/executor/builtins.test.ts`
Expected: index tests FAIL (placeholder still returns exit 2).

**Step 3: Implement `renderManIndex` and wire it in**

Add to `builtins.ts` (next to `renderManEntry`):

```ts
function renderManIndex(session: Session, registry: MountRegistry): string {
  const byKind = new Map<string, Mount>()
  for (const m of registry.allMounts()) {
    if (m.prefix === DEV_PREFIX) continue
    if (!byKind.has(m.resource.kind)) byKind.set(m.resource.kind, m)
  }
  const cwdMount = registry.mountFor(session.cwd)
  const cwdKind = cwdMount !== null && cwdMount.prefix !== DEV_PREFIX ? cwdMount.resource.kind : null

  const kinds = [...byKind.keys()].sort()
  const ordered: string[] = []
  if (cwdKind !== null && byKind.has(cwdKind)) ordered.push(cwdKind)
  for (const k of kinds) {
    if (k === cwdKind) continue
    ordered.push(k)
  }

  const lines: string[] = []
  const generalSeen = new Map<string, RegisteredCommand>()
  for (const kind of ordered) {
    const m = byKind.get(kind) as Mount
    lines.push(`# ${kind}`, '')
    const allCmds = m.allCommands()
    const resourceCmds = allCmds
      .filter((c) => !m.isGeneralCommand(c.name))
      .sort((a, b) => (a.name < b.name ? -1 : 1))
    for (const cmd of resourceCmds) {
      lines.push(`- ${cmd.name} — ${cmd.spec.description ?? '(no description)'}`)
    }
    for (const cmd of allCmds) {
      if (m.isGeneralCommand(cmd.name) && !generalSeen.has(cmd.name)) {
        generalSeen.set(cmd.name, cmd)
      }
    }
    lines.push('')
  }
  lines.push('# general', '')
  for (const [name, cmd] of [...generalSeen.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    lines.push(`- ${name} — ${cmd.spec.description ?? '(no description)'}`)
  }
  return lines.join('\n') + '\n'
}
```

Replace the index-mode placeholder branch in `handleMan`:

```ts
if (args.length === 0) {
  const out = new TextEncoder().encode(renderManIndex(_session, registry))
  return [out, new IOResult(), new ExecutionNode({ command: 'man', exitCode: 0 })]
}
```

(Rename `_session` → `session` since it's now used.)

**Step 4: Verify `Mount.allCommands()` exists**

Run: `rg -n "allCommands\(" typescript/packages/core/src/workspace/mount/mount.ts`

If not present, add a method to `Mount` returning `readonly RegisteredCommand[]` over both per-mount and general-command tables. Add a small unit test alongside.

**Step 5: Run tests — verify they pass**

Run: `cd typescript && pnpm --filter @struktoai/mirage-core test src/workspace/executor/builtins.test.ts`
Expected: PASS (all `handleMan` tests).

**Step 6: Commit**

```bash
git add typescript/packages/core/src/workspace/executor/builtins.ts \
        typescript/packages/core/src/workspace/executor/builtins.test.ts \
        typescript/packages/core/src/workspace/mount/mount.ts
git commit -m "feat(ts): add handleMan index mode (no args)"
```

______________________________________________________________________

## Task 5: Wire `man` into the shell dispatch

**Files:**

- Modify: `typescript/packages/core/src/workspace/node/execute_node.ts`

**Step 1: Find the dispatch site**

Read [execute_node.ts:540](../../typescript/packages/core/src/workspace/node/execute_node.ts#L540) — the `if (name === SB.WHOAMI) return handleWhoami(session)` line. The `MAN` branch goes next to it.

**Step 2: Add the import**

At the top of `execute_node.ts`, add `handleMan` to the import block from `'../executor/builtins.ts'` (alphabetical).

**Step 3: Add the dispatch branch**

Just below the `SB.WHOAMI` line (around line 540):

```ts
if (name === SB.MAN) return handleMan(finalExpanded.slice(1), session, registry)
```

(Confirm the variable `finalExpanded` matches what other branches use — check lines 537-541.)

**Step 4: Add an end-to-end test**

Append to `builtins.test.ts` (or create a new e2e file if e2e tests live elsewhere — match the pattern used for `whoami` end-to-end tests):

```ts
it('e2e: man date through workspace.exec', async () => {
  const ws = new Workspace({ resources: { '/ram/': new RAMResource() }, defaultMode: MountMode.WRITE })
  const result = await ws.exec('man date')
  expect(result.exitCode).toBe(0)
  const out = result.stdout instanceof Uint8Array ? new TextDecoder().decode(result.stdout) : ''
  expect(out).toContain('# date')
  expect(out).toContain('## RESOURCES')
})
```

(Adjust the workspace API surface to whatever the existing whoami e2e test uses. Read the whoami plan or e2e test first.)

**Step 5: Run tests**

Run: `cd typescript && pnpm --filter @struktoai/mirage-core test`
Expected: PASS (everything).

**Step 6: Commit**

```bash
git add typescript/packages/core/src/workspace/node/execute_node.ts \
        typescript/packages/core/src/workspace/executor/builtins.test.ts
git commit -m "feat(ts): wire man into shell dispatch"
```

______________________________________________________________________

## Task 6: Backfill descriptions on general command specs

One commit per command for reviewability. Each follows the same pattern.

**Pattern (repeat for each of: `bc`, `curl`, `date`, `expr`, `history`, `seq`, `sleep`, `wget`):**

**Step 1: Find the spec**

Run: `rg -n "specOf\('<name>'\)|<NAME>_SPEC\s*=" typescript/packages/core/src --type ts`

**Step 2: Add description to the spec and each option**

Edit the spec to add `description:` on `CommandSpec` and on every `Option`. Imperative mood, ≤80 chars.

Example for `date`:

```ts
new CommandSpec({
  description: 'Print or set the system date and time.',
  options: [
    new Option({ short: 'u', description: 'Use UTC instead of local time.' }),
    new Option({ short: 'd', valueKind: OperandKind.TEXT, description: 'Display the time described by the given string.' }),
    new Option({ short: 'I', description: 'Output an ISO 8601 date.' }),
    new Option({ short: 'R', description: 'Output an RFC 5322 date.' }),
  ],
})
```

**Step 3: Verify with `man <name>`**

Run: `cd typescript && pnpm --filter @struktoai/mirage-core test src/workspace/executor/builtins.test.ts`
Expected: PASS. If a `handleMan` test now sees a real description where it used to see `(no description)`, update the assertion.

**Step 4: Commit**

```bash
git add <files>
git commit -m "feat(ts): add description to <name> spec"
```

(After all 8 commands, you'll have ~8 small commits.)

______________________________________________________________________

## Final check

```bash
cd typescript && pnpm --filter @struktoai/mirage-core test
cd /Users/zecheng/strukto/mirage && ./python/.venv/bin/pre-commit run --all-files
```

Both must pass before opening the PR.

## Out of scope (deferred follow-ups)

- **Python parity.** This plan is TS-only. Python parity is a separate PR; the data-model change to `CommandSpec.description` lands on the Python side independently.
- **Resource-specific description backfill.** s3, gdrive, ramfs, slack, discord, postgres, mongodb, ssh, etc. — one PR per resource. `man` renders `(no description)` until each is filled in.
- **`apropos` / `which` / `compgen` companions.**
