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

const resource = new MongoDBResource({ uri })
const ws = new Workspace({ '/mongodb/': resource }, { mode: MountMode.READ })

const DEC = new TextDecoder()

async function run(label: string, cmd: string): Promise<void> {
  console.log(`\n=== ${label} ===`)
  const r = await ws.execute(cmd)
  if (r.exitCode !== 0) {
    console.log(`(exit=${String(r.exitCode)})`)
    if (r.stderr.byteLength > 0) console.log(DEC.decode(r.stderr))
    if (r.stdout.byteLength > 0) console.log(DEC.decode(r.stdout))
    return
  }
  process.stdout.write(DEC.decode(r.stdout))
  if (!DEC.decode(r.stdout).endsWith('\n')) process.stdout.write('\n')
}

try {
  await run('ls /mongodb', 'ls /mongodb')

  const dbsOut = await ws.execute('ls /mongodb')
  const dbs = DEC.decode(dbsOut.stdout).split('\n').filter((s) => s.length > 0)
  if (dbs.length === 0) {
    console.log('\nno databases visible; stopping')
    process.exit(0)
  }
  const target = dbs[0]!
  await run(`ls /mongodb/${target}`, `ls /mongodb/${target}`)

  const colsOut = await ws.execute(`ls /mongodb/${target}`)
  const cols = DEC.decode(colsOut.stdout).split('\n').filter((s) => s.endsWith('.jsonl'))
  if (cols.length === 0) {
    console.log(`\nno collections in ${target}; stopping`)
    process.exit(0)
  }
  const col = cols[0]!
  const path = `/mongodb/${target}/${col}`

  await run(`stat ${path}`, `stat ${path}`)
  await run(`head -n 3 ${path}`, `head -n 3 ${path}`)
  await run(`tail -n 2 ${path}`, `tail -n 2 ${path}`)
  await run(`wc -l ${path}`, `wc -l ${path}`)
  await run(`cat ${path} | head -n 1`, `cat ${path} | head -n 1`)
  await run(`jq -s ".[0]" ${path}`, `jq -s ".[0]" ${path}`)
  await run(`find /mongodb/${target} -maxdepth 1`, `find /mongodb/${target} -maxdepth 1`)
  await run(`tree -L 2 /mongodb/${target}`, `tree -L 2 /mongodb/${target}`)
} finally {
  await ws.close()
  await resource.close()
}
