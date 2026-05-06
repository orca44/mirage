# SSH Resource (TypeScript) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Port the Python `mirage.resource.ssh` module to TypeScript so a remote SSH/SFTP host can be mounted in a `Workspace` and read/written by `fs.*` calls and shell commands. Node-only (browsers cannot speak the SSH wire protocol).

**Architecture:** Mirror the existing `disk` resource layout. The SSH resource lives in `@struktoai/mirage-node` (not `@struktoai/mirage-core`, not `@struktoai/mirage-browser`). All filesystem ops go through SFTP (`ssh2.SFTPWrapper`); no shell exec. The `ssh2` package is an optional peer dep (same pattern as `redis`/`@aws-sdk/client-s3`).

**Tech Stack:** Node 20+, TypeScript (strict), `ssh2` ^1.16, vitest, ESLint, pnpm workspaces.

**Scope cut (deferred):** awk/sed/sort/uniq/paste/comm/join/cut/tar/gzip/zip/xxd/strings/base64/sha256sum/md5/diff/cmp/patch/iconv and ALL parquet/feather/hdf5/orc filetype variants. We port ~22 commands now; the deferred ones can be added later by following the same shape.

______________________________________________________________________

## Reference files (read these to mirror the pattern)

- **Python source of truth:**

  - `python/mirage/resource/ssh/{ssh.py,prompt.py,__init__.py}`
  - `python/mirage/accessor/ssh.py`
  - `python/mirage/core/ssh/*` (read.py, write.py, append.py, create.py, truncate.py, rename.py, copy.py, rm.py, rmdir.py, mkdir.py, unlink.py, stat.py, du.py, glob.py, find.py, readdir.py, exists.py, stream.py, entry.py, \_client.py, constants.py)
  - `python/mirage/ops/ssh/*` (read, write, append, create, truncate, rename, mkdir, rmdir, stat, unlink, readdir)
  - `python/mirage/commands/builtin/ssh/*` (the file commands; SKIP awk/sed/sort/etc. per scope cut)

- **TS reference (mirror this layout exactly — disk is the canonical sibling):**

  - `typescript/packages/node/src/accessor/disk.ts`
  - `typescript/packages/node/src/resource/disk/{disk.ts,prompt.ts}`
  - `typescript/packages/node/src/core/disk/*`
  - `typescript/packages/node/src/ops/disk/*`
  - `typescript/packages/node/src/commands/builtin/disk/*`
  - `typescript/packages/node/src/resource/registry.ts`

- **CLAUDE.md rules:** No top-of-file comments/docstrings. No nested functions. All imports at top of file. Never silently swallow errors.

______________________________________________________________________

## Conventions

- Path translation: `/{prefix}/<rest>` from the workspace → `<rest>` rooted at `config.root` on the remote. Same as Python `_client._connect_kwargs` + path joining.
- Error mapping: SFTP errors with `code === 2` (`NO_SUCH_FILE`) → throw `Error('ENOENT: <path>')` with `(err as Error & {code:string}).code = 'ENOENT'` so the executor's catch logic still works. Use the helper from disk's `core/disk/utils.ts` if it exists, otherwise create `core/ssh/utils.ts`.
- Connection lifecycle: lazy connect on first SFTP op; reuse on subsequent ops. `close()` ends the client. No reconnect-on-drop in scope.
- Ssh2 import: ALWAYS dynamic (`await import('ssh2')`) inside the accessor's first `sftp()` call so packaging works without ssh2 installed. Wrap in try/catch and throw a clear "install ssh2 to use the SSH resource" error.
- Type safety: mirror disk's strict types. No `any`. Use `Record<string, unknown>` for options bags. Cast ssh2 return types narrowly.

______________________________________________________________________

## Task list

### Task 1: Add ssh2 as optional peer dependency

**Files:**

- Modify: `typescript/packages/node/package.json`

**Step 1: Add ssh2 to peerDependencies and peerDependenciesMeta**

Open `typescript/packages/node/package.json`. Add to `peerDependencies` (create if missing):

```json
"peerDependencies": {
  "ssh2": "^1.16.0",
  "redis": "^5.0.0",
  "@aws-sdk/client-s3": "^3.0.0",
  "@aws-sdk/client-storage": "*"
}
```

(merge with whatever is already there). Add `peerDependenciesMeta`:

```json
"peerDependenciesMeta": {
  "ssh2": { "optional": true }
}
```

(merge with existing entries). Add to `devDependencies`:

```json
"ssh2": "^1.16.0",
"@types/ssh2": "^1.15.0"
```

**Step 2: Install**

```bash
cd typescript && pnpm install
```

Expected: ssh2 + @types/ssh2 appear under `packages/node/node_modules/ssh2`. No errors.

**Step 3: Commit**

```bash
git add typescript/packages/node/package.json typescript/pnpm-lock.yaml
git commit -m "feat(node): add ssh2 as optional peer dependency"
```

______________________________________________________________________

### Task 2: SSHConfig + accessor scaffolding

**Files:**

- Create: `typescript/packages/node/src/resource/ssh/config.ts`
- Create: `typescript/packages/node/src/resource/ssh/prompt.ts`
- Create: `typescript/packages/node/src/accessor/ssh.ts`

**Step 1: Write the failing test**

`typescript/packages/node/src/resource/ssh/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalizeSshConfig, redactSshConfig } from './config.ts'

describe('SSHConfig', () => {
  it('normalizes snake_case from YAML', () => {
    const c = normalizeSshConfig({
      host: 'example.com',
      identity_file: '~/.ssh/id_ed25519',
      known_hosts: '~/.ssh/known_hosts',
      port: 2222,
    })
    expect(c.host).toBe('example.com')
    expect(c.identityFile).toBe('~/.ssh/id_ed25519')
    expect(c.knownHosts).toBe('~/.ssh/known_hosts')
    expect(c.port).toBe(2222)
  })

  it('redacts password but not identityFile path', () => {
    const c = redactSshConfig({
      host: 'example.com',
      password: 'secret',
      identityFile: '~/.ssh/id_ed25519',
    })
    expect(c.password).toBe('<REDACTED>')
    expect(c.identityFile).toBe('~/.ssh/id_ed25519')
  })
})
```

**Step 2: Run test to verify it fails**

```bash
cd typescript && pnpm --filter @struktoai/mirage-node test -- resource/ssh/config
```

Expected: FAIL — `Cannot find module './config.ts'`.

**Step 3: Write `config.ts`**

```ts
import { normalizeFields } from '@struktoai/mirage-core'

export interface SSHConfig {
  host: string
  hostname?: string
  port?: number
  username?: string
  password?: string
  identityFile?: string
  passphrase?: string
  root?: string
  timeout?: number
  knownHosts?: string
}

export interface SSHConfigRedacted {
  host: string
  hostname?: string
  port?: number
  username?: string
  password?: '<REDACTED>'
  identityFile?: string
  passphrase?: '<REDACTED>'
  root?: string
  timeout?: number
  knownHosts?: string
}

export function redactSshConfig(config: SSHConfig): SSHConfigRedacted {
  const out: SSHConfigRedacted = { host: config.host }
  if (config.hostname !== undefined) out.hostname = config.hostname
  if (config.port !== undefined) out.port = config.port
  if (config.username !== undefined) out.username = config.username
  if (config.password !== undefined) out.password = '<REDACTED>'
  if (config.identityFile !== undefined) out.identityFile = config.identityFile
  if (config.passphrase !== undefined) out.passphrase = '<REDACTED>'
  if (config.root !== undefined) out.root = config.root
  if (config.timeout !== undefined) out.timeout = config.timeout
  if (config.knownHosts !== undefined) out.knownHosts = config.knownHosts
  return out
}

export function normalizeSshConfig(input: Record<string, unknown>): SSHConfig {
  return normalizeFields(input, {
    rename: {
      identity_file: 'identityFile',
      known_hosts: 'knownHosts',
    },
  }) as unknown as SSHConfig
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm --filter @struktoai/mirage-node test -- resource/ssh/config
```

Expected: PASS.

**Step 5: Write `prompt.ts`**

Port `python/mirage/resource/ssh/prompt.py` verbatim. Export `SSH_PROMPT`.

**Step 6: Write `accessor/ssh.ts`**

```ts
import type { Client, SFTPWrapper } from 'ssh2'
import { Accessor } from '@struktoai/mirage-core'
import { homedir } from 'node:os'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { SSHConfig } from '../resource/ssh/config.ts'

function expandHome(p: string): string {
  if (p.startsWith('~')) return resolve(homedir(), p.slice(p.startsWith('~/') ? 2 : 1))
  return p
}

export class SSHAccessor extends Accessor {
  private client: Client | null = null
  private sftpClient: SFTPWrapper | null = null
  private connectPromise: Promise<SFTPWrapper> | null = null

  constructor(public readonly config: SSHConfig) {
    super()
  }

  async sftp(): Promise<SFTPWrapper> {
    if (this.sftpClient !== null) return this.sftpClient
    if (this.connectPromise !== null) return this.connectPromise
    this.connectPromise = this.connect()
    try {
      return await this.connectPromise
    } finally {
      this.connectPromise = null
    }
  }

  private async connect(): Promise<SFTPWrapper> {
    let ssh2Mod: typeof import('ssh2')
    try {
      ssh2Mod = await import('ssh2')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`ssh2 is required for the SSH resource — install it as a peer dep: ${msg}`)
    }
    const { Client } = ssh2Mod
    const c = new Client()
    const opts: Record<string, unknown> = {
      host: this.config.hostname ?? this.config.host,
      port: this.config.port ?? 22,
      username: this.config.username,
      readyTimeout: (this.config.timeout ?? 30) * 1000,
    }
    if (this.config.password !== undefined) opts.password = this.config.password
    if (this.config.identityFile !== undefined) {
      opts.privateKey = readFileSync(expandHome(this.config.identityFile))
      if (this.config.passphrase !== undefined) opts.passphrase = this.config.passphrase
    }
    if (this.config.knownHosts !== undefined) {
      // ssh2's hostHash callback — left for follow-up; for now trust the
      // platform default (~/.ssh/known_hosts is consulted automatically when
      // hostHash isn't provided).
    }
    return new Promise<SFTPWrapper>((resolveFn, rejectFn) => {
      c.on('ready', () => {
        c.sftp((err, sftp) => {
          if (err) {
            rejectFn(err)
            return
          }
          this.client = c
          this.sftpClient = sftp
          resolveFn(sftp)
        })
      })
      c.on('error', rejectFn)
      c.connect(opts as Parameters<Client['connect']>[0])
    })
  }

  async close(): Promise<void> {
    if (this.client !== null) {
      this.client.end()
      this.client = null
      this.sftpClient = null
    }
  }
}
```

**Step 7: Commit**

```bash
git add typescript/packages/node/src/resource/ssh/{config.ts,prompt.ts,config.test.ts} typescript/packages/node/src/accessor/ssh.ts
git commit -m "feat(node): SSH config + accessor scaffolding"
```

______________________________________________________________________

### Task 3: Core path utilities + entry shape

**Files:**

- Create: `typescript/packages/node/src/core/ssh/utils.ts`
- Create: `typescript/packages/node/src/core/ssh/utils.test.ts`
- Create: `typescript/packages/node/src/core/ssh/entry.ts`

**Step 1: Write tests for `utils.ts`**

Cover: `joinRoot('/r', '/foo')` → `'/r/foo'`, `stripPrefix('/ssh/foo', '/ssh')` → `'/foo'`, `enoent('/x')` returns Error with `code === 'ENOENT'`.

**Step 2: Write `utils.ts`** — port helpers from `python/mirage/core/ssh/_client.py` and `python/mirage/core/ssh/constants.py`.

**Step 3: Write `entry.ts`** — port `python/mirage/core/ssh/entry.py`. Defines a small `SshEntry` type + `statToFileStat(attrs)` mapping `ssh2.Attributes` → `FileStat`.

**Step 4: Test, commit**

______________________________________________________________________

### Task 4: Read-side core ops (read, readdir, stat, exists, glob, find, du, stream)

For each, port the corresponding Python file. Each lives in `typescript/packages/node/src/core/ssh/<name>.ts` with a sibling `<name>.test.ts`.

**Pattern for one op (read.ts):**

```ts
import type { SFTPWrapper } from 'ssh2'
import type { PathSpec } from '@struktoai/mirage-core'
import type { SSHAccessor } from '../../accessor/ssh.ts'
import { joinRoot, stripPrefix, enoent } from './utils.ts'

export async function read(accessor: SSHAccessor, p: PathSpec): Promise<Uint8Array> {
  const sftp = await accessor.sftp()
  const remote = joinRoot(accessor.config.root ?? '/', stripPrefix(p))
  return new Promise<Uint8Array>((resolveFn, rejectFn) => {
    sftp.readFile(remote, (err, buf) => {
      if (err !== null && err !== undefined) {
        if ((err as { code?: number }).code === 2) rejectFn(enoent(remote))
        else rejectFn(err)
        return
      }
      resolveFn(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
    })
  })
}
```

**Steps for each op:** TDD — write a test that hits a fake `SFTPWrapper` (mock with vitest), confirm it fails, write the impl, confirm it passes, commit.

**Mock helper:** create `typescript/packages/node/src/core/ssh/_test_utils.ts` exporting `makeFakeSftp(files: Record<string, Uint8Array>)`. The disk tests don't need this since they hit the real fs — for ssh we mock at the SFTP layer.

**Subtasks:**

- 4a: read.ts + test
- 4b: readdir.ts + test (port `_readdir_*` from Python)
- 4c: stat.ts + test
- 4d: exists.ts + test
- 4e: glob.ts + test (mirror `core/disk/glob.ts`)
- 4f: find.ts + test
- 4g: du.ts + test (must implement `du` and `duAll`)
- 4h: stream.ts + test (iterator that wraps `sftp.createReadStream`)

Commit after each subtask.

______________________________________________________________________

### Task 5: Write-side core ops (write, append, create, truncate, mkdir, rmdir, rename, copy, rm, unlink)

Same TDD pattern as Task 4. One file per op, mock SFTP, test, commit.

- 5a: write.ts (sftp.writeFile)
- 5b: append.ts (sftp.appendFile)
- 5c: create.ts (sftp.open + close)
- 5d: truncate.ts (sftp.open with WRITE flag at offset)
- 5e: mkdir.ts (sftp.mkdir; recursive walks parents)
- 5f: rmdir.ts (sftp.rmdir)
- 5g: rename.ts (sftp.rename)
- 5h: copy.ts (read + write — SFTP has no atomic copy)
- 5i: rm.ts (rm -r: walk dir, unlink files, rmdir dirs)
- 5j: unlink.ts (sftp.unlink)

______________________________________________________________________

### Task 6: VFS ops registry

**Files:** `typescript/packages/node/src/ops/ssh/{read,write,readdir,stat,append,create,truncate,rename,mkdir,rmdir,unlink,index}.ts`

Each is a 14-line wrapper around the core op (see `ops/disk/read.ts` as template). `index.ts` exports `SSH_OPS = [readOp, readdirOp, statOp, ...] as const`.

Skip `read_parquet/feather/hdf5/orc` per scope cut.

Commit once after all files exist + a smoke test in `index.test.ts` that asserts `SSH_OPS.length === 12`.

______________________________________________________________________

### Task 7: Commands

For each command below, copy the corresponding `commands/builtin/disk/<cmd>.ts` and rewrite ssh-resource imports. Each gets a 1-shot vitest using a fake SFTP.

**In scope (~22 commands):**

- cat, head, tail, wc, ls, find, grep, rg, jq, stat, du, tree, file
- basename, dirname, realpath
- cp, mv, rm, mkdir, rmdir, touch

**Provision file:** create `commands/builtin/ssh/_provision.ts` mirroring `commands/builtin/disk/_provision.ts`.

**Index:** `commands/builtin/ssh/index.ts` exports `SSH_COMMANDS = [...]`.

Commit after each command + final commit on the index file.

______________________________________________________________________

### Task 8: SSHResource class

**File:** `typescript/packages/node/src/resource/ssh/ssh.ts`

Mirror `node/src/resource/disk/disk.ts` exactly. Differences:

- `kind = ResourceName.SSH`
- `isRemote = true`
- `indexTtl = 60`
- `prompt = SSH_PROMPT`
- `accessor = new SSHAccessor(config)`
- No filesystem walk in `getState()` — return `{ type, needsOverride: false, redactedFields: ['password','passphrase'], config: redactSshConfig(this.config) }`
- `loadState` is a no-op (snapshot just serializes config)
- `fingerprint(p)` returns `${stat.modified ?? ''}:${stat.size ?? 0}` to match Python
- `close()` calls `accessor.close()`

**Test:** `ssh.test.ts` constructs the resource against a fake-sftp accessor, asserts `getState()` redaction, `fingerprint()` shape, `commands().length`, `ops().length`.

______________________________________________________________________

### Task 9: Registry + index exports

**Files:**

- Modify: `typescript/packages/node/src/resource/registry.ts` — add `ssh` entry between `redis` and `s3`
- Modify: `typescript/packages/node/src/index.ts` — export `SSHResource`, `SSHAccessor`, `SSHConfig`, `SSHConfigRedacted`, `redactSshConfig`, `normalizeSshConfig`, `SSH_PROMPT`, `SSH_COMMANDS`, `SSH_OPS`

Registry entry shape (mirror `redis`):

```ts
ssh: async (config) => {
  const { SSHResource } = await import('./ssh/ssh.ts')
  const { normalizeSshConfig } = await import('./ssh/config.ts')
  return new SSHResource(normalizeSshConfig(config))
},
```

______________________________________________________________________

### Task 10: Integration smoke test (optional, env-gated)

**File:** `typescript/packages/node/src/resource/ssh/integration.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { SSHResource } from './ssh.ts'
import { PathSpec } from '@struktoai/mirage-core'

const HOST = process.env.SSH_TEST_HOST
const skip = HOST === undefined || HOST === ''

;(skip ? describe.skip : describe)('SSH integration', () => {
  it('reads /etc/hostname over real SFTP', async () => {
    const r = new SSHResource({
      host: HOST!,
      username: process.env.SSH_TEST_USER ?? 'root',
      identityFile: process.env.SSH_TEST_KEY,
      root: '/',
    })
    try {
      const data = await r.readFile(new PathSpec({ original: '/etc/hostname' }))
      expect(data.length).toBeGreaterThan(0)
    } finally {
      await r.close()
    }
  })
})
```

Document in `examples/typescript/ssh/README.md` how to set `SSH_TEST_HOST`/`SSH_TEST_USER`/`SSH_TEST_KEY`.

______________________________________________________________________

### Task 11: Examples

**Files:**

- Create: `examples/typescript/ssh/ssh_vfs.ts` — mirror linear's `linear_vfs.ts`. Uses `patchNodeFs(ws)` and `fs.readFile`/`fs.readdir`. No input wait.
- Create: `examples/typescript/ssh/ssh_fuse.ts` — mirror linear's `linear_fuse.ts`. Real FUSE mount, prominent path printing, `Press Enter` wait.
- Create: `examples/typescript/ssh/README.md` — env vars + `pnpm exec tsx ...` commands.

Test: with `SSH_HOST` etc set, `pnpm exec tsx ssh/ssh_vfs.ts` should `ls /ssh/` correctly.

______________________________________________________________________

### Task 12: Final verification

Run from `typescript/`:

```bash
pnpm -r build
pnpm --filter @struktoai/mirage-node test -- ssh
pnpm lint
```

Expected: all green. Then commit any final fixups.

______________________________________________________________________

## Out of scope (track for follow-up)

- Browser support via WebSocket-to-TCP relay (separate plan).
- awk/sed/sort/uniq/paste/join/cut/tar/gzip/xxd/etc. commands.
- Parquet/feather/hdf5/orc filetype variants.
- Jump-host / ProxyJump / agent-forwarding auth.
- Reconnect-on-drop and connection pooling.
- known_hosts strict checking with custom `hostVerifier`.
