# Pyodide FS Shim Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Mount mirage paths into Pyodide so Python's stdlib `open()` reads/writes route through `Workspace.dispatch`. Eager-preload at mount; flush dirty files at close. Use `pyodide.ffi.run_sync` (JSPI) at the Python layer — never inside FS hooks.

**Architecture:**

- Pyodide MEMFS is the sync facade. We pre-populate it with file bytes at mount and flush dirty files back to mirage on `close()`.
- A Python shim (`mirage_fs_shim.py`) monkey-patches `builtins.open` to detect dirty closes for paths under registered prefixes, and calls a JS bridge module via `run_sync()`.
- A JS bridge module (`mirage_bridge.ts`) is exposed to Python via `pyodide.registerJsModule('_mirage_bridge', ...)`. It wraps the workspace `dispatch` for `READ`/`WRITE`/`LIST` ops and, at mount, recursively loads bytes into MEMFS via `pyodide.FS.writeFile`.
- No custom Emscripten `node_ops`/`stream_ops`. No Asyncify. No `_module.Asyncify.handleAsync`.

**Limitations (documented):**

- C extensions that call `fopen` directly (sqlite3, h5py) will only see what's in MEMFS — they don't trigger lazy fetch. For v1 we eager-preload everything at mount, so they work as long as the mount fits in memory.
- Listings inside Python after a mount can go stale if mirage is mutated externally. v1 doesn't refresh; future opt-in `flushAll()` can re-walk.
- Concurrent writes from multiple Python processes to the same path: last-flush wins. Not addressed.

**Tech Stack:** TypeScript (vitest), Pyodide 0.29.3, JSPI (`pyodide.ffi.run_sync`), Pyodide MEMFS (`pyodide.FS`), `pyodide.registerJsModule`.

**Branch:** `feat/pyodide-fs-shim` (already created, based on `origin/main` 26806bef)

______________________________________________________________________

## Naming and shapes (read once)

```ts
// typescript/packages/core/src/workspace/executor/python/mirage_bridge.ts
export type MirageBridge = {
  fetch(path: string): Promise<Uint8Array>
  flush(path: string, bytes: Uint8Array): Promise<void>
  list(path: string): Promise<MirageEntry[]>
}
export type MirageEntry = { path: string; size: number; isDir: boolean }

// What workspace passes in:
export type BridgeDispatchFn = (
  op: 'READ' | 'WRITE' | 'LIST',
  path: string,
  bytes?: Uint8Array,
) => Promise<unknown>
```

```py
# typescript/packages/core/src/workspace/executor/python/mirage_fs_shim.py
# Loaded as text and run via runPythonAsync at bootstrap.
# Registers a global _mirage_prefixes set and patches builtins.open.
```

______________________________________________________________________

## Task 1: JS bridge factory + dispatch adapter

**Goal:** A pure-data helper that turns a `BridgeDispatchFn` + a `pyodide.FS` handle into a `MirageBridge` object. No mounting yet — just the three methods.

**Files:**

- Create: `typescript/packages/core/src/workspace/executor/python/mirage_bridge.ts`
- Test: `typescript/packages/core/src/workspace/executor/python/mirage_bridge.test.ts`

**Step 1: Write failing test**

```ts
// mirage_bridge.test.ts
import { describe, expect, it, vi } from 'vitest'
import { createMirageBridge, type BridgeDispatchFn } from './mirage_bridge.ts'

describe('createMirageBridge', () => {
  it('forwards fetch to dispatch READ and returns bytes', async () => {
    const dispatch = vi.fn<BridgeDispatchFn>(async () => new Uint8Array([1, 2, 3]))
    const b = createMirageBridge(dispatch)
    const out = await b.fetch('/ram/x.txt')
    expect(dispatch).toHaveBeenCalledWith('READ', '/ram/x.txt')
    expect(Array.from(out)).toEqual([1, 2, 3])
  })

  it('forwards flush to dispatch WRITE with bytes and resolves void', async () => {
    const dispatch = vi.fn<BridgeDispatchFn>(async () => undefined)
    const b = createMirageBridge(dispatch)
    await b.flush('/ram/x.txt', new Uint8Array([9, 9]))
    const [op, path, bytes] = dispatch.mock.calls[0]!
    expect(op).toBe('WRITE')
    expect(path).toBe('/ram/x.txt')
    expect(Array.from(bytes!)).toEqual([9, 9])
  })

  it('forwards list to dispatch LIST and returns entries', async () => {
    const dispatch = vi.fn<BridgeDispatchFn>(async () => [
      { path: '/ram/a.txt', size: 4, isDir: false },
      { path: '/ram/sub', size: 0, isDir: true },
    ])
    const b = createMirageBridge(dispatch)
    const entries = await b.list('/ram/')
    expect(entries).toHaveLength(2)
    expect(entries[0]).toEqual({ path: '/ram/a.txt', size: 4, isDir: false })
  })

  it('rethrows dispatch errors', async () => {
    const dispatch = vi.fn<BridgeDispatchFn>(async () => {
      throw new Error('boom')
    })
    const b = createMirageBridge(dispatch)
    await expect(b.fetch('/x')).rejects.toThrow(/boom/)
  })
})
```

**Step 2: Run, expect FAIL** (`mirage_bridge.ts` does not exist).

**Step 3: Implement minimal `mirage_bridge.ts`**

```ts
export type MirageEntry = { path: string; size: number; isDir: boolean }

export type BridgeDispatchFn = (
  op: 'READ' | 'WRITE' | 'LIST',
  path: string,
  bytes?: Uint8Array,
) => Promise<unknown>

export type MirageBridge = {
  fetch(path: string): Promise<Uint8Array>
  flush(path: string, bytes: Uint8Array): Promise<void>
  list(path: string): Promise<MirageEntry[]>
}

export function createMirageBridge(dispatch: BridgeDispatchFn): MirageBridge {
  return {
    async fetch(path) {
      const out = await dispatch('READ', path)
      if (!(out instanceof Uint8Array)) {
        throw new TypeError(`mirage bridge: READ ${path} expected Uint8Array, got ${typeof out}`)
      }
      return out
    },
    async flush(path, bytes) {
      await dispatch('WRITE', path, bytes)
    },
    async list(path) {
      const out = await dispatch('LIST', path)
      if (!Array.isArray(out)) {
        throw new TypeError(`mirage bridge: LIST ${path} expected array`)
      }
      return out as MirageEntry[]
    },
  }
}
```

**Step 4: Run test, expect PASS.**

**Step 5: Commit.**
`git add typescript/packages/core/src/workspace/executor/python/mirage_bridge.ts typescript/packages/core/src/workspace/executor/python/mirage_bridge.test.ts && git commit -m "feat(python-fs): mirage bridge factory"`

______________________________________________________________________

## Task 2: Eager-preload walker (LIST → READ → MEMFS write)

**Goal:** Given a prefix and a `MirageBridge` + a `pyodide.FS`-shaped object, recursively populate MEMFS with all files under prefix. Pure function, fully unit-testable with a fake FS.

**Files:**

- Modify: `mirage_bridge.ts` — add `preloadInto(fs, bridge, prefix)`
- Modify: `mirage_bridge.test.ts`

**Step 1: Write failing tests**

```ts
// inside mirage_bridge.test.ts
type FakeFS = {
  mkdirTree(path: string): void
  writeFile(path: string, bytes: Uint8Array): void
  _dirs: Set<string>
  _files: Map<string, Uint8Array>
}
function makeFakeFS(): FakeFS { /* trivial impl */ }

describe('preloadInto', () => {
  it('creates the prefix directory and writes flat files', async () => {
    const dispatch = vi.fn<BridgeDispatchFn>(async (op, path) => {
      if (op === 'LIST' && path === '/ram/') {
        return [
          { path: '/ram/a.txt', size: 5, isDir: false },
          { path: '/ram/b.bin', size: 3, isDir: false },
        ]
      }
      if (op === 'READ' && path === '/ram/a.txt') return new TextEncoder().encode('hello')
      if (op === 'READ' && path === '/ram/b.bin') return new Uint8Array([1, 2, 3])
      throw new Error(`unexpected ${op} ${path}`)
    })
    const fs = makeFakeFS()
    await preloadInto(fs, createMirageBridge(dispatch), '/ram/')
    expect(fs._dirs.has('/ram')).toBe(true)
    expect(new TextDecoder().decode(fs._files.get('/ram/a.txt')!)).toBe('hello')
    expect(Array.from(fs._files.get('/ram/b.bin')!)).toEqual([1, 2, 3])
  })

  it('recurses into subdirectories', async () => {
    const dispatch = vi.fn<BridgeDispatchFn>(async (op, path) => {
      if (op === 'LIST' && path === '/ram/') return [{ path: '/ram/sub', size: 0, isDir: true }]
      if (op === 'LIST' && path === '/ram/sub/')
        return [{ path: '/ram/sub/c.txt', size: 1, isDir: false }]
      if (op === 'READ' && path === '/ram/sub/c.txt') return new Uint8Array([7])
      throw new Error(`unexpected ${op} ${path}`)
    })
    const fs = makeFakeFS()
    await preloadInto(fs, createMirageBridge(dispatch), '/ram/')
    expect(fs._dirs.has('/ram/sub')).toBe(true)
    expect(Array.from(fs._files.get('/ram/sub/c.txt')!)).toEqual([7])
  })

  it('is idempotent: re-running does not double-write or throw', async () => {
    const dispatch = vi.fn<BridgeDispatchFn>(async (op) => (op === 'LIST' ? [] : new Uint8Array()))
    const fs = makeFakeFS()
    await preloadInto(fs, createMirageBridge(dispatch), '/ram/')
    await preloadInto(fs, createMirageBridge(dispatch), '/ram/')
    expect(fs._dirs.has('/ram')).toBe(true)
  })
})
```

**Step 2: FAIL.**

**Step 3: Implement `preloadInto` in `mirage_bridge.ts`.** Strip trailing `/` from prefix when calling `mkdirTree`. For each entry, recurse if `isDir`, else `writeFile`. Use `MirageBridge.list` and `MirageBridge.fetch`.

**Step 4: PASS. Step 5: Commit.**

______________________________________________________________________

## Task 3: Python shim — register prefix, patch `open`, flush on close

**Goal:** Python module loaded once at bootstrap. Exposes `_mirage_register(prefix)`, `_mirage_unregister(prefix)`. Monkey-patches `builtins.open`/`io.open` so writes to registered prefixes flush via `js._mirage_bridge.flush(path, bytes)` on `close()`.

**Files:**

- Create: `typescript/packages/core/src/workspace/executor/python/mirage_fs_shim.py`
- Test: `typescript/packages/core/src/workspace/executor/python/mirage_fs_shim.test.ts` (tested via real Pyodide; this is the first test that needs Pyodide loaded)

**Step 1: Write failing integration test (real Pyodide)**

```ts
// mirage_fs_shim.test.ts
// NOTE: Real Pyodide. May require NODE_OPTIONS=--experimental-wasm-jspi.
// Mark as long timeout. Skip on platforms without JSPI by checking can_run_sync().
import { describe, it, expect } from 'vitest'
import { loadPyodideRuntime } from './loader.ts'
import { MIRAGE_FS_SHIM_PY } from './mirage_fs_shim.ts'   // string export
import { createMirageBridge } from './mirage_bridge.ts'

describe('mirage_fs_shim', () => {
  it('flushes a write to the bridge on close', async () => {
    const py = await loadPyodideRuntime()
    const flushed: Array<{ path: string; bytes: Uint8Array }> = []
    py.registerJsModule('_mirage_bridge', createMirageBridge(async (op, path, bytes) => {
      if (op === 'WRITE') {
        flushed.push({ path, bytes: bytes! })
        return undefined
      }
      if (op === 'READ') return new Uint8Array()
      if (op === 'LIST') return []
      throw new Error('unsupported')
    }))
    await py.runPythonAsync(MIRAGE_FS_SHIM_PY)
    py.FS.mkdirTree('/ram')
    await py.runPythonAsync(`
import _mirage_fs_shim as m
m.register('/ram/')
with open('/ram/hello.txt', 'wb') as f:
    f.write(b'world')
`)
    expect(flushed).toHaveLength(1)
    expect(flushed[0].path).toBe('/ram/hello.txt')
    expect(new TextDecoder().decode(flushed[0].bytes)).toBe('world')
  }, 60_000)

  it('does not flush writes outside registered prefixes', async () => {
    /* registers /ram/, writes to /tmp/x — flushed must remain empty */
  }, 60_000)

  it('append mode flushes full file content on close', async () => {
    /* preload /ram/log.txt with 'a' in MEMFS, open in 'ab', write 'b', close → flush gets 'ab' */
  }, 60_000)

  it('unregistering a prefix stops flushing', async () => { /* ... */ }, 60_000)
})
```

**Step 2: FAIL.**

**Step 3: Implement `mirage_fs_shim.py` and a TS sidecar that exports it as a string constant**

```py
# mirage_fs_shim.py
import builtins
import io
import os
from pyodide.ffi import run_sync
import js

_PREFIXES: set[str] = set()
_open = builtins.open
_io_open = io.open

def _under_prefix(path: str) -> bool:
    if not isinstance(path, str):
        return False
    for p in _PREFIXES:
        if path.startswith(p):
            return True
    return False

def register(prefix: str) -> None:
    if not prefix.endswith('/'):
        prefix = prefix + '/'
    _PREFIXES.add(prefix)

def unregister(prefix: str) -> None:
    if not prefix.endswith('/'):
        prefix = prefix + '/'
    _PREFIXES.discard(prefix)

class _FlushOnClose(io.FileIO):
    _mirage_path: str

    def __init__(self, path, *args, **kwargs):
        super().__init__(path, *args, **kwargs)
        self._mirage_path = os.fspath(path)

    def close(self) -> None:
        was_writable = self.writable() and not self.closed
        super().close()
        if was_writable:
            with _open(self._mirage_path, 'rb') as src:
                data = src.read()
            run_sync(js._mirage_bridge.flush(self._mirage_path, data))

def _patched_open(path, mode='r', *args, **kwargs):
    sp = os.fspath(path) if not isinstance(path, str) else path
    if _under_prefix(sp) and ('w' in mode or 'a' in mode or '+' in mode or 'x' in mode):
        binary = 'b' in mode
        if binary:
            return _FlushOnClose(sp, mode=mode.replace('b', '') or 'r', *args, **kwargs)
        # text mode: wrap _FlushOnClose in TextIOWrapper
        raw = _FlushOnClose(sp, mode=(mode.replace('t', '').replace('b', '') + 'b'))
        return io.TextIOWrapper(raw, *args, **kwargs)
    return _open(path, mode, *args, **kwargs)

builtins.open = _patched_open
io.open = _patched_open
```

```ts
// mirage_fs_shim.ts
export const MIRAGE_FS_SHIM_PY = `<contents above as a string>`
// Embed via raw import or inline; see existing wrapper.ts for pattern.
```

**Notes for implementer:**

- See `wrapper.ts` for how `PYTHON_WRAPPER` is exported.
- Test the text-mode + append-mode + write-mode + read-only paths.
- If JSPI is not available in the test environment, skip with `it.skipIf(...)` and instead test via a sync drop-in in unit tests; mark e2e tests `it.runIf(JSPI_AVAILABLE)`.

**Step 4: PASS. Step 5: Commit.**

______________________________________________________________________

## Task 4: Wire shim + bridge into `PyodideRuntime`

**Goal:** Add `workspaceBridge?: BridgeDispatchFn` to `PyodideRuntimeOptions`. On `ensureLoaded`, after Pyodide is ready and bootstrap runs, register the JS bridge module and run the shim.

**Files:**

- Modify: `typescript/packages/core/src/workspace/executor/python/runtime.ts`
- Modify: `typescript/packages/core/src/workspace/executor/python/runtime.test.ts` (or create)

**Step 1: Write failing test** — call `runtime.run(...)` against a fake `BridgeDispatchFn`, exercise a Python `open(...)/write/close`, assert dispatch was invoked.

**Step 2: FAIL.**

**Step 3: Implement.**

- Add `workspaceBridge` to options
- After `ensureLoaded` bootstraps, if `workspaceBridge !== undefined`:
  - `pyodide.registerJsModule('_mirage_bridge', createMirageBridge(workspaceBridge))`
  - `await pyodide.runPythonAsync(MIRAGE_FS_SHIM_PY)`
- Add `addMount(prefix: string): Promise<void>`:
  - `await preloadInto(pyodide.FS, bridge, prefix)`
  - `await pyodide.runPythonAsync(\`import \_mirage_fs_shim; \_mirage_fs_shim.register(${JSON.stringify(prefix)})\`)\`
- Add `removeMount(prefix: string): Promise<void>`:
  - Run shim `unregister`
  - Best-effort `pyodide.FS.unmount` is unnecessary since we used MEMFS; we just unregister so writes stop flushing. Optionally walk and `FS.unlink` to free memory.

**Step 4: PASS. Step 5: Commit.**

______________________________________________________________________

## Task 5: Wire `Workspace` to `PyodideRuntime` mount lifecycle

**Goal:** When a mount is added to the workspace, call `pythonRuntime.addMount(prefix)`. When unmounted, call `removeMount`.

**Files:**

- Modify: `typescript/packages/core/src/workspace/workspace.ts`
- Modify: `typescript/packages/core/src/workspace/workspace.test.ts`

**Step 1: Write failing test** — workspace with a stub Python runtime spy, expect `addMount` called with prefix when `Workspace.addMount` runs and `removeMount` when `unmount` runs.

**Step 2: FAIL.**

**Step 3: Implement.**

- Construct PyodideRuntime with `workspaceBridge: this.canonicalDispatchAdapter`
- In `Workspace.addMount`: `void this.pythonRuntime.addMount(prefix).catch(err => console.warn(...))`
- In `Workspace.unmount`: `await this.pythonRuntime.removeMount(prefix)`
- Provide a small `BRIDGE_OPS` set with explicit throw on unknown op (fail-loud).

**Step 4: PASS. Step 5: Commit.**

______________________________________________________________________

## Task 6: Real-Pyodide e2e test — RAM mount roundtrip

**Goal:** End-to-end: create a Workspace with a RAM mount, run Python that reads + writes, verify mirage sees the writes.

**Files:**

- Create: `typescript/packages/core/src/workspace/executor/python/e2e.test.ts`

**Cases:**

- Pre-write `/ram/in.txt` via mirage → Python `open(..., 'rb').read()` returns those bytes
- Python `open('/ram/out.txt', 'wb').write(b'data')` → mirage `READ` returns `data`
- Python writes a 50KB chunked file → mirage sees the full content

If JSPI not available, skip with a clear message.

______________________________________________________________________

## Task 7: PIL roundtrip integration test

**Goal:** Demonstrate the flagship case.

```py
from PIL import Image
img = Image.new('RGB', (4, 4), color='red')
img.save('/ram/icon.png')
loaded = Image.open('/ram/icon.png')
assert loaded.size == (4, 4)
```

After Python returns, JS-side asserts mirage RAM resource has the file.

______________________________________________________________________

## Task 8: Documentation

**Files:**

- Create: `docs/typescript/python-fs.mdx`

Cover:

- What it does
- Limitations (C-fopen, listing staleness, JSPI requirements)
- Browser/Node version requirements (Chrome 137+, Node 24+ with `--experimental-wasm-jspi`)
- Example: read+write to `/ram/`
- Example: `img.save` to `/Downloads/`

______________________________________________________________________

## Execution Handoff

Plan saved to `docs/plans/2026-05-03-pyodide-fs-shim.md`.

User has already chosen subagent-driven development for the previous run. Default to that:

- **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development
- Stay in this session, fresh subagent per task, two-stage review (spec then quality) after each.
