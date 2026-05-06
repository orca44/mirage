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

import {
  detectVercelScope,
  MountMode,
  VercelResource,
  VERCEL_ROOT_ENTRIES,
  Workspace,
} from '@struktoai/mirage-node'

const scope = detectVercelScope('/projects/prj_1/info.json')
console.log('scope:', JSON.stringify(scope, null, 2))
console.log('root entries:', [...VERCEL_ROOT_ENTRIES])

const resource = new VercelResource({ config: { token: 'dummy' }, prefix: '/vercel' })
const ws = new Workspace({ '/vercel/': resource }, { mode: MountMode.READ })
const r = await ws.execute('ls /vercel')
console.log('ls /vercel:', new TextDecoder().decode(r.stdout))
await ws.close()
await resource.close()
