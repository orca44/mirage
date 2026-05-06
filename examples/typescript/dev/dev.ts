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

import { DevResource, MountMode, Workspace } from '@struktoai/mirage-node'

async function main(): Promise<void> {
  const dev = new DevResource()
  const ws = new Workspace({ '/dev': dev }, { mode: MountMode.WRITE })

  console.log('=== ls /dev/ ===')
  const lsRes = await ws.execute('ls /dev/')
  process.stdout.write(lsRes.stdoutText + '\n')

  console.log('=== stat /dev/null ===')
  const statNull = await ws.execute('stat /dev/null')
  process.stdout.write(statNull.stdoutText + '\n')

  console.log('=== stat /dev/zero ===')
  const statZero = await ws.execute('stat /dev/zero')
  process.stdout.write(statZero.stdoutText + '\n')

  console.log('=== wc -c /dev/null (should be 0) ===')
  const wcNull = await ws.execute('wc -c /dev/null')
  process.stdout.write(wcNull.stdoutText + '\n')

  console.log('=== wc -c /dev/zero (should be 1048576) ===')
  const wcZero = await ws.execute('wc -c /dev/zero')
  process.stdout.write(wcZero.stdoutText + '\n')

  console.log('=== md5 /dev/zero (1 MiB of zero bytes) ===')
  const md5Zero = await ws.execute('md5 /dev/zero')
  process.stdout.write(md5Zero.stdoutText + '\n')

  console.log('=== write to /dev/null is silently dropped ===')
  await ws.execute('echo "this disappears" | tee /dev/null')
  const after = await ws.execute('wc -c /dev/null')
  process.stdout.write(`after write: ${after.stdoutText}\n`)

  await ws.close()
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
