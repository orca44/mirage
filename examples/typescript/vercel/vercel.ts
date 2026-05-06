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

import dotenv from 'dotenv'
import { MountMode, VercelResource, Workspace } from '@struktoai/mirage-node'

dotenv.config({ path: '.env.development' })

const token = process.env.VERCEL_TOKEN ?? null
if (token === null) {
  console.error('VERCEL_TOKEN missing in .env.development')
  process.exit(1)
}
const teamId = process.env.VERCEL_TEAM_ID ?? null

const resource = new VercelResource({
  config: { token, teamId },
  prefix: '/vercel',
})
const ws = new Workspace({ '/vercel/': resource }, { mode: MountMode.READ })

const DEC = new TextDecoder()

async function run(label: string, cmd: string): Promise<void> {
  console.log(`\n=== ${label} ===`)
  const r = await ws.execute(cmd)
  if (r.stderr.byteLength > 0) {
    const txt = DEC.decode(r.stderr)
    process.stderr.write(txt + (txt.endsWith('\n') ? '' : '\n'))
  }
  if (r.stdout.byteLength > 0) {
    const txt = DEC.decode(r.stdout)
    process.stdout.write(txt + (txt.endsWith('\n') ? '' : '\n'))
  }
  if (r.exitCode !== 0) console.log(`(exit=${String(r.exitCode)})`)
}

try {
  await run('ls /vercel', 'ls /vercel')
  await run('cat /vercel/user.json', 'cat /vercel/user.json')

  await run('ls /vercel/projects | head -n 5', 'ls /vercel/projects | head -n 5')

  const list = await ws.execute('ls /vercel/projects | head -n 1')
  const firstId = DEC.decode(list.stdout).trim()
  if (firstId === '') {
    console.log('\nno projects')
    process.exit(0)
  }
  const base = `/vercel/projects/${firstId}`
  await run(`ls ${base}`, `ls ${base}`)
  await run(`cat ${base}/info.json | head -c 600`, `cat ${base}/info.json | head -c 600`)
  await run(`cat ${base}/domains.json`, `cat ${base}/domains.json`)
  await run(`cat ${base}/env.json | head -c 400`, `cat ${base}/env.json | head -c 400`)

  await run(
    `ls ${base}/deployments | head -n 3`,
    `ls ${base}/deployments | head -n 3`,
  )

  const dList = await ws.execute(`ls ${base}/deployments | head -n 1`)
  const firstDep = DEC.decode(dList.stdout).trim()
  if (firstDep !== '') {
    const dBase = `${base}/deployments/${firstDep}`
    await run(`cat ${dBase}/info.json | head -c 600`, `cat ${dBase}/info.json | head -c 600`)
  }
} finally {
  await ws.close()
  await resource.close()
}
