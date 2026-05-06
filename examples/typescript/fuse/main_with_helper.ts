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

// main_with_helper.ts — the "recommended workaround" for combining FUSE
// and nativeExec in Node, worked out end-to-end.
//
// Architecture:
//   [parent — this process]   [child — helper.ts]
//         │                          │
//         │ spawn('tsx', helper.ts)  │ mount FUSE at /tmp/mirage-fuse-XXX
//         │ ───────────────────────▶ │ print mountpoint on stdout
//         │ readline first line      │ sit idle servicing FUSE callbacks
//         │ ◀─────────────────────── │
//         │                          │
//         │ nativeExec against mp    │ (parent spawns subprocesses freely —
//         │ nativeExec against mp    │  its event loop has no FUSE callbacks)
//         │ nativeExec against mp    │
//         │                          │
//         │ helper.kill(SIGTERM)     │ unmount, close, exit
//         └──────────────────────────┘
//
// Key property: the PARENT process never mounts FUSE, so its event loop
// is free to await child_process.spawn() output. The CHILD process owns
// the mount but never spawns subprocesses itself. Neither process hits
// the single-event-loop deadlock documented at /typescript/limitations.
import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { nativeExec } from '@struktoai/mirage-node'

const HELPER_PATH = fileURLToPath(new URL('./helper.ts', import.meta.url))

function spawnHelper(): ChildProcess {
  return spawn('pnpm', ['tsx', HELPER_PATH], {
    stdio: ['ignore', 'pipe', 'inherit'],
  })
}

async function readFirstStdoutLine(child: ChildProcess): Promise<string> {
  const stream = child.stdout
  if (stream === null) throw new Error('helper has no stdout pipe')
  const rl = createInterface({ input: stream })
  for await (const line of rl) {
    rl.close()
    return line.trim()
  }
  throw new Error('helper exited before printing a mountpoint')
}

async function main(): Promise<void> {
  console.log('=== spawning helper process to own the FUSE mount ===\n')
  const helper = spawnHelper()

  // Read the mountpoint the child prints once it has finished mounting.
  const mp = await readFirstStdoutLine(helper)
  console.log(`helper mounted at: ${mp}\n`)

  try {
    console.log('=== running nativeExec against the helper-owned mount ===\n')
    // NOTE: we run the subprocesses with cwd=/tmp and reference absolute paths
    // under the mountpoint. Using `cwd: mp` can fail with EIO on macOS because
    // spawn's chdir() raced the FUSE kernel handshake — the shell itself has
    // no such trouble because it chdirs AFTER the mount is fully live.

    const r1 = await nativeExec(`cat ${mp}/data/hello.txt`, { cwd: '/tmp' })
    console.log(`cat hello.txt → exit ${String(r1.exitCode)}`)
    console.log(`  stdout: ${JSON.stringify(r1.stdoutText)}\n`)

    const r2 = await nativeExec(`wc -l ${mp}/data/multi.txt`, { cwd: '/tmp' })
    console.log(`wc -l multi.txt → exit ${String(r2.exitCode)}`)
    console.log(`  stdout: ${r2.stdoutText.trim()}\n`)

    const r3 = await nativeExec(`grep line2 ${mp}/data/multi.txt`, { cwd: '/tmp' })
    console.log(`grep line2 multi.txt → exit ${String(r3.exitCode)}`)
    console.log(`  stdout: ${r3.stdoutText.trim()}\n`)

    // This is the line that would DEADLOCK if we owned the mount in-process.
    // Here it just works — the parent's event loop has no FUSE callbacks to
    // service, so awaiting the subprocess is fine.
    console.log('=== pipeline: find + head + xargs cat (real shell) ===\n')
    const r4 = await nativeExec(
      `find ${mp}/data -type f | head -n 1 | xargs -I{} cat {}`,
      { cwd: '/tmp' },
    )
    console.log(`pipeline → exit ${String(r4.exitCode)}`)
    console.log(`  stdout: ${JSON.stringify(r4.stdoutText)}\n`)
  } finally {
    console.log('=== shutting down helper ===')
    helper.kill('SIGTERM')
    // Wait for the helper to finish unmounting before the parent exits
    // so we don't leak a kernel mount.
    await new Promise<void>((resolve) => {
      helper.on('close', () => {
        resolve()
      })
    })
    console.log('helper exited cleanly.')
  }
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
