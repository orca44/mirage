# `man` builtin — design

## Goal

Give the LLM agent a single command to discover and inspect mirage commands across resources. Two failure modes this targets:

1. The agent doesn't know a command exists in the current resource.
1. The agent hallucinates flags that the resolved command doesn't accept.

## Non-goals

- No fuzzy matching / "did you mean" in v1.
- No `apropos` / `which` / `compgen` companions in v1 — `man` only.
- No virtual `/dev/commands/` filesystem surface — unix-style command, not files.
- No backward-compat shims (per repo CLAUDE.md).

## Surface

`man` is a **shell builtin**, registered alongside `whoami`, `printenv`, `cd`. Always available, intercepted by the shell layer — does not route through `Mount.executeCmd`.

### Why shell builtin (not a registered general command)

Direct precedent: [whoami](2026-05-02-whoami-builtin-design.md). Same reasoning applies:

- `man` is pure introspection of system state (registry/mounts/commands), not an operation on a resource.
- Shell-builtin handlers already receive `MountRegistry` in scope at the dispatch site ([execute_node.ts:84](../../typescript/packages/core/src/workspace/node/execute_node.ts#L84)) — no new plumbing on `CommandOpts`.
- Doesn't pollute `Mount.commands()` with an entry that has no mount-resource interaction.
- `Mount.isGeneralCommand('man')` returns `false`. Cross-mount fallback logic ([registry.ts:283-313](../../typescript/packages/core/src/workspace/mount/registry.ts#L283-L313)) stays untouched.

Three invocations:

| Invocation   | Behavior                                                                   |
| ------------ | -------------------------------------------------------------------------- |
| `man <cmd>`  | Cross-mount entry: description, options table, and a `MOUNTS` table.       |
| `man`        | Index: all commands grouped by mount. Cwd's mount first, others by prefix. |
| `man <miss>` | Exits non-zero with `man: no entry for <miss>`.                            |

### Output format (option B — compact Markdown)

`man <cmd>`:

```
# <name>

<description>

## OPTIONS

| short | long          | value | description                  |
| ----- | ------------- | ----- | ---------------------------- |
| -n    |               |       | Number output lines.         |
|       | --version-id  | text  | Specific version to read.    |

## RESOURCES

- general
- s3
- gdrive
- ramfs (filetype: py)
```

The `RESOURCES` section is a flat list, deduped by `resource.kind`. A row gets `(filetype: <ext>)` only if that command registration is filetype-scoped. `general` appears once if the command is registered as general. Mode (READ/WRITE/EXEC), prefix, and write/read are intentionally omitted — they're mount-state, not command-capability. Agents that need mount mode learn it from a separate surface (e.g. `ls /`).

`man` (no args):

```
# s3
- cat — Concatenate and print file contents.
- ls — ...

# gdrive
- cat — ...

# general
- bc — ...
- curl — ...
```

Index view groups by `resource.kind`, not mount prefix. Cwd's resource first, others alphabetical, `general` last.

Cross commands (`src→dst`, e.g. `cp`) appear under both source and destination resource sections (or as a dedicated `cross` section — TBD when implementing).

## Data model

Two optional fields, no breaking changes:

```ts
// commands/spec/types.ts
interface CommandSpecInit {
  description?: string  // ~80-char synopsis
  // ...existing
}

interface OptionInit {
  description?: string
  // ...existing
}
```

Both default to `null` on the class. `Operand` stays bare — positionals are too generic to describe meaningfully.

**Placement rationale:** descriptions live on the shared `CommandSpec` (one canonical description per command name), not on each `RegisteredCommand`. Most commands' prose is the same regardless of resource; cross-resource variation is captured structurally in the RESOURCES list. If a future resource genuinely needs different prose for the same command, revisit and add an optional override on `RegisteredCommand`.

## Backfill scope (v1)

In-scope:

- All general specs in `commands/spec/builtins.ts` and `commands/builtin/general/*.ts`.
- The new `man` spec itself.

Out-of-scope (deferred to follow-up PRs, per resource):

- Resource-specific commands (s3, gdrive, ramfs, slack, discord, postgres, mongodb, ssh, etc.).

For commands without a description, `man` renders `(no description)` in the synopsis line and the options table shows `—` in the description column.

## Implementation

### File layout (TypeScript)

- Modified: `typescript/packages/core/src/shell/types.ts` — add `MAN: 'man'` to the `ShellBuiltin` table.
- Modified: `typescript/packages/core/src/workspace/executor/builtins.ts` — add `handleMan(args, session, registry)` mirroring `handleWhoami`.
- Modified: `typescript/packages/core/src/workspace/node/execute_node.ts` — add dispatch branch next to `SB.WHOAMI` at line 540.
- Modified: `typescript/packages/core/src/commands/spec/types.ts` — add `description` to `CommandSpecInit` and `OptionInit`.
- Modified: `typescript/packages/core/src/commands/spec/builtins.ts` and `commands/builtin/general/*.ts` — backfill descriptions on existing general specs.
- Test: `typescript/packages/core/src/workspace/executor/builtins.test.ts` — extend with `man` cases.

### Handler shape

```ts
handleMan(args: string[], session: Session, registry: MountRegistry): Result
  if args.length === 0 → renderIndex(session, registry)
  else → renderEntry(args[0], registry)
```

`renderIndex(session, registry)`:

- Walk `registry.allMounts()`, dedupe by `resource.kind` (so two `/s3-prod/` and `/s3-staging/` mounts collapse into one `s3` section).
- For each non-`/dev/` resource, list its registered commands (excluding generals — those are deduped into a separate "general" section).
- Sort: cwd's resource first (via `registry.mountFor(session.cwd)?.resource.kind`), others alphabetically by kind, "general" last.
- Render Markdown bytes wrapped in a `Result` triple `[ByteSource, IOResult, ExecutionNode]`.

`renderEntry(name, registry)`:

- Walk all mounts; collect every `RegisteredCommand` matching `name` via `mount.resolveCommand(name)`.
- Dedupe by `(resource.kind, filetype)` tuple. General entries collapse to one `general` row.
- For cross commands, list both source and destination resources.
- Render: header (name) → description → options table (from `cmd.spec.options`) → RESOURCES list.
- Missing entry → exit code 1, stderr `man: no entry for <name>\n`.

### Registry access

No new plumbing — the dispatch site at [execute_node.ts:540](../../typescript/packages/core/src/workspace/node/execute_node.ts#L540) already has `registry: MountRegistry` in scope (from `deps.registry`). `handleMan` takes it as a parameter, the same way `handleCd` takes `dispatch` and `isMountRoot`.

### Edge cases

- **Hidden mounts (`/dev/`)** — excluded from both index and entry views.
- **Default mount (`/_default/`)** — its resource is included in both, named after `resource.kind`.
- **Filetype-specific commands** — shown as `(filetype: <ext>)` next to the resource name.
- **Same resource kind mounted multiple times** — collapsed to one entry.
- **No description backfilled yet** — render `(no description)` placeholder.

## Testing

Extend `typescript/packages/core/src/workspace/executor/builtins.test.ts` with:

- `man` with no args returns Markdown index grouped by resource (cwd's resource first).
- `man <general-cmd>` (e.g. `man date`) returns description, options table, and a single `general` row in RESOURCES.
- `man <resource-cmd>` returns one row per matching resource kind.
- `man` for a command implemented by multiple resources lists all of them, deduped.
- `man` for a command on a resource mounted twice (`/s3-prod/`, `/s3-staging/`) shows one `s3` row.
- `man <missing>` exits non-zero with the expected error string.
- `man <cmd>` for a cross command (e.g. `cp`) shows source + destination resources.
- `man <cmd>` where the spec has no description shows `(no description)`.
- `man` excludes `/dev/`.
- Filetype-scoped commands render as `(filetype: <ext>)` next to the resource name.

No integration tests needed — `man` does no I/O.

## Open questions

- **Markdown vs plain text.** Picked Markdown because it's structured enough for an LLM to parse and human-readable. Reconsider if token cost in agent transcripts becomes a concern — could switch to a more compact format later without changing the data model.
- **Python parity.** This design is TS-only. Python parity (mirroring whoami's two-language approach) is a follow-up; the data-model change to `CommandSpec.description` will need to land on the Python side independently.

## Out of scope (future)

- `apropos` / `man -k` for keyword search.
- `which` for "which mount provides this command."
- Per-mount description overrides on `RegisteredCommand`.
- Operand descriptions.
- Backfilling resource-specific command descriptions (one PR per resource).
