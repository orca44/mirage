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
import { DropboxResource, MountMode, Workspace, type DropboxConfig } from '@struktoai/mirage-node'

const __HERE = fileURLToPath(new URL('.', import.meta.url))
dotenv.config({ path: resolve(__HERE, '../../../.env.development'), override: true })

function buildConfig(): DropboxConfig {
  const clientId = process.env.DROPBOX_APP_KEY ?? ''
  const clientSecret = process.env.DROPBOX_APP_SECRET ?? ''
  const refreshToken = process.env.DROPBOX_REFRESH_TOKEN ?? ''
  if (clientId === '' || clientSecret === '' || refreshToken === '') {
    throw new Error(
      'DROPBOX_APP_KEY / DROPBOX_APP_SECRET / DROPBOX_REFRESH_TOKEN are required',
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
  const resource = new DropboxResource(buildConfig())
  const ws = new Workspace({ '/dropbox': resource }, { mode: MountMode.READ })
  try {
    const root = await run(ws, 'ls /dropbox/')
    printOut('ls /dropbox/', root.out, root.err)

    const entries = root.out.trim().split('\n').filter((s) => s !== '')
    if (entries.length === 0) {
      console.log('No files in /dropbox/')
      return
    }
    const first = entries[0]!

    const stat = await run(ws, `stat "/dropbox/${first}"`)
    console.log(`=== stat /dropbox/${first} ===`)
    console.log(`  ${stat.out.trim()}`)

    if (first.endsWith('/')) {
      const subLs = await run(ws, `ls "/dropbox/${first}"`)
      printOut(`ls /dropbox/${first}`, subLs.out, subLs.err)
      const subEntries = subLs.out.trim().split('\n').filter((s) => s !== '')
      const sub = subEntries[0]
      if (sub !== undefined && !sub.endsWith('/')) {
        const cat = await run(ws, `cat "/dropbox/${first}${sub}"`)
        printOut(`cat /dropbox/${first}${sub}`, cat.out, cat.err)
      }
    } else {
      const cat = await run(ws, `head -c 200 "/dropbox/${first}"`)
      printOut(`head -c 200 /dropbox/${first}`, cat.out, cat.err)
    }

    const tree = await run(ws, 'tree -L 2 /dropbox/')
    printOut('tree -L 2 /dropbox/', tree.out, tree.err, 1200)

    const records = ws.records
    const total = records.reduce((s, r) => s + (r.bytes ?? 0), 0)
    console.log(`\nStats: ${String(records.length)} ops, ${String(total)} bytes transferred`)
  } finally {
    await ws.close()
  }
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
