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

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { BoxResource, MountMode, Workspace, type BoxConfig } from '@struktoai/mirage-node'

const __HERE = fileURLToPath(new URL('.', import.meta.url))
dotenv.config({ path: resolve(__HERE, '../../../.env.development'), override: true })

function buildConfig(): BoxConfig {
  const devToken = process.env.BOX_DEVELOPER_TOKEN ?? process.env.BOX_ACCESS_TOKEN ?? ''
  if (devToken !== '') {
    return { accessToken: devToken }
  }
  const clientId = process.env.BOX_CLIENT_ID ?? ''
  const clientSecret = process.env.BOX_CLIENT_SECRET ?? ''
  const refreshToken = process.env.BOX_REFRESH_TOKEN ?? ''
  if (clientId === '' || clientSecret === '' || refreshToken === '') {
    throw new Error(
      'Provide BOX_DEVELOPER_TOKEN, or BOX_CLIENT_ID + BOX_CLIENT_SECRET + BOX_REFRESH_TOKEN',
    )
  }
  return { clientId, clientSecret, refreshToken }
}

async function run(
  ws: Workspace,
  cmd: string,
): Promise<{ out: string; err: string; code: number }> {
  try {
    const r = await ws.execute(cmd)
    return { out: r.stdoutText, err: r.stderrText, code: r.exitCode }
  } catch (err) {
    return { out: '', err: err instanceof Error ? err.message : String(err), code: 1 }
  }
}

function printOut(label: string, out: string, err: string, max = 500): void {
  console.log(`=== ${label} ===`)
  if (out !== '') console.log(out.length > max ? out.slice(0, max) + '...' : out)
  if (err !== '') process.stderr.write(`  STDERR: ${err.trim().slice(0, 200)}\n`)
}

async function main(): Promise<void> {
  const resource = new BoxResource(buildConfig())
  const ws = new Workspace({ '/box': resource }, { mode: MountMode.READ })
  try {
    const root = await run(ws, 'ls /box/')
    printOut('ls /box/', root.out, root.err)

    const entries = root.out.trim().split('\n').filter((s) => s !== '')
    if (entries.length === 0) {
      console.log('No items in /box/')
      return
    }
    const first = entries[0]!

    const stat = await run(ws, `stat "/box/${first}"`)
    console.log(`=== stat /box/${first} ===`)
    console.log(`  ${stat.out.trim()}`)

    if (first.endsWith('/')) {
      const subLs = await run(ws, `ls "/box/${first}"`)
      printOut(`ls /box/${first}`, subLs.out, subLs.err)
      const subEntries = subLs.out.trim().split('\n').filter((s) => s !== '')
      const sub = subEntries[0]
      if (sub !== undefined && !sub.endsWith('/')) {
        const cat = await run(ws, `head -c 200 "/box/${first}${sub}"`)
        printOut(`head -c 200 /box/${first}${sub}`, cat.out, cat.err)
      }
    } else {
      const cat = await run(ws, `head -c 200 "/box/${first}"`)
      printOut(`head -c 200 /box/${first}`, cat.out, cat.err)
    }

    const tree = await run(ws, 'tree -L 2 /box/')
    printOut('tree -L 2 /box/', tree.out, tree.err, 1200)
  } finally {
    await ws.close()
  }
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
