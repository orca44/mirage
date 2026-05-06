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

function loadFile(name: string): Uint8Array {
  const buf = readFileSync(`${DATA_DIR}/${name}`)
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
}

async function run(ws: Workspace, cmd: string): Promise<void> {
  console.log(`\n$ ${cmd}`)
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

  await fs.promises.writeFile('/data/example.parquet', loadFile('example.parquet'))
  await fs.promises.writeFile('/data/example.feather', loadFile('example.feather'))
  await fs.promises.writeFile('/data/example.h5', loadFile('example.h5'))

  console.log('Loaded parquet, feather, h5 into /data/')

  console.log('\n━━━ PARQUET ━━━')
  await run(ws, 'head -n 3 /data/example.parquet')
  await run(ws, 'wc /data/example.parquet')
  await run(ws, 'cut -f id,value /data/example.parquet')
  await run(ws, 'grep item_3 /data/example.parquet')

  console.log('\n━━━ FEATHER ━━━')
  await run(ws, 'head -n 3 /data/example.feather')
  await run(ws, 'wc /data/example.feather')
  await run(ws, 'cut -f id,label /data/example.feather')

  console.log('\n━━━ HDF5 ━━━')
  await run(ws, 'head -n 3 /data/example.h5')
  await run(ws, 'wc /data/example.h5')
  await run(ws, 'stat /data/example.h5')

  console.log('\n━━━ VFS (fs.promises.readFile dispatches via filetype read op) ━━━')
  console.log('\n--- parquet ---')
  console.log((await fs.promises.readFile('/data/example.parquet', 'utf-8')).slice(0, 200))
  console.log('\n--- feather ---')
  console.log((await fs.promises.readFile('/data/example.feather', 'utf-8')).slice(0, 200))
  console.log('\n--- hdf5 ---')
  console.log((await fs.promises.readFile('/data/example.h5', 'utf-8')).slice(0, 200))

  await ws.close()
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
