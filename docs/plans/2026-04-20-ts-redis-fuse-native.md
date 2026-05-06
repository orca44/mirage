# Redis cache + FUSE + native_exec — TS port (Python-aligned)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Port Redis caches, FUSE mount, and `native_exec` from Python to TypeScript. All three live inside `@struktoai/mirage-node` (no new packages — mirrors Python's "one package + optional extras" model). Add RAM/FUSE and Disk/FUSE examples.

**Architecture:** Heavy native deps (`redis`, `@zkochan/fuse-native`) declared as **optional `peerDependencies`** on `@struktoai/mirage-node`. Code is lazy-loaded so users who skip the extra never see import errors. Browser stays untouched.

**Layout mirrors Python directly:**

| Python                           | TypeScript                                                         |
| -------------------------------- | ------------------------------------------------------------------ |
| `mirage/resource/redis/redis.py` | `@struktoai/mirage-node/src/resource/redis/redis.ts`               |
| `mirage/cache/file/redis.py`     | `@struktoai/mirage-node/src/cache/redis/file.ts`                   |
| `mirage/cache/index/redis.py`    | `@struktoai/mirage-node/src/cache/redis/index_cache.ts`            |
| `mirage/workspace/native.py`     | `@struktoai/mirage-node/src/native.ts`                             |
| `mirage/workspace/fuse.py`       | `@struktoai/mirage-node/src/workspace/fuse.ts` (FuseManager)       |
| `mirage/fuse/fs.py`              | `@struktoai/mirage-node/src/fuse/fs.ts` (MirageFS callbacks)       |
| `mirage/fuse/mount.py`           | `@struktoai/mirage-node/src/fuse/mount.ts` (mount/mountBackground) |
| `mirage/fuse/platform/macos.py`  | `@struktoai/mirage-node/src/fuse/platform/macos.ts`                |

______________________________________________________________________

## Up-front decisions (your earlier questions)

### Q1: DiskResource in browser?

**No.** Browsers can't open arbitrary local paths. `OPFSResource` already covers the role.

### Q2: Redis in browser?

**Node-only for now.** `RedisFileCacheStore` + `RedisIndexCacheStore` + `RedisResource` all live in `@struktoai/mirage-node`, using the `redis` package over TCP. Browser equivalent (Upstash REST or WS proxy) is a separate follow-up plan.

### Why no new packages?

Python ships Redis + FUSE inside the main `mirage` package, gated by `pip install mirage-ai[redis,fuse]`. TS equivalent: optional `peerDependencies` on `@struktoai/mirage-node`. No new packages, no extra publishing burden, lazy-loaded so unused code is free.

### Q3: FUSE — which package? macOS support?

**Use `@zkochan/fuse-native`** (fork maintained by pnpm author Zoltan Kochan). Alternatives rejected:

| Package                    | Weekly DL | Last publish                         | macOS?                                |
| -------------------------- | --------: | ------------------------------------ | ------------------------------------- |
| `fuse-native` (upstream)   |     9,467 | 2020-06                              | Apple Silicon broken (#27 since 2020) |
| **`@zkochan/fuse-native`** |    **27** | **2024-08 / repo pushed 2026-04-14** | **Yes** (via source build + macFUSE)  |
| `@cocalc/fuse-native`      |        36 | 2025-07                              | README explicitly "Linux only"        |

**Platform policy:**

- **Linux (x64)**: prebuild shipped → works out of the box. Host needs `libfuse` installed.
- **macOS (Intel + Apple Silicon)**: no prebuild, but compiles from source via `node-gyp rebuild` if **macFUSE** is installed. User responsibility.
- **Windows**: not supported (FUSE doesn't exist).
- **Linux arm64**: may need source build; upstream mentions flaky tests.

Tests/examples gate on `process.platform === 'linux' || process.platform === 'darwin'` and a runtime `await import('@zkochan/fuse-native')` probe. If the import fails, skip with a clear message about installing macFUSE / libfuse.

______________________________________________________________________

## Phase 1 — Redis

### Task 1: Add `redis` as optional peerDep + ensure `REDIS` resource kind exists

**Files:**

- Modify: `typescript/packages/node/package.json`
- Verify: `typescript/packages/core/src/types.ts` (add `ResourceName.REDIS = 'redis'` if missing)

**Step 1: `package.json`**

```json
{
  "peerDependencies": {
    "redis": "^5.0.0"
  },
  "peerDependenciesMeta": {
    "redis": { "optional": true }
  },
  "devDependencies": {
    "redis": "^5.0.0",
    "...": "..."
  }
}
```

**Step 2: Confirm/add `ResourceName.REDIS = 'redis'` in `core/src/types.ts`.**

**Step 3:**

```bash
cd typescript && pnpm install
pnpm --filter @struktoai/mirage-node typecheck
```

**Step 4: Commit**

______________________________________________________________________

### Task 2: `RedisResource`

**Files:**

- New: `typescript/packages/node/src/resource/redis/redis.ts`
- New: `typescript/packages/node/src/resource/redis/prompt.ts`
- New: `typescript/packages/node/src/resource/redis/redis.test.ts`

**Step 1: `redis.ts`** — port `mirage/resource/redis/redis.py`. Use **type-only import** for the redis package so missing-dep doesn't break typecheck:

```ts
import { type Resource, ResourceName } from '@struktoai/mirage-core'
import type { RedisClientType } from 'redis'
import { REDIS_PROMPT } from './prompt.js'

export interface RedisResourceOptions {
  url?: string
  keyPrefix?: string
}

export class RedisResource implements Resource {
  readonly kind = ResourceName.REDIS
  readonly prompt = REDIS_PROMPT
  readonly url: string
  readonly keyPrefix: string
  private clientPromise: Promise<RedisClientType> | null = null

  constructor(options: RedisResourceOptions = {}) {
    this.url = options.url ?? 'redis://localhost:6379/0'
    this.keyPrefix = options.keyPrefix ?? 'mirage:'
  }

  async client(): Promise<RedisClientType> {
    if (this.clientPromise === null) {
      this.clientPromise = (async () => {
        const { createClient } = await import('redis')
        const c = createClient({ url: this.url }) as RedisClientType
        await c.connect()
        return c
      })()
    }
    return this.clientPromise
  }

  async open(): Promise<void> { await this.client() }
  async close(): Promise<void> {
    if (this.clientPromise === null) return
    const c = await this.clientPromise
    if (c.isOpen) await c.quit()
    this.clientPromise = null
  }
}
```

**Step 2: `prompt.ts`** — short prompt string.

**Step 3: Test (gated):**

```ts
const REDIS_URL = process.env.REDIS_URL
const skip = REDIS_URL === undefined

describe.skipIf(skip)('RedisResource', () => {
  let res: RedisResource
  beforeAll(async () => { res = new RedisResource({ url: REDIS_URL }); await res.open() })
  afterAll(async () => { await res.close() })

  it('connects and disconnects', async () => {
    expect((await res.client()).isOpen).toBe(true)
  })
})
```

**Step 4: Commit**

______________________________________________________________________

______________________________________________________________________

## Phase 1b — RedisResource full mount parity

Task 2 landed a minimal `RedisResource` (just holds a Redis client). That's enough for cache backends (Tasks 3–4) but NOT enough to mount `new Workspace({ '/data': new RedisResource() })` like Python's `example_redis.py` does. These sub-tasks port the rest of Python's Redis mount stack.

**Python layout being ported:**

| Python                           | TS                                                        |
| -------------------------------- | --------------------------------------------------------- |
| `mirage/resource/redis/store.py` | `@struktoai/mirage-node/src/resource/redis/store.ts`      |
| `mirage/core/redis/*.py` (22)    | `@struktoai/mirage-node/src/core/redis/*.ts`              |
| `mirage/ops/redis/*.py` (11)     | `@struktoai/mirage-node/src/ops/redis/*.ts` + `index.ts`  |
| `mirage/accessor/redis.py`       | _skipped_ — TS passes `store` directly, no accessor layer |

### Task 2b.1: `RedisStore`

**Files:**

- New: `typescript/packages/node/src/resource/redis/store.ts`
- New: `typescript/packages/node/src/resource/redis/store.test.ts`

Port `mirage/resource/redis/store.py` (126 lines → TS class). Wraps the node-redis client with file/dir/modified key families. All methods gated through `this.client()` (lazy connect).

Methods to port: `getFile`, `setFile`, `delFile`, `hasFile`, `listFiles(prefix)`, `fileLen`, `getRange(path, start, end)`, `hasDir`, `addDir`, `removeDir`, `listDirs`, `getModified`, `setModified`, `delModified`, `clear`, `close`.

Default `keyPrefix` = `"mirage:fs:"` (matches Python). Seeds root dir `/` on open.

**Fix RedisResource default key_prefix to `"mirage:fs:"`** (currently `"mirage:"`) while here, to match Python.

### Task 2b.2: Port `core/redis/*.ts` ops

**Files:** 18 new files under `typescript/packages/node/src/core/redis/`:

- `utils.ts` (norm, basename helpers)
- `read.ts` (readBytes)
- `readdir.ts`
- `stat.ts`
- `exists.ts`
- `mkdir.ts`
- `mkdir_p.ts`
- `rmdir.ts`
- `unlink.ts`
- `rename.ts`
- `truncate.ts`
- `copy.ts`
- `rm.ts` (rmR)
- `write.ts` (writeBytes)
- `append.ts` (appendBytes)
- `create.ts`
- `du.ts`
- `find.ts`
- `glob.ts` (resolveGlob)
- `stream.ts` (readStream)

Each op takes `store: RedisStore` as first arg and `path: PathSpec` (except writes/multi-arg). Mirrors existing `core/ram/*.ts` signatures. Port line-for-line from Python `core/redis/*.py`.

Tests: one `.test.ts` per op (gated on `REDIS_URL`).

### Task 2b.3: `ops/redis/*.ts` op table

**Files:**

- New: `typescript/packages/node/src/ops/redis/index.ts` (REDIS_OPS array)
- New: individual op adapters: `append`, `create`, `mkdir`, `read`, `readdir`, `rename`, `rmdir`, `stat`, `truncate`, `unlink`, `write` (11 files)

Each op wraps a core fn via `op()` / `registerOp()` with `resource: ResourceName.REDIS`. Mirror `ops/ram/index.ts` pattern.

### Task 2b.4: Upgrade `RedisResource`

**Files:**

- Modify: `typescript/packages/node/src/resource/redis/redis.ts`
- Modify: `typescript/packages/node/src/index.ts` (re-export `RedisStore`, `REDIS_OPS`)

Add to `RedisResource`:

- `private store: RedisStore` (wraps the client)
- `ops()` → `REDIS_OPS`
- `commands()` → `FS_COMMANDS` (reuse generic fs commands)
- `streamPath`, `readFile`, `writeFile`, `appendFile`, `readdir`, `stat`, `exists`, `mkdir`, `rmdir`, `unlink`, `rename`, `truncate`, `copy`, `rmR`, `du`, `find`, `glob` — all delegate to `core/redis/*` fns with `this.store`
- `getState()` / `loadState()` for snapshot support (matches Python's `get_state` / `load_state`)

`RedisFileCacheStore` continues to work since it extends `RedisResource` — the new fs methods don't conflict with its `FileCache` methods.

### Task 2b.5: RedisResource mount tests + example

**Files:**

- New: `typescript/packages/node/src/resource/redis/redis_mount.test.ts`

Gated on `REDIS_URL`. Cover:

- `new Workspace({ '/data': new RedisResource() }, { mode: WRITE })` opens + closes
- `await ws.execute('echo hi | tee /data/hi.txt')` writes through Redis
- `await ws.execute('ls /data/')` returns the file
- `await ws.execute('cat /data/hi.txt')` returns the content
- Cross-session persistence: close workspace, reopen with same keyPrefix, file still there
- `getState()` / `loadState()` round-trip

______________________________________________________________________

### Task 3: `RedisFileCacheStore`

**Files:**

- New: `typescript/packages/node/src/cache/redis/file.ts`
- New: `typescript/packages/node/src/cache/redis/file.test.ts`

**Step 1: Port `mirage/cache/file/redis.py`** — implement `FileCache` from core:

```ts
import { type FileCache, type PathSpec } from '@struktoai/mirage-core'
import { defaultFingerprint, parseLimit } from '@struktoai/mirage-core'
import { RedisResource, type RedisResourceOptions } from '../../resource/redis/redis.js'

export interface RedisFileCacheOptions extends RedisResourceOptions {
  cacheLimit?: string | number
  maxDrainBytes?: number | null
}

export class RedisFileCacheStore extends RedisResource implements FileCache {
  private readonly limit: number
  private readonly dataPrefix: string
  private readonly metaPrefix: string
  maxDrainBytes: number | null

  constructor(options: RedisFileCacheOptions = {}) {
    super({ url: options.url, keyPrefix: options.keyPrefix ?? 'mirage:cache:' })
    this.limit = parseLimit(options.cacheLimit ?? '512MB')
    this.dataPrefix = `${this.keyPrefix}data:`
    this.metaPrefix = `${this.keyPrefix}meta:`
    this.maxDrainBytes = options.maxDrainBytes ?? null
  }

  async get(key: string): Promise<Uint8Array | null> { ... }
  async set(key: string, data: Uint8Array, options: { fingerprint?: string | null; ttl?: number | null } = {}): Promise<void> { ... }
  async add(key: string, data: Uint8Array, options): Promise<boolean> { ... }
  async remove(key: string): Promise<void> { ... }
  async exists(key: string | PathSpec): Promise<boolean> { ... }
  async isFresh(key: string, fingerprint: string): Promise<boolean> { ... }
  async clear(): Promise<void> { ... }
  async allCached(keys: readonly string[]): Promise<boolean> { ... }
  async multiGet(keys: readonly string[]): Promise<(Uint8Array | null)[]> { ... }
}
```

**Step 2: Helper exports needed from core** — `defaultFingerprint`, `parseLimit`, and `FileCache` type. Export from `core/src/index.ts` if not already.

**Step 3: Tests (gated)** — round-trip set/get, add/remove, exists, isFresh, ttl expiry, multiGet, clear.

**Step 4: Commit**

______________________________________________________________________

### Task 4: `RedisIndexCacheStore`

**Files:**

- New: `typescript/packages/node/src/cache/redis/index_cache.ts`
- New: `typescript/packages/node/src/cache/redis/index_cache.test.ts`

**Step 1: Port `mirage/cache/index/redis.py`** — implement `IndexCache` (`listDir`, `setDir`, `invalidateDir`).

**Step 2: Tests (gated)** — directory listing round-trip, invalidation.

**Step 3: Commit**

______________________________________________________________________

### Task 5: `Workspace` accepts custom `cache` option

**Files:**

- Modify: `typescript/packages/core/src/workspace/workspace.ts`
- Modify: `typescript/packages/core/src/index.ts` (export `defaultFingerprint`, `parseLimit`, `FileCache`)
- Test: extend `core/src/workspace/workspace.test.ts`

**Step 1:** Add to `WorkspaceOptions`:

```ts
cache?: FileCache & Resource
```

**Step 2:** In ctor, replace hardcoded RAM cache:

```ts
this.cache = (options.cache ?? new RAMFileCacheStore({ limit: options.cacheLimit ?? '512MB' })) as RAMFileCacheStore
```

(The cast is a TS lie — RAMFileCacheStore is the type used internally; cache arg can also be Redis. We'll need to widen the field type to `FileCache & Resource`.)

**Step 3: Test**:

```ts
it('accepts a custom cache', async () => {
  const cache = new StubFileCacheResource()
  const ws = new Workspace({}, { cache })
  // confirm reads/writes go through `cache`
})
```

**Step 4: Commit**

______________________________________________________________________

### Task 6: Re-export Redis types from `@struktoai/mirage-node/index.ts`

**Files:** Modify `typescript/packages/node/src/index.ts`.

```ts
export {
  RedisResource,
  type RedisResourceOptions,
} from './resource/redis/redis.js'
export {
  RedisFileCacheStore,
  type RedisFileCacheOptions,
} from './cache/redis/file.js'
export {
  RedisIndexCacheStore,
  type RedisIndexCacheOptions,
} from './cache/redis/index_cache.js'
```

**Verify** typecheck/build pass without `redis` actually installed (only the type-only imports should hit it). **Commit.**

______________________________________________________________________

## Phase 2 — `native_exec` (no native deps)

### Task 7: `nativeExec` + tests

**Files:**

- New: `typescript/packages/node/src/native.ts`
- New: `typescript/packages/node/src/native.test.ts`

**Step 1: Port `mirage/workspace/native.py`** using `node:child_process`:

```ts
import { spawn } from 'node:child_process'

export interface NativeExecOptions {
  cwd: string
  env?: Record<string, string>
  timeoutMs?: number | null
}

export interface NativeExecResult {
  stdout: Uint8Array
  stderr: Uint8Array
  exitCode: number
}

export function nativeExec(command: string, options: NativeExecOptions): Promise<NativeExecResult> {
  return new Promise((resolve) => {
    const proc = spawn('sh', ['-c', command], {
      cwd: options.cwd,
      env: options.env ?? (process.env as Record<string, string>),
    })
    const stdoutChunks: Uint8Array[] = []
    const stderrChunks: Uint8Array[] = []
    let killed = false
    const timer =
      options.timeoutMs !== null && options.timeoutMs !== undefined
        ? setTimeout(() => { killed = true; proc.kill('SIGKILL') }, options.timeoutMs)
        : null
    proc.stdout.on('data', (c: Buffer) => stdoutChunks.push(new Uint8Array(c.buffer, c.byteOffset, c.byteLength)))
    proc.stderr.on('data', (c: Buffer) => stderrChunks.push(new Uint8Array(c.buffer, c.byteOffset, c.byteLength)))
    proc.on('close', (code) => {
      if (timer !== null) clearTimeout(timer)
      const cat = (cs: Uint8Array[]): Uint8Array => {
        const total = cs.reduce((n, c) => n + c.byteLength, 0)
        const out = new Uint8Array(total); let o = 0
        for (const c of cs) { out.set(c, o); o += c.byteLength }
        return out
      }
      resolve({
        stdout: cat(stdoutChunks),
        stderr: killed ? new TextEncoder().encode('timeout\n') : cat(stderrChunks),
        exitCode: killed ? 124 : (code ?? 0),
      })
    })
  })
}

export async function* nativeExecStream(
  command: string,
  options: NativeExecOptions,
): AsyncIterable<{ stream: 'stdout' | 'stderr'; bytes: Uint8Array }> {
  // streaming variant — yields chunks as they arrive
}
```

**Step 2: Tests** — tmpdir cwd, run `echo`, `false`, `sleep` for timeout.

**Step 3: Re-export from `@struktoai/mirage-node/index.ts`:**

```ts
export {
  nativeExec,
  nativeExecStream,
  type NativeExecOptions,
  type NativeExecResult,
} from './native.js'
```

**Step 4: Commit**

______________________________________________________________________

## Phase 3 — FUSE

### Task 8: Add `@zkochan/fuse-native` as optional peerDep

**Files:** Modify `typescript/packages/node/package.json`.

```json
{
  "peerDependencies": {
    "redis": "^5.0.0",
    "@zkochan/fuse-native": "^0.1.0"
  },
  "peerDependenciesMeta": {
    "redis": { "optional": true },
    "@zkochan/fuse-native": { "optional": true }
  },
  "devDependencies": {
    "@zkochan/fuse-native": "^0.1.0"
  }
}
```

**Step 1: install**

```bash
cd typescript && pnpm install
```

**Host prerequisites** (documented in README; package build fails without them):

- **Linux**: `libfuse-dev` (Debian/Ubuntu) or `fuse-devel` (RHEL). `@zkochan/fuse-native` ships a linux-x64 prebuild, so a working libfuse at runtime is enough.
- **macOS**: install [macFUSE](https://macfuse.github.io/). No prebuild — `node-gyp rebuild` compiles from source against macFUSE headers.
- **Windows**: not supported; `pnpm install` may fail. Use `--ignore-scripts` or run on WSL.

If the build fails during dev, continue without the devDep — tests and examples gate on runtime availability.

**Step 2: Commit**

______________________________________________________________________

### Task 9: `fuse/platform/macos.ts` + `fuse/fs.ts` — MirageFS callbacks class

**Files:**

- New: `typescript/packages/node/src/fuse/platform/macos.ts`
- New: `typescript/packages/node/src/fuse/fs.ts`

**Step 1: `platform/macos.ts`** — port `mirage/fuse/platform/macos.py`:

```ts
import { basename } from 'node:path'

export function isMacosMetadata(path: string): boolean {
  const name = basename(path)
  return name === '.DS_Store' || name.startsWith('._')
}
```

**Step 2: `fs.ts`** — port `mirage/fuse/fs.py` (325 lines). Class `MirageFS` holds the `Workspace` reference and exposes FUSE operation callbacks: `readdir`, `getattr`, `open`, `read`, `write`, `create`, `unlink`, `mkdir`, `rmdir`, `rename`, `release`, `truncate`, `utimens`. Each delegates to `ws.fs.*`. Lazy-import `@zkochan/fuse-native` only for constants (`Fuse.ENOENT`, `Fuse.EIO`, etc.) — keep the class itself type-import-free so missing native dep doesn't break typecheck.

Key behavior from Python:

- `readdir` filters macOS metadata via `isMacosMetadata`, strips the full path to basename
- `getattr` returns `{ mtime, atime, ctime, nlink, size, mode, uid, gid }`; fall back to dir attrs on lookup fail for root/mount prefixes
- `read` seeks via offset+length through `ws.fs.read`
- `write` batches into a per-fd buffer, flushes in `release`
- Errors map: "not found" → ENOENT, "not a directory" → ENOTDIR, others → EIO

**Step 3: Commit** (no test yet — covered by Task 11)

______________________________________________________________________

### Task 10: `fuse/mount.ts` — `mount` + `mountBackground` helpers

**Files:** New `typescript/packages/node/src/fuse/mount.ts`.

**Step 1: Port `mirage/fuse/mount.py`** (72 lines):

```ts
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Workspace } from '@struktoai/mirage-core'
import { MirageFS } from './fs.js'

export interface FuseHandle {
  mountpoint: string
  unmount: () => Promise<void>
}

export async function mount(ws: Workspace, mountpoint?: string): Promise<FuseHandle> {
  const { default: Fuse } = await import('@zkochan/fuse-native')
  const mp = mountpoint ?? mkdtempSync(join(tmpdir(), 'mirage-fuse-'))
  const mfs = new MirageFS(ws)
  const fuse = new Fuse(mp, mfs.ops(), { force: true, mkdir: true })
  await new Promise<void>((resolve, reject) => fuse.mount((err) => err ? reject(err) : resolve()))
  return {
    mountpoint: mp,
    unmount: () => new Promise<void>((resolve, reject) =>
      fuse.unmount((err) => err ? reject(err) : resolve()))
  }
}

export function mountBackground(ws: Workspace, mountpoint?: string): Promise<FuseHandle> {
  return mount(ws, mountpoint)
}
```

**Step 2: Commit** (no test yet — covered by Task 11)

______________________________________________________________________

### Task 11: `workspace/fuse.ts` — `FuseManager` + tests (gated)

**Files:**

- New: `typescript/packages/node/src/workspace/fuse.ts`
- New: `typescript/packages/node/src/workspace/fuse.test.ts`

**Step 1: `workspace/fuse.ts`** — port `mirage/workspace/fuse.py`:

```ts
import type { Workspace } from '@struktoai/mirage-core'
import { mount, type FuseHandle } from '../fuse/mount.js'

export class FuseManager {
  private handle: FuseHandle | null = null

  async setup(ws: Workspace, mountpoint?: string): Promise<string> {
    if (this.handle !== null) return this.handle.mountpoint
    this.handle = await mount(ws, mountpoint)
    return this.handle.mountpoint
  }

  async close(): Promise<void> {
    if (this.handle === null) return
    await this.handle.unmount()
    this.handle = null
  }

  get mountpoint(): string | null {
    return this.handle?.mountpoint ?? null
  }
}
```

**Step 2: Test** — gated on FUSE availability:

```ts
const fuseAvailable = await (async () => {
  try { await import('@zkochan/fuse-native'); return true } catch { return false }
})()

describe.skipIf(!fuseAvailable)('FuseManager', () => {
  it('mounts ws + reads via real fs.promises', async () => {
    const ws = new Workspace({ '/data': new RAMResource() }, { mode: MountMode.WRITE })
    await ws.execute('echo hello | tee /data/hi.txt')
    const fm = new FuseManager()
    const mp = await fm.setup(ws)
    try {
      const text = await (await import('node:fs/promises')).readFile(`${mp}/data/hi.txt`, 'utf-8')
      expect(text).toBe('hello\n')
    } finally {
      await fm.close()
    }
  })
})
```

**Step 3: Re-export from `@struktoai/mirage-node/index.ts`:**

```ts
export { FuseManager } from './workspace/fuse.js'
export { mount, mountBackground, type FuseHandle } from './fuse/mount.js'
export { MirageFS } from './fuse/fs.js'
```

**Step 4: Commit**

______________________________________________________________________

### Task 12: `Workspace.fuseMountpoint` + `execute({ native: true })`

**Files:**

- Modify: `typescript/packages/core/src/workspace/workspace.ts`
- Modify: `typescript/packages/node/src/workspace.ts` (the subclass overrides `execute` to handle `native: true` since core can't depend on node)

**Step 1:** Add to **core** Workspace:

```ts
private fuseMountpoint_: string | null = null
get fuseMountpoint(): string | null { return this.fuseMountpoint_ }
setFuseMountpoint(path: string | null): void { this.fuseMountpoint_ = path }

interface ExecuteOptions {
  provision?: boolean
  native?: boolean
}
```

In core `execute`, if `options.native === true` just fall through — the node subclass overrides to actually run it.

**Step 2:** **Node** Workspace subclass overrides:

```ts
import { nativeExec } from './native.js'

export class Workspace extends CoreWorkspace {
  override async execute(command: string, stdin?: ByteSource | null, options: ExecuteOptions = {}): Promise<ExecuteResult | ProvisionResult> {
    if (options.native === true && this.fuseMountpoint !== null) {
      return nativeExec(command, { cwd: this.fuseMountpoint })
    }
    return super.execute(command, stdin, options)
  }
}
```

**Step 3: Test** (FUSE gated):

```ts
it('runs the command via native shell against FUSE mount', async () => {
  const ws = new Workspace({ '/data': new RAMResource() }, { mode: MountMode.WRITE })
  await ws.execute('echo hi | tee /data/x.txt')
  const fm = new FuseManager()
  ws.setFuseMountpoint(await fm.setup(ws))
  try {
    const r = await ws.execute('cat data/x.txt', null, { native: true })
    expect(new TextDecoder().decode(r.stdout)).toBe('hi\n')
  } finally {
    await fm.close()
  }
})
```

**Step 4: Commit**

______________________________________________________________________

## Phase 4 — Examples

### Task 13: `examples/typescript/redis/{redis,redis_fuse,redis_cache}.ts`

**Mirrors `examples/python/redis_resource/*`.** Python has:

- `example_redis.py` → TS `redis/redis.ts` (RedisResource as **mount**)
- `example_redis_fuse.py` → TS `redis/redis_fuse.ts` (RedisResource + FUSE)
- `example_redis_vfs.py` → (skip — VFS story is fs-monkey; covered by future parity plan)

Plus one TS-specific bonus:

- `redis/redis_cache.ts` (RedisFileCacheStore as cache backend — no Python equivalent, but cheap to demo)

**Files:**

- New: `examples/typescript/redis/redis.ts`
- New: `examples/typescript/redis/redis_fuse.ts`
- New: `examples/typescript/redis/redis_cache.ts`
- Modify: `examples/typescript/package.json` — add `redis` to devDeps

**Step 1: `redis/redis.ts`** — mirrors `example_redis.py`, same commands, RedisResource as mount:

```ts
import { MountMode, RedisResource, Workspace } from '@struktoai/mirage-node'

const resource = new RedisResource({ url: process.env.REDIS_URL ?? 'redis://localhost:6379/0' })
const ws = new Workspace({ '/data': resource }, { mode: MountMode.WRITE })

await ws.execute('echo "hello world" | tee /data/hello.txt')
await ws.execute('mkdir /data/reports')
await ws.execute('echo "revenue,100\\nexpense,80" | tee /data/reports/q1.csv')

const ls = await ws.execute('ls /data/')
console.log(new TextDecoder().decode(ls.stdout))
// … rest mirrors example_redis.py commands (cat, head, tail, wc, stat, grep, …)

await ws.close()
```

**Step 2: `redis/redis_fuse.ts`** — mirrors `example_redis_fuse.py`, Redis-backed FS exposed through real POSIX:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { FuseManager, MountMode, RedisResource, Workspace } from '@struktoai/mirage-node'

const resource = new RedisResource({
  url: process.env.REDIS_URL ?? 'redis://localhost:6379/0',
  keyPrefix: 'mirage:fs:',
})

// seed
{
  const ws = new Workspace({ '/data/': resource }, { mode: MountMode.WRITE })
  await ws.execute('echo "hello world" | tee /data/hello.txt')
  await ws.execute('mkdir /data/sub')
  await ws.execute('echo "nested content" | tee /data/sub/nested.txt')
  await ws.close()
}

const ws = new Workspace({ '/data/': resource }, { mode: MountMode.WRITE })
const fm = new FuseManager()
const mp = await fm.setup(ws)
ws.setFuseMountpoint(mp)

console.log(`=== FUSE MODE: mounted at ${mp} ===`)
for (const e of readdirSync(`${mp}/data`)) {
  const full = `${mp}/data/${e}`
  const st = statSync(full)
  console.log(st.isFile() ? `  ${e.padEnd(30)} ${st.size} bytes` : `  ${e}/`)
}
console.log('--- readFileSync ---')
console.log(readFileSync(`${mp}/data/hello.txt`, 'utf-8'))

await fm.close()
await ws.close()
```

**Step 3: `redis/redis_cache.ts`** (bonus) — RedisFileCacheStore demo:

```ts
import { MountMode, RAMResource, RedisFileCacheStore, Workspace } from '@struktoai/mirage-node'
const cache = new RedisFileCacheStore({ url: process.env.REDIS_URL ?? 'redis://localhost:6379/0' })
const ws = new Workspace({ '/data': new RAMResource() }, { mode: MountMode.WRITE, cache })
await ws.execute('echo hello | tee /data/x.txt')
console.log('miss:', new TextDecoder().decode((await ws.execute('cat /data/x.txt')).stdout))
console.log('hit:', new TextDecoder().decode((await ws.execute('cat /data/x.txt')).stdout))
await ws.close()
```

**Step 4: Run** (requires running Redis; redis_fuse also requires macFUSE/libfuse):

```bash
docker run --rm -d --name mirage-redis -p 6379:6379 redis:7
pnpm tsx redis/redis.ts
pnpm tsx redis/redis_cache.ts
pnpm tsx redis/redis_fuse.ts   # requires macFUSE / libfuse
docker rm -f mirage-redis
```

**Step 5: Commit**

______________________________________________________________________

### Task 14: `examples/typescript/fuse/{ram_fuse,disk_fuse}.ts`

**Files:**

- New: `examples/typescript/fuse/ram_fuse.ts`
- New: `examples/typescript/fuse/disk_fuse.ts`

**Step 1: `ram_fuse.ts`** — mirrors Python's RAM+FUSE example:

```ts
import { createRequire } from 'node:module'
import { FuseManager, MountMode, RAMResource, Workspace } from '@struktoai/mirage-node'

const require = createRequire(import.meta.url)
const fs = require('fs') as typeof import('fs')

async function main() {
  const ws = new Workspace({ '/data': new RAMResource() }, { mode: MountMode.WRITE })
  await ws.execute('echo "hello via mirage" | tee /data/hi.txt')
  await ws.execute('echo "second" | tee /data/world.txt')

  const fm = new FuseManager()
  const mp = await fm.setup(ws)
  ws.setFuseMountpoint(mp)
  console.log(`mounted ws at ${mp}`)

  console.log('--- via real fs.promises.readdir ---')
  console.log(await fs.promises.readdir(`${mp}/data`))

  console.log('--- via real fs.promises.readFile ---')
  console.log((await fs.promises.readFile(`${mp}/data/hi.txt`, 'utf-8')).trimEnd())

  console.log('--- system grep via native_exec on FUSE mount ---')
  const r = await ws.execute('grep -r mirage data/', null, { native: true })
  console.log(new TextDecoder().decode(r.stdout))

  await fm.close()
  await ws.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
```

**Step 2: `disk_fuse.ts`** — same shape, but `DiskResource` over a `tmpdir()`.

**Step 3: Run** (requires macFUSE / libfuse):

```bash
pnpm tsx fuse/ram_fuse.ts
pnpm tsx fuse/disk_fuse.ts
```

**Step 4: Commit**

______________________________________________________________________

## Phase 5 — Verification

### Task 15: Build, typecheck, lint, test, run examples

```bash
cd typescript
pnpm install
pnpm -r build
pnpm -r typecheck
pnpm lint
pnpm format:check
pnpm -r test  # Redis tests skip if no REDIS_URL; FUSE tests skip if @zkochan/fuse-native missing
```

Examples (existing 6 + new 3):

```bash
cd ../examples/typescript
for f in ram/ram.ts ram/ram_filetypes.ts ram/ram_parquet.ts ram/ram_rare.ts ram/ram_vfs.ts disk/disk.ts; do
  pnpm tsx "$f" > /dev/null 2>&1 && echo "$f OK" || echo "$f FAIL"
done

# new (require prereqs):
docker run --rm -d --name mirage-redis -p 6379:6379 redis:7
pnpm tsx redis/redis.ts
pnpm tsx redis/redis_cache.ts
pnpm tsx redis/redis_fuse.ts   # needs macFUSE/libfuse
docker rm -f mirage-redis
pnpm tsx fuse/ram_fuse.ts
pnpm tsx fuse/disk_fuse.ts
```

Browser smoke:

```bash
cd browser && pnpm tsx scripts/smoke.ts
```

**Final commit + summary message.**

______________________________________________________________________

## Out of scope

- **Browser Redis** (Upstash REST or WS proxy) — separate package later if asked
- **Browser DiskResource** — `OPFSResource` already covers it
- **Parity plan** ([2026-04-20-ts-python-api-parity.md](2026-04-20-ts-python-api-parity.md)) — per-call session_id/agent_id, dispatch tuple, applyIo, OpsRegistry kwargs, history, IOResult.errors. Interleaving up to you.
- **Resource integrations** (S3, SSH, GitHub, GDrive, …) — separate plan; depends on parity work landing first
