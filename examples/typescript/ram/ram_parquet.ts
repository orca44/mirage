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

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { MountMode, RAMResource, Workspace, patchNodeFs } from '@struktoai/mirage-node'

const require = createRequire(import.meta.url)
const fs = require('fs') as typeof import('fs')

const DATA_DIR = new URL('../../../data', import.meta.url).pathname
const PARQUET_BYTES = readFileSync(`${DATA_DIR}/example.parquet`)

async function runLabeled(ws: Workspace, label: string, cmd: string): Promise<void> {
  console.log(`\n=== ${label} ===`)
  const r = await ws.execute(cmd)
  const out = r.stdoutText.replace(/\s+$/, '')
  if (out !== '') console.log(out)
  const err = r.stderrText
  if (err !== '') console.error('stderr:', err.trimEnd())
  if (r.exitCode !== 0) console.error(`exit=${String(r.exitCode)}`)
}

async function main(): Promise<void> {
  const ws = new Workspace({ '/data': new RAMResource() }, { mode: MountMode.WRITE })
  patchNodeFs(ws)

  await fs.promises.writeFile(
    '/data/example.parquet',
    new Uint8Array(PARQUET_BYTES.buffer, PARQUET_BYTES.byteOffset, PARQUET_BYTES.byteLength),
  )

  console.log('Loaded /data/example.parquet into RAM mount')

  await runLabeled(ws, 'cat /data/example.parquet', 'cat /data/example.parquet')
  await runLabeled(ws, 'head -n 3 /data/example.parquet', 'head -n 3 /data/example.parquet')
  await runLabeled(ws, 'tail -n 3 /data/example.parquet', 'tail -n 3 /data/example.parquet')
  await runLabeled(ws, 'wc /data/example.parquet', 'wc /data/example.parquet')
  await runLabeled(ws, 'stat /data/example.parquet', 'stat /data/example.parquet')

  console.log('\n=== fs.promises.readFile (goes through read op with filetype=.parquet) ===')
  const rendered = await fs.promises.readFile('/data/example.parquet', 'utf-8')
  console.log(rendered.replace(/\s+$/, ''))

  await fs.promises.writeFile('/data/hello.txt', 'plain text\n')
  console.log('\n=== fs.promises.readFile on plain .txt (default read op) ===')
  console.log((await fs.promises.readFile('/data/hello.txt', 'utf-8')).trimEnd())

  await ws.close()
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
