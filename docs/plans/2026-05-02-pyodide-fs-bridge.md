# Pyodide FS Bridge Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bridge Python's stdlib filesystem calls (`open`, `os.stat`, `os.listdir`, `os.unlink`, etc.) into the mirage workspace's `dispatch`, so `with open('/Downloads/icon.png','wb') as f: ...` writes through OPFS, S3, RAM, slack, GitHub — any mirage mount — instead of Pyodide's in-memory MEMFS.

**Architecture:** Implement a custom Emscripten FS driver (`mirage_fs.ts`) registered into Pyodide. Each `node_ops` / `stream_ops` callback uses Pyodide's `Asyncify.handleAsync` to suspend the WASM stack, await `dispatch(op, pathSpec, ...)`, and resume with the result. Path resolution walks the Emscripten node-tree back to the mountpoint and joins names. The bridge is mounted at every workspace mount prefix (excluding `/`, which would clobber Pyodide's stdlib at `/lib`, `/home/pyodide`, etc.). Dynamic mount add/remove is forwarded from `Workspace.mount()` / `Workspace.unmount()` into the live `PyodideRuntime` via its existing serialization queue.

**Tech Stack:** TypeScript, Pyodide 0.29.3 (Emscripten FS, Asyncify), Vitest, mirage-internal `dispatch` op surface, tree-sitter-bash (existing).

______________________________________________________________________

## Repository state assumptions

- Canonical work happens in `/Users/zecheng/strukto/mirage` (remote = `mirage-internal.git`).
- mirage-os consumes the build via the `vendor/mirage-internal` submodule. After landing here, mirage-os pulls + rebuilds; that's outside the scope of this plan except for the final wiring task.
- Existing scaffolding to reuse:
  - `PyodideRuntime` ([src/workspace/executor/python/runtime.ts](../../typescript/packages/core/src/workspace/executor/python/runtime.ts)) — already serializes via `this.queue`.
  - `PyodideRuntimeOptions` — already has `autoLoadFromImports`, `bootstrapCode`. Add `workspaceBridge`.
  - `Workspace` ([src/workspace/workspace.ts](../../typescript/packages/core/src/workspace/workspace.ts)) — has `registry`, `dispatch`, mount lifecycle.
  - `MountRegistry.allMounts()` returns mount records with `prefix`.
  - `dispatch(op, pathSpec, ...)` signature: see `executor/cross_mount.ts`.

## Op surface mapping

| Emscripten FS callback      | Pre-check                           | mirage `dispatch` op   | Notes                                             |
| --------------------------- | ----------------------------------- | ---------------------- | ------------------------------------------------- |
| `node_ops.lookup`           | —                                   | `stat`                 | child not-found → throw `FS.ErrnoError(ENOENT=2)` |
| `node_ops.getattr`          | —                                   | `stat`                 | returns mode/size/times                           |
| `node_ops.mknod` (file)     | `assertWritable`                    | `create`               | called by Emscripten on `O_CREAT`                 |
| `node_ops.mknod` (dir)      | `assertWritable`                    | `mkdir`                | called by `os.mkdir`                              |
| `node_ops.unlink`           | `assertWritable`                    | `unlink`               |                                                   |
| `node_ops.rmdir`            | `assertWritable`                    | `rmdir`                |                                                   |
| `node_ops.rename`           | `assertWritable` (both src and dst) | `rename`               |                                                   |
| `node_ops.readdir`          | —                                   | `readdir`              | strip parent path, return basenames               |
| `node_ops.setattr` (size)   | `assertWritable`                    | `truncate`             |                                                   |
| `stream_ops.read`           | —                                   | `read` (offset/length) | partial-read OK; return bytes copied              |
| `stream_ops.write`          | `assertWritable`                    | `write` (offset)       | always returns full length on success             |
| `stream_ops.llseek`         | —                                   | none                   | pure local math; uses cached size from `getattr`  |
| `stream_ops.open` / `close` | —                                   | none                   | metadata only                                     |

Default error mapping: `dispatch` errors → `EIO=5`. The `errnoFor` helper recognizes a few common phrases (`not found` → `ENOENT`, `not a directory` → `ENOTDIR`, `read-only` → `EROFS`) — see Task 2.

## Prefix handling

- Mount prefixes come from `workspace.registry.allMounts()`. Each entry carries its `MountMode` (`READ` / `WRITE` / `EXEC`).
- Skip `'/'` (collides with Pyodide stdlib).
- Skip prefixes that begin with `/.sessions` (mirage's observer prefix — not user-visible).
- Each prefix → `pyodide.FS.mkdirTree(prefix); pyodide.FS.mount(MIRAGEFS, { prefix }, prefix)`.

## Write authorization (two-layer)

Writes go through two checks, in order:

**Layer 1 — bridge mode check (free, in JS).** The bridge maintains a list of `{ prefix, mode }` entries. On any write-side op (`stream_ops.write`, `node_ops.mknod`, `unlink`, `rmdir`, `rename`, `setattr` with `size`), the bridge resolves the path's owning mount and:

- `READ` mount → throw `FS.ErrnoError(EROFS=30)` immediately, no dispatch call.
- `WRITE` / `EXEC` mount → proceed to layer 2.

**Layer 2 — resource semantics (in `dispatch`).** The mount's resource decides per-path:

- Real storage (RAM, OPFS, S3, file mounts) → write op stores bytes.
- Virtual / computed views (`/slack/general/messages.json`, `/gdocs/<id>/text.txt`) → resource throws `read-only`-like error → bridge maps to `EROFS`.
- Action paths (`.send`, `.post`) → resource interprets bytes as an API call (post message, send email).

This means Python's `open('/s3/bucket/key', 'w')` works against a writable S3 mount, but `open('/slack/general/messages.json', 'w')` raises `OSError(errno=30)` even on a writable slack mount — the resource refuses, and the bridge surfaces a faithful errno.

| Path                             | Mount mode | Resource writable? | Python `f.write()`            |
| -------------------------------- | ---------- | ------------------ | ----------------------------- |
| `/r/data.bin`                    | WRITE/EXEC | yes                | ✅                            |
| `/Downloads/x.png`               | EXEC       | yes                | ✅                            |
| `/s3/bucket/key` (mounted WRITE) | WRITE      | yes                | ✅                            |
| `/s3/bucket/key` (mounted READ)  | READ       | —                  | ❌ `OSError(EROFS)` (layer 1) |
| `/slack/general/messages.json`   | WRITE      | virtual view       | ❌ `OSError(EROFS)` (layer 2) |
| `/slack/general/.send`           | WRITE      | action path        | ✅                            |

## Reference implementation

Pyodide's [`mountNativeFS`](https://github.com/pyodide/pyodide/blob/main/src/js/fs.ts) is the closest analog (~150 LOC, OPFS + Asyncify). Read it once before starting.

______________________________________________________________________

## Task 1: Path walker + skeleton MIRAGEFS object

**Files:**

- Create: `typescript/packages/core/src/workspace/executor/python/mirage_fs.ts`
- Create: `typescript/packages/core/src/workspace/executor/python/mirage_fs.test.ts`

**Step 1: Write the failing test**

```typescript
// mirage_fs.test.ts
import { describe, expect, it } from 'vitest'
import { nodePath, type MirageFsNode } from './mirage_fs.ts'

describe('nodePath', () => {
  it('returns the mountpoint when node is the mount root', () => {
    const root: MirageFsNode = { name: '/', parent: null, mount: { mountpoint: '/Downloads' } }
    root.parent = root
    expect(nodePath(root)).toBe('/Downloads')
  })

  it('joins node names from mountpoint to leaf', () => {
    const root: MirageFsNode = { name: '/', parent: null, mount: { mountpoint: '/r' } }
    root.parent = root
    const dir: MirageFsNode = { name: 'a', parent: root, mount: root.mount }
    const file: MirageFsNode = { name: 'b.txt', parent: dir, mount: root.mount }
    expect(nodePath(file)).toBe('/r/a/b.txt')
  })
})
```

**Step 2: Run test to verify it fails**

```bash
cd typescript/packages/core
pnpm test -- mirage_fs.test
```

Expected: FAIL — `nodePath` not defined / module missing.

**Step 3: Write minimal implementation**

```typescript
// mirage_fs.ts
import type { PathSpec } from '../../../types.ts'

export type BridgeDispatchFn = (
  op: string,
  pathSpec: PathSpec,
  ...args: unknown[]
) => Promise<readonly [unknown, unknown]>

export interface MirageFsNode {
  name: string
  parent: MirageFsNode | null
  mount: { mountpoint: string }
  // Emscripten will add mode/timestamp/etc; we don't model them strictly.
}

export function nodePath(node: MirageFsNode): string {
  if (node.parent === null || node.parent === node) return node.mount.mountpoint
  const parts: string[] = []
  let cur: MirageFsNode = node
  while (cur.parent !== null && cur.parent !== cur) {
    parts.unshift(cur.name)
    cur = cur.parent
  }
  const base = cur.mount.mountpoint
  return base === '/' ? '/' + parts.join('/') : base + '/' + parts.join('/')
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test -- mirage_fs.test
```

Expected: PASS, 2 tests.

**Step 5: Commit**

```bash
git add typescript/packages/core/src/workspace/executor/python/mirage_fs.ts \
        typescript/packages/core/src/workspace/executor/python/mirage_fs.test.ts
git commit -m "feat(python-fs): add path walker for MIRAGEFS bridge"
```

______________________________________________________________________

## Task 2: Error mapping helper

**Files:**

- Modify: `typescript/packages/core/src/workspace/executor/python/mirage_fs.ts`
- Modify: `typescript/packages/core/src/workspace/executor/python/mirage_fs.test.ts`

**Step 1: Write the failing tests**

Append to `mirage_fs.test.ts`:

```typescript
import { errnoFor } from './mirage_fs.ts'

describe('errnoFor', () => {
  it('returns ENOENT (2) for "not found"', () => {
    expect(errnoFor(new Error('file not found: /x'))).toBe(2)
    expect(errnoFor(new Error('No such file'))).toBe(2)
  })
  it('returns EROFS (30) for read-only mount errors', () => {
    expect(errnoFor(new Error('mount /s3 is read-only'))).toBe(30)
  })
  it('returns ENOTDIR (20) for "not a directory"', () => {
    expect(errnoFor(new Error('/x is not a directory'))).toBe(20)
  })
  it('falls back to EIO (5) for unknown errors', () => {
    expect(errnoFor(new Error('weird thing happened'))).toBe(5)
    expect(errnoFor('plain string')).toBe(5)
  })
})
```

**Step 2: Run test to verify it fails**

```bash
pnpm test -- mirage_fs.test
```

Expected: FAIL — `errnoFor` not exported.

**Step 3: Implement**

Append to `mirage_fs.ts`:

```typescript
const ENOENT = 2
const EIO = 5
const ENOTDIR = 20
const EROFS = 30

export function errnoFor(err: unknown): number {
  const msg = err instanceof Error ? err.message : String(err)
  if (/not found|no such (file|directory)/i.test(msg)) return ENOENT
  if (/not a directory/i.test(msg)) return ENOTDIR
  if (/read[- ]only/i.test(msg)) return EROFS
  return EIO
}
```

**Step 4: Run tests**

```bash
pnpm test -- mirage_fs.test
```

Expected: PASS, 6 tests total.

**Step 5: Commit**

```bash
git add -u typescript/packages/core/src/workspace/executor/python/mirage_fs.ts \
           typescript/packages/core/src/workspace/executor/python/mirage_fs.test.ts
git commit -m "feat(python-fs): add error-code mapping for MIRAGEFS"
```

______________________________________________________________________

## Task 3: Build factory `createMirageFS(dispatch, pyodide)` — node_ops read side

**Goal:** A factory that returns the FS object. Implement only `lookup`, `getattr`, `readdir` first. Use a fake dispatch in tests.

**Files:**

- Modify: `typescript/packages/core/src/workspace/executor/python/mirage_fs.ts`
- Modify: `typescript/packages/core/src/workspace/executor/python/mirage_fs.test.ts`

**Step 1: Write failing tests**

Append:

```typescript
import { createMirageFS } from './mirage_fs.ts'
import { PathSpec } from '../../../types.ts'

function fakePyodide() {
  // Minimal Emscripten Module fake: just enough to satisfy createMirageFS.
  // Tests call node_ops directly.
  const Asyncify = {
    handleAsync: <T>(fn: () => Promise<T>) => fn(),
  }
  const FS = {
    ErrnoError: class extends Error {
      constructor(public errno: number) { super(`errno ${errno}`); this.name = 'ErrnoError' }
    },
    createNode: (parent: unknown, name: string, mode: number) => ({
      name, parent: parent ?? null, mount: { mountpoint: '/r' }, mode,
    }),
  }
  return { _module: { Asyncify }, FS }
}

describe('createMirageFS — node_ops read side', () => {
  it('lookup returns a node when stat succeeds', async () => {
    const calls: unknown[] = []
    const dispatch: BridgeDispatchFn = async (op, p) => {
      calls.push({ op, path: p.original })
      return [{ type: 'file', size: 5 }, null]
    }
    const py = fakePyodide()
    const fs = createMirageFS(dispatch, py as never)
    const root = py.FS.createNode(null, '/', 0o755)
    root.parent = root; root.mount = { mountpoint: '/r' }
    const node = await Promise.resolve(fs.node_ops.lookup(root, 'foo.txt'))
    expect(calls).toEqual([{ op: 'stat', path: '/r/foo.txt' }])
    expect(node.name).toBe('foo.txt')
  })

  it('lookup throws ENOENT when stat fails', async () => {
    const dispatch: BridgeDispatchFn = async () => { throw new Error('file not found') }
    const py = fakePyodide()
    const fs = createMirageFS(dispatch, py as never)
    const root = py.FS.createNode(null, '/', 0o755)
    root.parent = root; root.mount = { mountpoint: '/r' }
    await expect(Promise.resolve(fs.node_ops.lookup(root, 'missing'))).rejects.toMatchObject({
      errno: 2,
    })
  })

  it('readdir returns dispatch entries with . and ..', async () => {
    const dispatch: BridgeDispatchFn = async (op) => {
      if (op === 'readdir') return [['/r/a', '/r/b'], null]
      return [null, null]
    }
    const py = fakePyodide()
    const fs = createMirageFS(dispatch, py as never)
    const root = py.FS.createNode(null, '/', 0o755)
    root.parent = root; root.mount = { mountpoint: '/r' }
    const entries = await Promise.resolve(fs.node_ops.readdir(root))
    expect(entries).toEqual(['.', '..', 'a', 'b'])
  })

  it('getattr maps stat to Emscripten attrs', async () => {
    const dispatch: BridgeDispatchFn = async () => [{ type: 'file', size: 42 }, null]
    const py = fakePyodide()
    const fs = createMirageFS(dispatch, py as never)
    const root = py.FS.createNode(null, '/', 0o755)
    root.parent = root; root.mount = { mountpoint: '/r' }
    const child = py.FS.createNode(root, 'foo.txt', 0o100644)
    child.parent = root
    const a = await Promise.resolve(fs.node_ops.getattr(child))
    expect(a.size).toBe(42)
    expect(a.mode & 0o170000).toBe(0o100000) // S_IFREG
  })
})

describe('createMirageFS — mode bookkeeping', () => {
  it('assertWritable allows WRITE mounts and rejects READ mounts', () => {
    const dispatch: BridgeDispatchFn = async () => [null, null]
    const py = fakePyodide()
    const fs = createMirageFS(dispatch, py as never, [
      { prefix: '/rw', mode: 'WRITE' },
      { prefix: '/ro', mode: 'READ' },
    ])
    expect(() => fs.assertWritable('/rw/x')).not.toThrow()
    expect(() => fs.assertWritable('/ro/x')).toThrow(/errno 30/)
  })

  it('longest-prefix wins (overlapping mounts)', () => {
    const dispatch: BridgeDispatchFn = async () => [null, null]
    const py = fakePyodide()
    const fs = createMirageFS(dispatch, py as never, [
      { prefix: '/data', mode: 'READ' },
      { prefix: '/data/scratch', mode: 'WRITE' },
    ])
    expect(() => fs.assertWritable('/data/scratch/x')).not.toThrow()
    expect(() => fs.assertWritable('/data/x')).toThrow(/errno 30/)
  })

  it('setMode/clearMode update the map', () => {
    const dispatch: BridgeDispatchFn = async () => [null, null]
    const py = fakePyodide()
    const fs = createMirageFS(dispatch, py as never, [])
    expect(() => fs.assertWritable('/new/x')).toThrow(/errno 30/)
    fs.setMode('/new', 'WRITE')
    expect(() => fs.assertWritable('/new/x')).not.toThrow()
    fs.clearMode('/new')
    expect(() => fs.assertWritable('/new/x')).toThrow(/errno 30/)
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
pnpm test -- mirage_fs.test
```

Expected: FAIL — `createMirageFS` not exported.

**Step 3: Implement**

Append to `mirage_fs.ts`:

```typescript
const S_IFREG = 0o100000
const S_IFDIR = 0o040000
const DEFAULT_FILE_MODE = S_IFREG | 0o644
const DEFAULT_DIR_MODE = S_IFDIR | 0o755

export interface PyodideForFS {
  _module: { Asyncify: { handleAsync: <T>(fn: () => Promise<T>) => T } }
  FS: {
    ErrnoError: new (errno: number) => Error & { errno: number }
    createNode: (parent: unknown, name: string, mode: number) => MirageFsNode
  }
}

export type MountModeStr = 'READ' | 'WRITE' | 'EXEC'

export interface MountModeEntry {
  prefix: string
  mode: MountModeStr
}

interface StatLike { type: string; size?: number }

function statToAttr(s: StatLike): Record<string, unknown> {
  const isDir = s.type === 'directory' || s.type === 'd'
  const mode = isDir ? DEFAULT_DIR_MODE : DEFAULT_FILE_MODE
  const size = s.size ?? 0
  const now = new Date()
  return {
    dev: 1, ino: 0, mode, nlink: 1, uid: 0, gid: 0, rdev: 0,
    size, atime: now, mtime: now, ctime: now,
    blksize: 4096, blocks: Math.ceil(size / 4096),
  }
}

export function createMirageFS(
  dispatch: BridgeDispatchFn,
  pyodide: PyodideForFS,
  initialMounts: readonly MountModeEntry[] = [],
) {
  const Asyncify = pyodide._module.Asyncify
  const FS = pyodide.FS
  const EROFS = 30
  const modes = new Map<string, MountModeStr>()
  for (const { prefix, mode } of initialMounts) modes.set(prefix, mode)

  function modeForPath(path: string): MountModeStr {
    let bestPrefix = ''
    let bestMode: MountModeStr = 'READ'
    for (const [prefix, mode] of modes) {
      if (path === prefix || path.startsWith(prefix + '/')) {
        if (prefix.length > bestPrefix.length) {
          bestPrefix = prefix
          bestMode = mode
        }
      }
    }
    return bestMode
  }

  function assertWritable(path: string): void {
    if (modeForPath(path) === 'READ') throw new FS.ErrnoError(EROFS)
  }

  const node_ops = {
    lookup(parent: MirageFsNode, name: string) {
      const path = joinPath(nodePath(parent), name)
      return Asyncify.handleAsync(async () => {
        try {
          const [statResult] = await dispatch('stat', PathSpec.fromStrPath(path))
          const stat = statResult as StatLike
          const isDir = stat.type === 'directory' || stat.type === 'd'
          const mode = isDir ? DEFAULT_DIR_MODE : DEFAULT_FILE_MODE
          const node = FS.createNode(parent, name, mode)
          // Pyodide will copy node.mount from parent automatically.
          return node
        } catch (err) {
          throw new FS.ErrnoError(errnoFor(err))
        }
      })
    },

    getattr(node: MirageFsNode) {
      const path = nodePath(node)
      return Asyncify.handleAsync(async () => {
        try {
          const [stat] = await dispatch('stat', PathSpec.fromStrPath(path))
          return statToAttr(stat as StatLike)
        } catch (err) {
          throw new FS.ErrnoError(errnoFor(err))
        }
      })
    },

    readdir(node: MirageFsNode) {
      const path = nodePath(node)
      return Asyncify.handleAsync(async () => {
        try {
          const [entries] = await dispatch('readdir', PathSpec.fromStrPath(path))
          const list = entries as string[]
          const names = list.map((p) => {
            const i = p.lastIndexOf('/')
            return i >= 0 ? p.slice(i + 1) : p
          })
          return ['.', '..', ...names]
        } catch (err) {
          throw new FS.ErrnoError(errnoFor(err))
        }
      })
    },

    setattr(_node: MirageFsNode, _attr: Record<string, unknown>) { /* fill in Task 5 */ },
    mknod(_parent: MirageFsNode, _name: string, _mode: number, _dev: number): MirageFsNode {
      throw new FS.ErrnoError(1) // EPERM until Task 5
    },
    unlink(_parent: MirageFsNode, _name: string) { throw new FS.ErrnoError(1) },
    rmdir(_parent: MirageFsNode, _name: string) { throw new FS.ErrnoError(1) },
    rename(_old: MirageFsNode, _newDir: MirageFsNode, _newName: string) {
      throw new FS.ErrnoError(1)
    },
  }

  const stream_ops = {
    open(_stream: unknown) {},
    close(_stream: unknown) {},
    read(_stream: unknown, _buf: Uint8Array, _off: number, _len: number, _pos: number): number {
      throw new FS.ErrnoError(1) // fill in Task 4
    },
    write(_stream: unknown, _buf: Uint8Array, _off: number, _len: number, _pos: number): number {
      throw new FS.ErrnoError(1) // fill in Task 4
    },
    llseek(_stream: unknown, _offset: number, _whence: number): number {
      throw new FS.ErrnoError(1)
    },
  }

  return {
    mount(mount: { mountpoint: string }) {
      const root = FS.createNode(null, '/', DEFAULT_DIR_MODE)
      root.parent = root
      root.mount = mount
      return root
    },
    node_ops,
    stream_ops,
    // Mode-map mutators used by PyodideRuntime when mirage-os adds/removes a mount
    // dynamically (Task 7). Layer-1 write check uses the resulting map.
    setMode(prefix: string, mode: MountModeStr): void { modes.set(prefix, mode) },
    clearMode(prefix: string): void { modes.delete(prefix) },
    // Helper exposed for Task 4/5 use:
    assertWritable,
  }
}

function joinPath(base: string, name: string): string {
  if (base === '/') return '/' + name
  return base + '/' + name
}
```

**Step 4: Run tests**

```bash
pnpm test -- mirage_fs.test
```

Expected: PASS, 13 tests total (10 original + 3 mode-bookkeeping).

**Step 5: Commit**

```bash
git add -u
git commit -m "feat(python-fs): MIRAGEFS factory + node_ops read side + mode bookkeeping"
```

______________________________________________________________________

## Task 4: stream_ops read + write + llseek

**Files:**

- Modify: `typescript/packages/core/src/workspace/executor/python/mirage_fs.ts`
- Modify: `typescript/packages/core/src/workspace/executor/python/mirage_fs.test.ts`

**Step 1: Write failing tests**

Append:

```typescript
describe('createMirageFS — stream_ops read', () => {
  it('reads bytes through dispatch with offset/length', async () => {
    const calls: unknown[] = []
    const data = new TextEncoder().encode('hello world')
    const dispatch: BridgeDispatchFn = async (op, p, kwargs) => {
      calls.push({ op, path: p.original, kwargs })
      const k = kwargs as { offset?: number; length?: number }
      const start = k.offset ?? 0
      const end = Math.min(start + (k.length ?? data.length), data.length)
      return [data.subarray(start, end), null]
    }
    const py = fakePyodide()
    const fs = createMirageFS(dispatch, py as never)
    const root = py.FS.createNode(null, '/', 0o755)
    root.parent = root; root.mount = { mountpoint: '/r' }
    const file = py.FS.createNode(root, 'a', 0o100644)
    file.parent = root
    const stream = { node: file }
    const buf = new Uint8Array(20)
    const n = await Promise.resolve(fs.stream_ops.read(stream, buf, 5, 5, 0))
    expect(n).toBe(5)
    expect(new TextDecoder().decode(buf.subarray(5, 10))).toBe('hello')
    expect(calls).toEqual([{ op: 'read', path: '/r/a', kwargs: { offset: 0, length: 5 } }])
  })
})

describe('createMirageFS — stream_ops write', () => {
  it('writes bytes through dispatch and returns length', async () => {
    const calls: unknown[] = []
    const dispatch: BridgeDispatchFn = async (op, p, payload, kwargs) => {
      calls.push({ op, path: p.original, payload, kwargs })
      return [null, null]
    }
    const py = fakePyodide()
    const fs = createMirageFS(dispatch, py as never, [{ prefix: '/r', mode: 'WRITE' }])
    const root = py.FS.createNode(null, '/', 0o755)
    root.parent = root; root.mount = { mountpoint: '/r' }
    const file = py.FS.createNode(root, 'b', 0o100644)
    file.parent = root
    const stream = { node: file }
    const src = new TextEncoder().encode('xyz')
    const n = await Promise.resolve(fs.stream_ops.write(stream, src, 0, 3, 0))
    expect(n).toBe(3)
    expect(calls).toHaveLength(1)
    const c = calls[0] as { op: string; path: string; kwargs: { offset: number } }
    expect(c.op).toBe('write')
    expect(c.path).toBe('/r/b')
    expect(c.kwargs.offset).toBe(0)
  })

  it('write to a READ-only mount raises EROFS without calling dispatch', async () => {
    const calls: unknown[] = []
    const dispatch: BridgeDispatchFn = async (op) => {
      calls.push(op)
      return [null, null]
    }
    const py = fakePyodide()
    const fs = createMirageFS(dispatch, py as never, [{ prefix: '/ro', mode: 'READ' }])
    const root = py.FS.createNode(null, '/', 0o755)
    root.parent = root; root.mount = { mountpoint: '/ro' }
    const file = py.FS.createNode(root, 'x', 0o100644)
    file.parent = root
    const stream = { node: file }
    expect(() => fs.stream_ops.write(stream, new Uint8Array([1]), 0, 1, 0))
      .toThrow(/errno 30/)
    expect(calls).toEqual([])  // dispatch never called
  })
})

describe('createMirageFS — stream_ops llseek', () => {
  it('SEEK_SET returns offset', () => {
    const py = fakePyodide()
    const fs = createMirageFS((async () => [null, null]) as never, py as never)
    expect(fs.stream_ops.llseek({ position: 10 }, 5, 0)).toBe(5)
  })
  it('SEEK_CUR adds to current', () => {
    const py = fakePyodide()
    const fs = createMirageFS((async () => [null, null]) as never, py as never)
    expect(fs.stream_ops.llseek({ position: 10 }, 5, 1)).toBe(15)
  })
  it('rejects negative result with EINVAL', () => {
    const py = fakePyodide()
    const fs = createMirageFS((async () => [null, null]) as never, py as never)
    expect(() => fs.stream_ops.llseek({ position: 0 }, -5, 0)).toThrow(/errno 28/)
  })
})
```

**Step 2: Run failing tests**

```bash
pnpm test -- mirage_fs.test
```

Expected: FAIL — read/write/llseek throw EPERM; tests expect actual values.

**Step 3: Implement**

Replace the `stream_ops` placeholder section in `mirage_fs.ts`:

```typescript
const EINVAL = 28

const stream_ops = {
  open(_stream: unknown) {},
  close(_stream: unknown) {},

  read(stream: { node: MirageFsNode }, buf: Uint8Array, off: number, len: number, pos: number) {
    const path = nodePath(stream.node)
    return Asyncify.handleAsync(async () => {
      try {
        const [data] = await dispatch('read', PathSpec.fromStrPath(path), {
          offset: pos,
          length: len,
        })
        const bytes = data as Uint8Array
        const n = Math.min(bytes.length, len)
        buf.set(bytes.subarray(0, n), off)
        return n
      } catch (err) {
        throw new FS.ErrnoError(errnoFor(err))
      }
    })
  },

  write(stream: { node: MirageFsNode }, buf: Uint8Array, off: number, len: number, pos: number) {
    const path = nodePath(stream.node)
    assertWritable(path)  // Layer 1: bridge mode check
    const slice = buf.slice(off, off + len)
    return Asyncify.handleAsync(async () => {
      try {
        await dispatch('write', PathSpec.fromStrPath(path), slice, { offset: pos })
        return len
      } catch (err) {
        // Layer 2: resource-level errors (e.g. virtual mount refusing write)
        throw new FS.ErrnoError(errnoFor(err))
      }
    })
  },

  llseek(stream: { position: number; node?: MirageFsNode }, offset: number, whence: number) {
    let pos = 0
    if (whence === 0) pos = offset
    else if (whence === 1) pos = stream.position + offset
    else if (whence === 2) {
      // SEEK_END requires size — assume node already has cached size or rely on getattr.
      // Out-of-scope for MVP; treat as EINVAL.
      throw new FS.ErrnoError(EINVAL)
    } else {
      throw new FS.ErrnoError(EINVAL)
    }
    if (pos < 0) throw new FS.ErrnoError(EINVAL)
    return pos
  },
}
```

**Step 4: Run tests**

```bash
pnpm test -- mirage_fs.test
```

Expected: PASS, 20 tests total (16 prior + 1 mode-aware write + EROFS test).

**Step 5: Commit**

```bash
git add -u
git commit -m "feat(python-fs): MIRAGEFS stream_ops read/write/llseek + mode-aware write"
```

______________________________________________________________________

## Task 5: node_ops mutations — mknod, unlink, rmdir, rename, setattr(truncate)

**Files:**

- Modify: `typescript/packages/core/src/workspace/executor/python/mirage_fs.ts`
- Modify: `typescript/packages/core/src/workspace/executor/python/mirage_fs.test.ts`

**Step 1: Write failing tests**

Append tests covering: mknod-file calls `create`, mknod-dir calls `mkdir`, unlink calls `unlink`, rmdir calls `rmdir`, rename calls `rename`, setattr with `size` calls `truncate`. Each test should verify the dispatch op + path + that errors map correctly. Follow the patterns from Task 3 — fake dispatch records calls. Build the FS with `[{ prefix: '/r', mode: 'WRITE' }]` so `assertWritable` lets ops through.

**Also add a "read-only mount rejects mutations" parametric test:**

```typescript
describe('createMirageFS — node_ops mutations on READ-only mount', () => {
  const cases = [
    ['mknod-file', (fs, root) => fs.node_ops.mknod(root, 'x', 0o100644, 0)],
    ['mknod-dir',  (fs, root) => fs.node_ops.mknod(root, 'x', 0o040755, 0)],
    ['unlink',     (fs, root) => fs.node_ops.unlink(root, 'x')],
    ['rmdir',      (fs, root) => fs.node_ops.rmdir(root, 'x')],
    ['setattr-size', (fs, root, py) => {
      const f = py.FS.createNode(root, 'x', 0o100644); f.parent = root
      return fs.node_ops.setattr(f, { size: 0 })
    }],
  ] as const

  for (const [label, op] of cases) {
    it(`${label} on READ mount → EROFS, no dispatch`, async () => {
      const calls: unknown[] = []
      const dispatch: BridgeDispatchFn = async (o) => { calls.push(o); return [null, null] }
      const py = fakePyodide()
      const fs = createMirageFS(dispatch, py as never, [{ prefix: '/ro', mode: 'READ' }])
      const root = py.FS.createNode(null, '/', 0o755)
      root.parent = root; root.mount = { mountpoint: '/ro' }
      expect(() => op(fs, root, py)).toThrow(/errno 30/)
      expect(calls).toEqual([])
    })
  }

  it('rename across READ→WRITE rejects (source must also be writable)', () => {
    const dispatch: BridgeDispatchFn = async () => [null, null]
    const py = fakePyodide()
    const fs = createMirageFS(dispatch, py as never, [
      { prefix: '/ro', mode: 'READ' },
      { prefix: '/rw', mode: 'WRITE' },
    ])
    const roRoot = py.FS.createNode(null, '/', 0o755)
    roRoot.parent = roRoot; roRoot.mount = { mountpoint: '/ro' }
    const rwRoot = py.FS.createNode(null, '/', 0o755)
    rwRoot.parent = rwRoot; rwRoot.mount = { mountpoint: '/rw' }
    const f = py.FS.createNode(roRoot, 'x', 0o100644); f.parent = roRoot
    expect(() => fs.node_ops.rename(f, rwRoot, 'x')).toThrow(/errno 30/)
  })
})
```

**Step 2: Run failing tests**

Expected: FAIL — placeholders throw EPERM.

**Step 3: Implement**

Replace placeholders in `mirage_fs.ts`:

```typescript
const node_ops = {
  // ...existing lookup/getattr/readdir...

  mknod(parent: MirageFsNode, name: string, mode: number, _dev: number) {
    const path = joinPath(nodePath(parent), name)
    assertWritable(path)  // Layer 1
    const isDir = (mode & 0o170000) === S_IFDIR
    return Asyncify.handleAsync(async () => {
      try {
        await dispatch(isDir ? 'mkdir' : 'create', PathSpec.fromStrPath(path))
        const node = FS.createNode(parent, name, mode)
        return node
      } catch (err) {
        throw new FS.ErrnoError(errnoFor(err))
      }
    })
  },

  unlink(parent: MirageFsNode, name: string) {
    const path = joinPath(nodePath(parent), name)
    assertWritable(path)
    return Asyncify.handleAsync(async () => {
      try { await dispatch('unlink', PathSpec.fromStrPath(path)) }
      catch (err) { throw new FS.ErrnoError(errnoFor(err)) }
    })
  },

  rmdir(parent: MirageFsNode, name: string) {
    const path = joinPath(nodePath(parent), name)
    assertWritable(path)
    return Asyncify.handleAsync(async () => {
      try { await dispatch('rmdir', PathSpec.fromStrPath(path)) }
      catch (err) { throw new FS.ErrnoError(errnoFor(err)) }
    })
  },

  rename(oldNode: MirageFsNode, newDir: MirageFsNode, newName: string) {
    const from = nodePath(oldNode)
    const to = joinPath(nodePath(newDir), newName)
    assertWritable(from)  // source mount must allow deletion
    assertWritable(to)    // destination mount must allow creation
    return Asyncify.handleAsync(async () => {
      try {
        await dispatch('rename', PathSpec.fromStrPath(from), PathSpec.fromStrPath(to))
      } catch (err) {
        throw new FS.ErrnoError(errnoFor(err))
      }
    })
  },

  setattr(node: MirageFsNode, attr: { size?: number; timestamp?: Date }) {
    if (attr.size === undefined) return
    const path = nodePath(node)
    assertWritable(path)
    const newSize = attr.size
    return Asyncify.handleAsync(async () => {
      try { await dispatch('truncate', PathSpec.fromStrPath(path), newSize) }
      catch (err) { throw new FS.ErrnoError(errnoFor(err)) }
    })
  },
}
```

**Step 4: Run tests**

```bash
pnpm test -- mirage_fs.test
```

Expected: PASS — all node_ops + stream_ops covered.

**Step 5: Commit**

```bash
git add -u
git commit -m "feat(python-fs): MIRAGEFS node_ops mutations (mknod/unlink/rmdir/rename/truncate)"
```

______________________________________________________________________

## Task 6: Wire `workspaceBridge` option through PyodideRuntime

**Files:**

- Modify: `typescript/packages/core/src/workspace/executor/python/runtime.ts`
- Modify: `typescript/packages/core/src/workspace/executor/python/handle.ts`
- Modify: `typescript/packages/core/src/workspace/node/execute_node.ts`
- Modify: `typescript/packages/core/src/workspace/workspace.ts`
- Modify: `typescript/packages/core/src/workspace/executor/python/loader.ts` (extend `PyodideInterface` typing for `FS`, `_module`)

**Step 1: Extend `PyodideRuntimeOptions`**

In `runtime.ts`, add to the interface:

```typescript
export interface PyodideRuntimeOptions {
  autoLoadFromImports?: boolean
  bootstrapCode?: string
  workspaceBridge?: {
    dispatch: import('./mirage_fs.ts').BridgeDispatchFn
    mountPrefixes: readonly import('./mirage_fs.ts').MountModeEntry[]
  }
}
```

Store on the class:

```typescript
private readonly workspaceBridge: PyodideRuntimeOptions['workspaceBridge']

constructor(options: PyodideRuntimeOptions = {}) {
  this.autoLoadFromImports = options.autoLoadFromImports ?? false
  this.bootstrapCode = options.bootstrapCode ?? null
  this.workspaceBridge = options.workspaceBridge
}
```

**Step 2: Extend `PyodideInterface` in `loader.ts`**

Add to the interface:

```typescript
export interface PyodideInterface {
  // ...existing...
  FS: {
    mount: (fs: unknown, opts: unknown, mountpoint: string) => void
    unmount: (mountpoint: string) => void
    mkdirTree: (path: string) => void
    rmdir: (path: string) => void
    createNode: (parent: unknown, name: string, mode: number) => import('./mirage_fs.ts').MirageFsNode
    ErrnoError: new (errno: number) => Error & { errno: number }
  }
  _module: {
    Asyncify: { handleAsync: <T>(fn: () => Promise<T>) => T }
  }
}
```

**Step 3: In `ensureLoaded`, register and mount**

After Pyodide is loaded and bootstrap runs, before returning:

```typescript
private async ensureLoaded(): Promise<PyodideInterface> {
  // ...existing load + bootstrap...
  if (this.workspaceBridge !== undefined && this.mirageFs === null) {
    const { createMirageFS, shouldBridgeMount } = await import('./mirage_fs.ts')
    const filtered = this.workspaceBridge.mountPrefixes.filter((m) =>
      shouldBridgeMount(m.prefix),
    )
    this.mirageFs = createMirageFS(
      this.workspaceBridge.dispatch,
      this.pyodide as never,
      filtered,  // initial mount-mode list for layer-1 write check
    )
    for (const { prefix } of filtered) {
      this.pyodide.FS.mkdirTree(prefix)
      this.pyodide.FS.mount(this.mirageFs, { prefix }, prefix)
    }
  }
  return this.pyodide
}
```

Add `shouldBridgeMount` to `mirage_fs.ts`:

```typescript
const SKIP_PREFIXES = ['/', '/.sessions']

export function shouldBridgeMount(prefix: string): boolean {
  if (prefix === '/' || prefix === '') return false
  for (const skip of SKIP_PREFIXES) {
    if (prefix === skip || prefix.startsWith(skip + '/')) return false
  }
  return true
}
```

**Step 4: Plumb option through call sites**

- `handle.ts`: `HandlePythonDeps` already has `pyodideOptions`. Replace its inline type with `PyodideRuntimeOptions` so `workspaceBridge` flows through.
- `execute_node.ts`: same — replace inline type.
- `workspace.ts`: in constructor, assemble `workspaceBridge` from `this.dispatch.bind(this)` and `this.registry.allMounts().map(m => m.prefix)`. Pass as part of `pyodideOptions` to both `executeNode` deps and `handlePythonRepl`.

```typescript
// workspace.ts
private buildPyodideOptions(): PyodideRuntimeOptions {
  return {
    ...this.pyodideOptions,
    workspaceBridge: {
      dispatch: (op, path, ...args) => this.dispatch(op, path, ...args),
      mountPrefixes: this.registry.allMounts().map((m) => ({
        prefix: m.prefix,
        mode: m.mode as 'READ' | 'WRITE' | 'EXEC',
      })),
    },
  }
}
```

Use this in both code paths that build pyodideOptions.

**Step 5: Add unit test for option plumbing**

Create `typescript/packages/core/src/workspace/executor/python/mirage_fs_plumbing.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { shouldBridgeMount } from './mirage_fs.ts'

describe('shouldBridgeMount', () => {
  it('skips root', () => expect(shouldBridgeMount('/')).toBe(false))
  it('skips observer prefix', () => expect(shouldBridgeMount('/.sessions')).toBe(false))
  it('skips paths under observer prefix', () =>
    expect(shouldBridgeMount('/.sessions/abc')).toBe(false))
  it('allows /Downloads', () => expect(shouldBridgeMount('/Downloads')).toBe(true))
  it('allows /r', () => expect(shouldBridgeMount('/r')).toBe(true))
  it('allows /s3/bucket', () => expect(shouldBridgeMount('/s3/bucket')).toBe(true))
})
```

**Step 6: Run tests + typecheck**

```bash
pnpm test -- mirage_fs
pnpm typecheck
```

Expected: all green.

**Step 7: Commit**

```bash
git add -u
git commit -m "feat(python-fs): wire workspaceBridge option through PyodideRuntime"
```

______________________________________________________________________

## Task 7: Dynamic mount add/remove

**Files:**

- Modify: `typescript/packages/core/src/workspace/executor/python/runtime.ts`
- Modify: `typescript/packages/core/src/workspace/workspace.ts`
- Modify: `typescript/packages/core/src/workspace/executor/python/mirage_fs.test.ts`

**Step 1: Write failing test**

Append:

```typescript
import { PyodideRuntime } from './runtime.ts'

describe('PyodideRuntime — dynamic mounts', () => {
  it('addMount before pyodide loaded is a no-op', async () => {
    const rt = new PyodideRuntime({
      workspaceBridge: {
        dispatch: async () => [null, null],
        mountPrefixes: [{ prefix: '/r', mode: 'WRITE' }],
      },
    })
    await rt.addMount('/Uploads', 'EXEC')   // pyodide not loaded yet — must not throw
    expect(true).toBe(true)
  })
})
```

(Real verification of mount/unmount calls happens in Task 9 with real Pyodide.)

**Step 2: Add methods to `PyodideRuntime`**

```typescript
async addMount(prefix: string, mode: 'READ' | 'WRITE' | 'EXEC'): Promise<void> {
  const task = (): Promise<void> => this.addMountOne(prefix, mode)
  const next = this.queue.then(task, task)
  this.queue = next.catch(() => undefined)
  return next
}

async removeMount(prefix: string): Promise<void> {
  const task = (): Promise<void> => this.removeMountOne(prefix)
  const next = this.queue.then(task, task)
  this.queue = next.catch(() => undefined)
  return next
}

private async addMountOne(prefix: string, mode: 'READ' | 'WRITE' | 'EXEC'): Promise<void> {
  if (this.pyodide === null || this.mirageFs === null) return
  if (!shouldBridgeMount(prefix)) return
  this.mirageFs.setMode(prefix, mode)                   // Layer-1 mode bookkeeping
  this.pyodide.FS.mkdirTree(prefix)
  this.pyodide.FS.mount(this.mirageFs, { prefix }, prefix)
}

private async removeMountOne(prefix: string): Promise<void> {
  if (this.pyodide === null) return
  if (this.mirageFs !== null) this.mirageFs.clearMode(prefix)
  try { this.pyodide.FS.unmount(prefix) } catch { /* not mounted */ }
  try { this.pyodide.FS.rmdir(prefix) } catch { /* nonempty / busy */ }
}
```

(Add the `shouldBridgeMount` import and `private mirageFs: ReturnType<typeof createMirageFS> | null = null` field.)

**Step 3: Forward from Workspace**

In `workspace.ts`, when adding/removing mounts:

```typescript
// existing: this.registry.add(prefix, resource)
const rt = pythonRuntimes.get(this.workspaceId)
if (rt !== undefined) {
  const mountRecord = this.registry.allMounts().find((m) => m.prefix === prefix)
  if (mountRecord !== undefined) {
    await rt.addMount(prefix, mountRecord.mode as 'READ' | 'WRITE' | 'EXEC')
  }
}
```

Use `pythonRuntimes` from `handle.ts` — export it for this purpose, or expose an accessor. Cleanest: export a function `getPythonRuntime(workspaceId)` from `handle.ts`.

Add to `handle.ts`:

```typescript
export function getPythonRuntime(workspaceId: string): PyodideRuntime | undefined {
  return runtimes.get(workspaceId)
}
```

Wire `Workspace.mount`/`Workspace.unmount` (find the existing methods — see `mount` calls in [workspace.ts](../../typescript/packages/core/src/workspace/workspace.ts)):

```typescript
// In existing mount method, after registry update:
const rt = getPythonRuntime(this.workspaceId)
if (rt !== undefined) {
  const m = this.registry.allMounts().find((x) => x.prefix === prefix)
  if (m !== undefined) await rt.addMount(prefix, m.mode as 'READ' | 'WRITE' | 'EXEC')
}
// In unmount, before registry.remove(prefix):
const rt2 = getPythonRuntime(this.workspaceId)
if (rt2 !== undefined) await rt2.removeMount(prefix)
```

**Step 4: Run tests + typecheck**

```bash
pnpm test -- mirage_fs
pnpm typecheck
```

Expected: green.

**Step 5: Commit**

```bash
git add -u
git commit -m "feat(python-fs): dynamic add/remove mount lifecycle"
```

______________________________________________________________________

## Task 8: Real-Pyodide integration test (end-to-end)

**Goal:** Prove the bridge works against a real Pyodide instance with a real RAM-backed workspace.

**Files:**

- Create: `typescript/packages/core/src/workspace/executor/python/mirage_fs_e2e.test.ts`

**Step 1: Write the test**

```typescript
import { describe, expect, it } from 'vitest'
import { RAMResource } from '../../../resource/ram/ram.ts'
import { MountMode } from '../../../types.ts'
import { Workspace } from '../../workspace.ts'
// Use the same shell-parser setup as src/workspace/executor/python/python.test.ts.

describe('MIRAGEFS end-to-end with real Pyodide', () => {
  it('Python open/write/read round-trips through RAM mount', async () => {
    const ws = makeWorkspaceWithRam() // helper, copy pattern from python.test.ts
    await ws.execute('mkdir /r/work', { sessionId: 'default' })
    const r = await ws.execute(
      `python3 -c "open('/r/work/hello.txt','w').write('mirage')"`,
      { sessionId: 'default' },
    )
    expect(r.exitCode).toBe(0)
    const cat = await ws.execute('cat /r/work/hello.txt', { sessionId: 'default' })
    expect(cat.stdoutText).toBe('mirage')
    await ws.close()
  }, 30000)

  it('Python os.listdir matches shell ls', async () => {
    const ws = makeWorkspaceWithRam()
    await ws.execute('mkdir /r/dir; touch /r/dir/a /r/dir/b', { sessionId: 'default' })
    const r = await ws.execute(
      `python3 -c "import os; print(sorted(os.listdir('/r/dir')))"`,
      { sessionId: 'default' },
    )
    expect(r.stdoutText.trim()).toBe("['a', 'b']")
    await ws.close()
  }, 30000)

  it('Python read after shell write sees latest bytes', async () => {
    const ws = makeWorkspaceWithRam()
    await ws.execute('mkdir /r/d', { sessionId: 'default' })
    await ws.execute(`echo -n hello > /r/d/x`, { sessionId: 'default' })
    const r = await ws.execute(
      `python3 -c "print(open('/r/d/x').read())"`,
      { sessionId: 'default' },
    )
    expect(r.stdoutText.trim()).toBe('hello')
    await ws.close()
  }, 30000)

  it('Python write under read-only mount raises OSError', async () => {
    const ws = makeWorkspaceWithReadOnlyRam() // helper: RAM mount with mode=READ
    const r = await ws.execute(
      `python3 -c "
try:
    open('/ro/x.txt','w').write('hi')
    print('NO_ERROR')
except OSError as e:
    print('OSError', e.errno)
"`,
      { sessionId: 'default' },
    )
    expect(r.stdoutText).toMatch(/OSError 30/) // EROFS
    await ws.close()
  }, 30000)
})
```

**Step 2: Add helpers**

Replicate the shell-parser construction from `python.test.ts`. Helpers build a `Workspace` normally — `Workspace` builds `workspaceBridge` internally from `registry.allMounts()` (Task 6). For read-only test, build with `mode: MountMode.READ` for the test mount.

**Step 3: Run integration tests**

```bash
pnpm test -- mirage_fs_e2e
```

Expected: 4 tests pass. Each will spin up Pyodide once (~5s); reuse via shared `beforeAll` if too slow.

**Step 4: Commit**

```bash
git add typescript/packages/core/src/workspace/executor/python/mirage_fs_e2e.test.ts
git commit -m "test(python-fs): end-to-end MIRAGEFS through real Pyodide + RAM"
```

______________________________________________________________________

## Task 9: PIL roundtrip — final integration test

**Goal:** Prove `from PIL import Image; img.save('/r/x.png')` works.

**Files:**

- Modify: `typescript/packages/core/src/workspace/executor/python/mirage_fs_e2e.test.ts`

**Step 1: Add test**

```typescript
it('PIL.save writes a real PNG into the mount', async () => {
  const ws = makeWorkspaceWithRam({
    python: { autoLoadFromImports: true },  // Workspace builds workspaceBridge internally
  })
  await ws.execute('mkdir /r/img', { sessionId: 'default' })
  const r = await ws.execute(
    `python3 -c "
from PIL import Image
img = Image.new('RGB', (8, 8), 'red')
img.save('/r/img/red.png', format='PNG')
"`,
    { sessionId: 'default' },
  )
  expect(r.exitCode).toBe(0)
  const stat = await ws.execute('wc -c /r/img/red.png', { sessionId: 'default' })
  // 8x8 RGB PNG is ~80–150 bytes; assert > 0 and starts with PNG magic.
  const bytes = await ws.fs.readFile('/r/img/red.png')
  expect(bytes.length).toBeGreaterThan(20)
  expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0x89, 0x50, 0x4e, 0x47])
  await ws.close()
}, 60000)
```

**Step 2: Run**

```bash
pnpm test -- mirage_fs_e2e
```

Expected: PASS — first run downloads Pillow (~5MB), subsequent runs are cached.

**Step 3: Commit**

```bash
git add -u
git commit -m "test(python-fs): PIL roundtrip writes real PNG via MIRAGEFS"
```

______________________________________________________________________

## Task 10: Wire from mirage-os

**Note:** This is in the `mirage-os` repo, not canonical mirage. Done after a sync.

**Files:**

- Modify: `mirage-os/src/store/app.ts`

**Step 1: Build workspaceBridge in `buildRuntime`**

The Workspace constructor already builds `workspaceBridge` internally from `registry.allMounts()` (Task 6 added that). So mirage-os does **not** need to pass `workspaceBridge` directly — only the existing `python: { autoLoadFromImports, bootstrapCode }`. Verify by inspecting [src/store/app.ts:228](../../typescript/../mirage-os/src/store/app.ts) — no change needed if Workspace handles it.

**Step 2: Confirm dynamic add/remove already wired**

mirage-os's `addMount` / `removeMount` call `ws.mount` / `ws.unmount`. Workspace forwards to `PyodideRuntime` via Task 7. No mirage-os change needed.

**Step 3: Manual smoke test in browser**

After publishing canonical → syncing vendor → rebuilding browser bundle:

1. Open mirage-os in browser.
1. Add a workspace, default OPFS root, Downloads under home.
1. Open AI session.
1. Run:
   ```
   python3 -c "from PIL import Image; Image.new('RGB',(64,64),'blue').save('/home/mirage/Downloads/blue.png')"
   ```
1. `ls /home/mirage/Downloads/` shows `blue.png`.
1. Open Finder → file appears.
1. Click file → preview shows blue square.

**Step 4: Smoke test cross-resource + write authorization**

- Add an S3 mount in WRITE mode; verify `python3 -c "open('/s3/.../x','wb').write(b'hi')"` succeeds.
- Re-mount the same S3 path in READ mode; verify Python write raises `OSError(errno=30)` immediately (layer-1 catches before any S3 round-trip).
- Add a slack mount; verify `open('/slack/general/messages.json').read()` works (read), and `open('/slack/general/messages.json','w').write('[]')` raises `OSError` (layer-2 — slack resource refuses).

______________________________________________________________________

## Task 11: Documentation

**Files:**

- Create: `docs/typescript/python-fs.mdx` (or update existing python doc)

**Step 1: Document the bridge**

Cover:

- How Python file paths route through mirage mounts
- Limitations: `/` is not bridged; use `/Downloads`, `/r`, etc.
- Read-only mounts raise `OSError(errno=30)` on write
- Performance: ~100–200µs per file op crossing
- Async/sync model: Asyncify makes it transparent to user code

**Step 2: Commit**

```bash
git add docs/typescript/python-fs.mdx
git commit -m "docs(python-fs): document MIRAGEFS bridge"
```

______________________________________________________________________

## Final review checklist

- [ ] All unit tests pass (`pnpm test`)
- [ ] All e2e tests pass (Pyodide + RAM + PIL)
- [ ] `pnpm typecheck` clean
- [ ] No regressions in `python.test.ts` / `python_repl.test.ts`
- [ ] Manual mirage-os smoke test green for OPFS roundtrip
- [ ] Manual mirage-os smoke test green for cross-resource (S3 read)
- [ ] Plan doc reviewed by reader

______________________________________________________________________

## Risks / known edge cases

- **Pyodide private API drift:** `pyodide._module.Asyncify` is unofficial. If Pyodide bumps, may break. Reference `mountNativeFS` source first; copy whatever pattern they use.
- **`SEEK_END` not implemented in `llseek`:** lseek-to-end will raise EINVAL. Most Python code doesn't use this; revisit if a script needs it.
- **Concurrent shell+Python writes to same path:** no per-path locking. Python's MEMFS-cached node tree may have stale `size` from a prior `getattr`. Acceptable for MVP.
- **Open file handles when mount is removed:** subsequent ops return ENOENT. Same as USB unplug. Acceptable.
- **Performance on huge directories:** `os.listdir('/s3/bucket-with-1M-keys')` will pull the full listing through dispatch. Same cost as `ls /s3/bucket-with-1M-keys` — neither is fast, but it's not a regression.
- **Symlinks not supported:** `node_ops.symlink` / `readlink` not implemented. `os.symlink` raises EPERM. Out of scope.
