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
import {
  MountMode,
  SSCholarAuthorResource,
  SSCholarPaperResource,
  Workspace,
} from '@struktoai/mirage-node'

dotenv.config({ path: '.env.development' })

const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY ?? null
const config = { apiKey }

const paperResource = new SSCholarPaperResource({ config, prefix: '/sscholar-paper' })
const authorResource = new SSCholarAuthorResource({ config, prefix: '/sscholar-author' })

const ws = new Workspace(
  {
    '/sscholar-paper/': paperResource,
    '/sscholar-author/': authorResource,
  },
  { mode: MountMode.READ },
)

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
  await run('ls /sscholar-paper (23 fields)', 'ls /sscholar-paper | head -n 6')
  await run('ls /sscholar-paper/computer-science | head -n 5', 'ls /sscholar-paper/computer-science | head -n 5')

  const paperId = '65a15eb6186ac43f62d0b6b30817d32ad8f82671'
  const paperBase = `/sscholar-paper/computer-science/2026/${paperId}`
  await run(`cat ${paperBase}/authors.json`, `cat ${paperBase}/authors.json`)

  const authorId = '2294848842'
  const authorBase = `/sscholar-author/${authorId}`
  await run(`ls ${authorBase}`, `ls ${authorBase}`)
  await run(`cat ${authorBase}/profile.json`, `cat ${authorBase}/profile.json`)
  await run(`cat ${authorBase}/papers.json | head -c 800`, `cat ${authorBase}/papers.json | head -c 800`)

  await run(
    'find-author "Zecheng Zhang" /sscholar-author',
    'find-author "Zecheng Zhang" /sscholar-author',
  )
} finally {
  await ws.close()
  await paperResource.close()
  await authorResource.close()
}
