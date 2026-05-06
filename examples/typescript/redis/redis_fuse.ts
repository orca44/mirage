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

import { readdir, stat } from 'node:fs/promises'
import { createInterface } from 'node:readline/promises'
import { FuseManager, MountMode, RedisResource, Workspace } from '@struktoai/mirage-node'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379/0'
const KEY_PREFIX = 'mirage:fs:'

async function seed(): Promise<void> {
  const resource = new RedisResource({ url: REDIS_URL, keyPrefix: KEY_PREFIX })
  await resource.open()
  await resource.store.clear()
  await resource.store.addDir('/')

  const ws = new Workspace({ '/data/': resource }, { mode: MountMode.WRITE })
  try {
    await ws.execute('echo "hello world" | tee /data/hello.txt')
    await ws.execute('mkdir /data/sub')
    await ws.execute('echo "nested content" | tee /data/sub/nested.txt')
    await ws.execute(`echo '{"key": "value"}' | tee /data/example.json`)
  } finally {
    await ws.close()
  }
  await resource.close()
}

async function main(): Promise<void> {
  await seed()
  console.log('Seeded Redis with sample files')

  const resource = new RedisResource({ url: REDIS_URL, keyPrefix: KEY_PREFIX })
  const ws = new Workspace({ '/data/': resource }, { mode: MountMode.WRITE })
  const fm = new FuseManager()
  const mp = await fm.setup(ws)
  let cleaned = false
  const handler = (sig: NodeJS.Signals): void => {
    if (cleaned) return
    cleaned = true
    void (async (): Promise<void> => {
      try { await fm.close(ws) } catch {}
      try { await ws.close() } catch {}
      console.error(`\n>>> unmounted ${mp}`)
      process.exit(sig === "SIGINT" ? 130 : 143)
    })()
  }
  process.on("SIGINT", handler)
  process.on("SIGTERM", handler)
  try {
    console.log(`\n=== FUSE MODE: mounted at ${mp} ===\n`)

    const dataPath = `${mp}/data`
    console.log('--- real fs.promises.readdir() ---')
    const entries = (await readdir(dataPath)).sort()
    for (const name of entries) {
      const full = `${dataPath}/${name}`
      const st = await stat(full)
      if (st.isFile()) {
        console.log(`  ${name.padEnd(30)} ${st.size.toLocaleString('en-US').padStart(10)} bytes`)
      } else {
        console.log(`  ${name.padEnd(30)} <dir>`)
      }
    }

    console.log(`\n>>> FUSE mounted at: ${mp}`)
    console.log('>>> Open another terminal and try:')
    console.log(`>>>   ls -la ${mp}/data/`)
    console.log(`>>>   cat ${mp}/data/hello.txt`)
    console.log(`>>>   cat ${mp}/data/example.json | jq .`)
    console.log(`>>>   cat ${mp}/.mirage/whoami`)
    console.log('>>> Press Enter to unmount and exit...')

    const rl = createInterface({ input: process.stdin, output: process.stdout })
    await rl.question('')
    rl.close()

    const day = new Date().toISOString().slice(0, 10)
    const log = await ws.execute(`tail -n 5 /.sessions/${day}/*.jsonl`)
    console.log(`\n--- recent ops (/.sessions/${day}/*.jsonl) ---`)
    process.stdout.write(log.stdoutText)
  } finally {
    await fm.close()
    await ws.close()
    await resource.store.clear()
  }
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
