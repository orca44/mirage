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
import { MountMode, PostHogResource, Workspace } from '@struktoai/mirage-node'

dotenv.config({ path: '.env.development' })

const apiKey = process.env.POSTHOG_API_KEY ?? null
const host = (process.env.POSTHOG_HOST ?? 'us') as 'us' | 'eu'
if (apiKey === null) {
  console.error('POSTHOG_API_KEY missing in .env.development (use a personal API key)')
  process.exit(1)
}

const resource = new PostHogResource({ config: { apiKey, host }, prefix: '/posthog' })
const ws = new Workspace({ '/posthog/': resource }, { mode: MountMode.READ })

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
  await run('ls /posthog', 'ls /posthog')
  await run('cat /posthog/user.json | head -c 400', 'cat /posthog/user.json | head -c 400')
  await run('ls /posthog/projects | head -n 3', 'ls /posthog/projects | head -n 3')

  const list = await ws.execute('ls /posthog/projects | head -n 1')
  const firstId = DEC.decode(list.stdout).trim()
  if (firstId === '') {
    console.log('\nno projects')
    process.exit(0)
  }
  const base = `/posthog/projects/${firstId}`
  await run(`ls ${base}`, `ls ${base}`)
  await run(`cat ${base}/info.json | head -c 600`, `cat ${base}/info.json | head -c 600`)
  await run(
    `cat ${base}/feature_flags.json | head -c 400`,
    `cat ${base}/feature_flags.json | head -c 400`,
  )
  await run(`cat ${base}/dashboards.json | head -c 400`, `cat ${base}/dashboards.json | head -c 400`)
} finally {
  await ws.close()
  await resource.close()
}
