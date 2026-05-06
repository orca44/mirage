# `whoami` Shell Builtin — Design

**Date:** 2026-05-02
**Status:** Approved, ready for implementation plan.

## Goal

Add a `whoami` shell builtin that echoes `$USER` from the session env. When `$USER` is not set, fail loudly with a message on stderr — don't fall through to a default. Parity in Python and TypeScript.

## Why a builtin (not a registered general command)

Three implementation shapes were considered:

1. `WorkspaceOptions.user: string` field, conditionally registered as a `Mount` general command.
1. Always-registered general command that reads env via `CommandOpts`.
1. **Shell builtin that reads `session.env` directly, mirroring `printenv`.** ← chosen.

The builtin shape was chosen because:

- `printenv` already establishes the precedent — env lookup belongs at the shell-builtin layer, with direct `Session` access.
- No new plumbing: `CommandOpts` does not currently carry the env map, and threading it through just for `whoami` is unjustified.
- Per-session identity falls out for free. Different sessions in the same workspace can have different `$USER` values, just like a real shell.
- `export USER=alice` from inside the shell composes naturally — no separate API to learn.
- "Disable when not configured" maps cleanly onto "exit 1 with stderr" (the unix lookup-failure path), without polluting `Mount.commands()` with a sometimes-registered entry.

The builtin **does not** route through `Mount.executeCmd`, so:

- `Mount.isGeneralCommand('whoami')` returns `false`.
- `Mount.commands()` does not list it.
- Cross-mount fallback logic is unaffected.

## Behavior

| `$USER`                  | stdout    | stderr                   | exit code |
| ------------------------ | --------- | ------------------------ | --------- |
| set (e.g. `"alice"`)     | `alice\n` | —                        | 0         |
| unset                    | —         | `whoami: USER not set\n` | 1         |
| set to empty string `""` | `\n`      | —                        | 0         |

No flags. No path arguments. (Real unix `whoami` accepts neither.) Extra arguments are ignored — match `printenv`'s tolerance.

The empty-string case is intentional: an explicitly-set-to-empty `USER` is a configured value (the host said "yes, the user is empty"), distinct from "no `USER` key at all." Don't second-guess the host.

Divergence from real unix `whoami` is acknowledged: real unix uses `geteuid()` + passwd lookup and **ignores** `$USER`. We have no UID concept, so `$USER` is the only identity source available. This is consistent with how the rest of the MIRAGE shell treats env vars as the source of truth.

## Implementation surface

### TypeScript

1. **[`typescript/packages/core/src/shell/types.ts`](typescript/packages/core/src/shell/types.ts)** — add `WHOAMI: 'whoami'` to the shell-builtin name table (alongside `PRINTENV`).
1. **[`typescript/packages/core/src/workspace/executor/builtins.ts`](typescript/packages/core/src/workspace/executor/builtins.ts)** — add `handleWhoami(session: Session): Result`, mirroring [`handlePrintenv`](typescript/packages/core/src/workspace/executor/builtins.ts#L102).
1. **[`typescript/packages/core/src/workspace/node/execute_node.ts`](typescript/packages/core/src/workspace/node/execute_node.ts)** — add a dispatch branch next to the `PRINTENV` branch ([line 536](typescript/packages/core/src/workspace/node/execute_node.ts#L536)):
   ```ts
   if (name === SB.WHOAMI) return handleWhoami(session)
   ```
1. **`typescript/packages/core/src/workspace/executor/builtins.test.ts`** — extend the existing builtin test file with `whoami` cases.

Sketch of `handleWhoami`:

```ts
export function handleWhoami(session: Session): Result {
  const user = session.env.USER
  if (user === undefined) {
    return [
      null,
      new IOResult({
        exitCode: 1,
        stderr: new TextEncoder().encode('whoami: USER not set\n'),
      }),
      new ExecutionNode({ command: 'whoami', exitCode: 1 }),
    ]
  }
  const out = new TextEncoder().encode(`${user}\n`)
  return [out, new IOResult(), new ExecutionNode({ command: 'whoami', exitCode: 0 })]
}
```

### Python

1. **[`python/mirage/shell/types.py`](python/mirage/shell/types.py)** — add `WHOAMI = "whoami"` to the shell-builtin enum (alongside `PRINTENV` at [line 138](python/mirage/shell/types.py#L138)).
1. **[`python/mirage/workspace/executor/builtins.py`](python/mirage/workspace/executor/builtins.py)** — add `async def handle_whoami(session)`, mirroring [`handle_printenv`](python/mirage/workspace/executor/builtins.py#L96).
1. **[`python/mirage/workspace/node/execute_node.py`](python/mirage/workspace/node/execute_node.py)** — add a dispatch branch next to the `PRINTENV` branch ([line 594](python/mirage/workspace/node/execute_node.py#L594)):
   ```python
   if name == SB.WHOAMI:
       return await handle_whoami(session)
   ```
1. Tests in the corresponding pytest file under `python/tests/workspace/executor/`.

## Tests

Per language:

- `whoami` with `USER=alice` in session env → stdout `alice\n`, exit 0, no stderr.
- `whoami` with no `USER` key → stdout empty, stderr `whoami: USER not set\n`, exit 1.
- `whoami` with `USER=""` → stdout `\n`, exit 0, no stderr.
- `whoami extra args ignored` → behaves identically to bare `whoami` (trailing args don't change output).
- Round-trip from inside the shell: `export USER=bob; whoami` → `bob\n`.
- Round-trip after unset: `export USER=carol; unset USER; whoami` → exit 1, stderr `whoami: USER not set\n`.

Cross-language parity test (extend an existing parity test file if one covers shell-builtin shape; otherwise add a focused test): same script run through both runtimes produces byte-identical stdout/stderr/exitCode.

## Out of scope

- `whoami -u`, `-g`, `-G` flags (uid/gid output) — no UID concept in MIRAGE.
- Falling back to `LOGNAME` when `USER` is unset — not requested; trivial follow-up if needed.
- Auto-seeding `USER` from a `WorkspaceOptions.user` field or from the host process env — explicitly rejected. Host code must set `session.env.USER` (directly or via `export`) for the command to work.
- Registering `whoami` in `Mount` general commands — explicitly rejected; it's a shell builtin.

## Open questions

None. Ready for an implementation plan.
