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

import { readdir, readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import {
  FuseManager,
  GitHubResource,
  MountMode,
  Workspace,
  type GitHubConfig,
} from '@struktoai/mirage-node'

const __HERE = fileURLToPath(new URL('.', import.meta.url))
dotenv.config({ path: resolve(__HERE, '../../../.env.development') })

function buildConfig(): GitHubConfig {
  const token = process.env.GITHUB_TOKEN
  if (token === undefined || token === '') throw new Error('GITHUB_TOKEN env var is required')
  const owner = process.env.GITHUB_OWNER ?? 'anthropics'
  const repo = process.env.GITHUB_REPO ?? 'anthropic-sdk-typescript'
  const ref = process.env.GITHUB_REF
  return ref !== undefined ? { token, owner, repo, ref } : { token, owner, repo }
}

async function main(): Promise<void> {
  const cfg = buildConfig()
  console.log(`Loading ${cfg.owner}/${cfg.repo} …`)
  const resource = await GitHubResource.create(cfg)
  const ws = new Workspace({ '/github': resource }, { mode: MountMode.READ })
  const fm = new FuseManager()
  const mp = await fm.setup(ws)
  let cleaned = false
  const handler = (sig: NodeJS.Signals): void => {
    if (cleaned) return
    cleaned = true
    void (async (): Promise<void> => {
      try { await fm.close(ws) } catch {}
      try { await ws.close() } catch {}
      console.error(`\n>>> unmounted ${mp}`)
      process.exit(sig === "SIGINT" ? 130 : 143)
    })()
  }
  process.on("SIGINT", handler)
  process.on("SIGTERM", handler)
  try {
    console.log(`=== FUSE MODE: mounted at ${mp} ===\n`)

    console.log(`--- readdir() ${mp}/github ---`)
    const top = await readdir(`${mp}/github`)
    for (const r of top.slice(0, 10)) console.log(`  ${r}`)

    for (const name of ['README.md', 'package.json', 'pyproject.toml']) {
      try {
        const path = `${mp}/github/${name}`
        const text = await readFile(path, 'utf-8')
        console.log(`\n--- readFile() ${path} (first 200 chars) ---`)
        console.log(text.slice(0, 200))
        break
      } catch {
        continue
      }
    }

    console.log(`\n>>> FUSE mounted at: ${mp}`)
    console.log('>>> Open another terminal and run e.g.:')
    console.log(`>>>   ls ${mp}/github`)
    console.log(`>>>   cat ${mp}/github/README.md | head`)
    console.log('>>> Press Enter to unmount and exit...')

    const rl = createInterface({ input: process.stdin, output: process.stdout })
    await rl.question('')
    rl.close()
  } finally {
    await fm.close(ws)
    await ws.close()
  }
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
