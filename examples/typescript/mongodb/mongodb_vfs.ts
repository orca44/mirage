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

import { setServers } from 'node:dns'
import dotenv from 'dotenv'
import { MongoDBResource, MountMode, Workspace } from '@struktoai/mirage-node'

setServers(['8.8.8.8', '1.1.1.1'])
dotenv.config({ path: '.env.development' })

const uri = process.env.MONGODB_URI
if (uri === undefined) {
  console.error('MONGODB_URI missing in .env.development')
  process.exit(1)
}

const DEC = new TextDecoder()

async function dump(ws: Workspace, label: string, cmd: string): Promise<void> {
  console.log(`\n--- ${label} ---`)
  const r = await ws.execute(cmd)
  if (r.exitCode !== 0) {
    console.log(`(exit=${String(r.exitCode)}) ${DEC.decode(r.stderr)}`)
    return
  }
  process.stdout.write(DEC.decode(r.stdout))
  if (!DEC.decode(r.stdout).endsWith('\n')) process.stdout.write('\n')
}

async function main(): Promise<void> {
  const resource = new MongoDBResource({
    uri,
    defaultDocLimit: 50,
  })
  const ws = new Workspace({ '/mongodb/': resource }, { mode: MountMode.READ })

  try {
    console.log('=== VFS MODE: shell pipelines transparently read MongoDB ===')

    await dump(ws, 'ls /mongodb — databases', 'ls /mongodb')

    const dbsOut = await ws.execute('ls /mongodb')
    const dbs = DEC.decode(dbsOut.stdout).split('\n').filter((s) => s.length > 0)
    if (dbs.length === 0) {
      console.log('\nno databases')
      return
    }
    const target = dbs[0]!

    await dump(ws, `ls /mongodb/${target}`, `ls /mongodb/${target} | head -n 5`)

    const colsOut = await ws.execute(`ls /mongodb/${target}`)
    const cols = DEC.decode(colsOut.stdout).split('\n').filter((s) => s.endsWith('.jsonl'))
    if (cols.length === 0) {
      console.log(`\nno collections in ${target}`)
      return
    }
    const path = `/mongodb/${target}/${cols[0]!}`

    await dump(ws, `head -n 1 ${path}`, `head -n 1 ${path}`)
    await dump(ws, `wc -l ${path}`, `wc -l ${path}`)
    await dump(ws, `cat ${path} | wc -l`, `cat ${path} | wc -l`)
    await dump(ws, `jq -s ".[0]" ${path}`, `jq -s ".[0]" ${path}`)
  } finally {
    await ws.close()
    await resource.close()
  }
}

await main()
