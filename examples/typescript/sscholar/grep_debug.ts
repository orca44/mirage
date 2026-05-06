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

const variants = [
  'grep "Schema-Based Evaluation and Routing"',
  "grep 'Schema-Based Evaluation and Routing'",
  'grep "Schema-Based"',
  'grep Schema-Based',
  'grep "Schema-Based Evaluation and Routing" /sscholar',
  'cd /sscholar && grep "Schema-Based"',
]

for (const v of variants) {
  const r = await ws.execute(v)
  const out = DEC.decode(r.stdout).slice(0, 200)
  const err = DEC.decode(r.stderr).slice(0, 200)
  console.log(`\n$ ${v}`)
  console.log(`  exit=${String(r.exitCode)}`)
  if (out !== '') console.log(`  stdout: ${out}`)
  if (err !== '') console.log(`  stderr: ${err}`)
}
await ws.close()
await resource.close()
