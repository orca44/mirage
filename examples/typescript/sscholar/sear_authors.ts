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

import { MountMode, SSCholarPaperResource, Workspace } from '@struktoai/mirage-node'

const resource = new SSCholarPaperResource({ config: {}, prefix: '/sscholar' })
const ws = new Workspace({ '/sscholar/': resource }, { mode: MountMode.READ })
const DEC = new TextDecoder()

const paperId = '65a15eb6186ac43f62d0b6b30817d32ad8f82671'
const base = `/sscholar/computer-science/2026/${paperId}`

const cmds = [
  `cat ${base}/authors.json`,
  `cat ${base}/authors.json | jq "[.[].name]"`,
  `cat ${base}/authors.json | jq ".[].name" | head -n 5`,
]

for (const cmd of cmds) {
  console.log(`\n$ ${cmd}`)
  for (let i = 0; i < 30; i++) {
    const r = await ws.execute(cmd)
    const stderr = DEC.decode(r.stderr)
    if (stderr.includes('429')) {
      process.stderr.write(`  [${String(i + 1)}: 429]\n`)
      await new Promise((res) => setTimeout(res, 4000 + i * 500))
      continue
    }
    if (stderr.length > 0) process.stderr.write(stderr)
    process.stdout.write(DEC.decode(r.stdout))
    break
  }
}
await ws.close()
await resource.close()
