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
import { MountMode, SSCholarPaperResource, Workspace } from '@struktoai/mirage-node'

dotenv.config({ path: '.env.development' })

const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY ?? null

const DEC = new TextDecoder()

async function dump(ws: Workspace, label: string, cmd: string): Promise<void> {
  console.log(`\n--- ${label} ---`)
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

async function main(): Promise<void> {
  const resource = new SSCholarPaperResource({ config: { apiKey }, prefix: '/sscholar' })
  const ws = new Workspace({ '/sscholar/': resource }, { mode: MountMode.READ })

  try {
    console.log('=== VFS MODE: shell pipelines transparently read Semantic Scholar ===')

    await dump(ws, 'ls /sscholar | wc -l (should be 23 fields)', 'ls /sscholar | wc -l')
    await dump(ws, 'ls /sscholar | head -n 5', 'ls /sscholar | head -n 5')
    await dump(ws, 'ls /sscholar/computer-science | tail -n 3', 'ls /sscholar/computer-science | tail -n 3')

    const yearList = await ws.execute('ls /sscholar/computer-science/2024')
    if (yearList.exitCode !== 0) {
      console.log(`\n${DEC.decode(yearList.stderr)}`)
      console.log('VFS demo can only show static structure without an API key.')
      return
    }

    const ids = DEC.decode(yearList.stdout).split('\n').filter((s) => s.length > 0)
    if (ids.length === 0) return
    const base = `/sscholar/computer-science/2024/${ids[0]!}`

    await dump(ws, `wc -c ${base}/abstract.txt`, `wc -c ${base}/abstract.txt`)
    await dump(ws, `head -n 2 ${base}/tldr.txt`, `head -n 2 ${base}/tldr.txt`)
    await dump(ws, `jq .title ${base}/meta.json`, `jq .title ${base}/meta.json`)
    await dump(ws, `cat ${base}/authors.json | jq "[.[].name]"`, `cat ${base}/authors.json | jq "[.[].name]"`)
    await dump(ws, `grep -c year ${base}/meta.json`, `grep -c year ${base}/meta.json`)
  } finally {
    await ws.close()
    await resource.close()
  }
}

await main()
