// ========= Copyright 2026 @ Strukto.AI All Rights Reserved. =========
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// ========= Copyright 2026 @ Strukto.AI All Rights Reserved. =========

import { FuseManager, MountMode, nativeExec, RAMResource, Workspace } from '@struktoai/mirage-node'

async function main(): Promise<void> {
  console.log('=== nativeExec — standalone ===\n')
  const r = await nativeExec('echo hello && date', { cwd: '/tmp' })
  console.log('echo hello && date (cwd=/tmp):')
  console.log(r.stdoutText)
  console.log(`exit: ${String(r.exitCode)}\n`)

  console.log('=== nativeExec — timeout ===\n')
  const t = await nativeExec('sleep 5', { cwd: '/tmp', timeoutMs: 500 })
  console.log(`sleep 5 (timeout 500ms) → exit ${String(t.exitCode)}, stderr="${t.stderrText.trim()}"\n`)

  console.log('=== nativeExec — exit code ===\n')
  const f = await nativeExec('false', { cwd: '/tmp' })
  console.log(`false → exit ${String(f.exitCode)}\n`)

  console.log('=== ws.execute({ native: true }) — FALLBACK path ===\n')
  console.log('  When native=true is set but FuseManager is NOT set up,')
  console.log('  execute() warns and falls back to virtual mode.\n')
  const ws = new Workspace({ '/data/': new RAMResource() }, { mode: MountMode.WRITE })
  await ws.execute('echo "virtual" | tee /data/x.txt')
  const virt = await ws.execute('cat /data/x.txt', { native: true })
  console.log(`cat /data/x.txt (native=true, no FUSE): ${JSON.stringify(virt.stdoutText)}`)
  await ws.close()

  console.log('\n=== known limitation ===\n')
  console.log('  Combining same-process FUSE mount + nativeExec() against that mount')
  console.log('  deadlocks because Node is single-threaded: the JS event loop can')
  console.log('  not both await child_process AND service FUSE napi callbacks.')
  console.log('  Python avoids this via real OS threads (FUSE runs in a daemon Thread).')
  console.log('  Workarounds:')
  console.log('   - Mount FUSE in a separate Node process, use nativeExec in main process')
  console.log('   - Use nativeExec against a pre-existing FUSE mount (mounted by another tool)')
  console.log('   - Use native=false (the default) — the virtual executor works in-process')

  // Demonstrate the setup still works for the MOUNT path — just don't nativeExec through it
  const fm = new FuseManager()
  const ws2 = new Workspace({ '/data/': new RAMResource() }, { mode: MountMode.WRITE })
  await ws2.execute('echo "via fuse-aware workspace" | tee /data/y.txt')
  const mp = await fm.setup(ws2)
  console.log(`\nmounted: ${mp}`)
  console.log(`ws2.fuseMountpoint = ${ws2.fuseMountpoint ?? 'null'}`)
  await fm.unmount(ws2)
  console.log(`after unmount: ws2.fuseMountpoint = ${ws2.fuseMountpoint ?? 'null'}`)
  await ws2.close()
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
