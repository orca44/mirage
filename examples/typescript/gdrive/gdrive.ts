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
import { GDriveResource, MountMode, Workspace, type GDriveConfig } from '@struktoai/mirage-node'

const __HERE = fileURLToPath(new URL('.', import.meta.url))
dotenv.config({ path: resolve(__HERE, '../../../.env.development'), override: true })

function buildConfig(): GDriveConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? ''
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? ''
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN ?? ''
  if (clientId === '' || clientSecret === '' || refreshToken === '') {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN are required')
  }
  return { clientId, clientSecret, refreshToken }
}

async function run(ws: Workspace, cmd: string): Promise<{ out: string; err: string; code: number }> {
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
  const resource = new GDriveResource(buildConfig())
  const ws = new Workspace({ '/gdrive': resource }, { mode: MountMode.WRITE })
  try {
    const root = await run(ws, 'ls /gdrive/')
    printOut('ls /gdrive/', root.out, root.err)

    const entries = root.out.trim().split('\n').filter((s) => s !== '')
    if (entries.length === 0) {
      console.log('No files in /gdrive/')
      return
    }
    const first = entries[0]!

    const stat = await run(ws, `stat "/gdrive/${first}"`)
    console.log(`=== stat /gdrive/${first} ===`)
    console.log(`  ${stat.out.trim()}`)

    if (first.endsWith('/')) {
      const subLs = await run(ws, `ls "/gdrive/${first}"`)
      printOut(`ls /gdrive/${first}`, subLs.out, subLs.err)
      const subEntries = subLs.out.trim().split('\n').filter((s) => s !== '')
      const sub = subEntries[0]
      if (sub !== undefined && !sub.endsWith('/')) {
        const cat = await run(ws, `cat "/gdrive/${first}${sub}"`)
        printOut(`cat /gdrive/${first}${sub}`, cat.out, cat.err)
      }
    }

    const tree = await run(ws, 'tree -L 1 /gdrive/')
    printOut('tree -L 1 /gdrive/', tree.out, tree.err, 800)

    console.log('\n=== find /gdrive/ -name \'*.gdoc.json\' | head -n 5 ===')
    const findDocs = await run(ws, "find /gdrive/ -name '*.gdoc.json' | head -n 5")
    console.log(findDocs.out.trim())

    const docFiles = findDocs.out.trim().split('\n').filter((s) => s !== '')
    const firstDoc = docFiles[0]
    if (firstDoc !== undefined && firstDoc !== '') {
      const jq = await run(ws, `cat "${firstDoc}" | jq ".title"`)
      console.log(`=== cat ${firstDoc} | jq .title ===`)
      console.log(`  ${jq.out.trim()}`)
    }

    console.log('\n=== gws-docs-documents-create (registered under gdrive too) ===')
    const create = await run(
      ws,
      "gws-docs-documents-create --json '{\"title\": \"MIRAGE Drive Cross-Resource Demo\"}'",
    )
    if (create.code === 0) {
      const doc = JSON.parse(create.out) as { documentId?: string }
      console.log(`Created via gdrive: ${doc.documentId ?? '(no id)'}`)
    } else {
      printOut('create', create.out, create.err)
    }
  } finally {
    await ws.close()
  }
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
