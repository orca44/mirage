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

import dotenv from 'dotenv'
import { MountMode, SSCholarPaperResource, Workspace } from '@struktoai/mirage-node'

dotenv.config({ path: '.env.development' })

const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY ?? null

const DEC = new TextDecoder()

async function attempt(
  ws: Workspace,
  cmd: string,
): Promise<{ stdout: string; stderr: string; exit: number }> {
  const r = await ws.execute(cmd)
  return {
    stdout: DEC.decode(r.stdout),
    stderr: DEC.decode(r.stderr),
    exit: r.exitCode,
  }
}

async function retry(
  ws: Workspace,
  label: string,
  cmd: string,
  tries = 30,
): Promise<{ stdout: string; stderr: string; exit: number }> {
  console.log(`\n=== ${label} ===`)
  console.log(`$ ${cmd}`)
  for (let i = 0; i < tries; i++) {
    const r = await attempt(ws, cmd)
    if (r.exit === 0 || !r.stderr.includes('429')) {
      if (r.stderr.length > 0) process.stderr.write(r.stderr)
      if (r.stdout.length > 0) process.stdout.write(r.stdout + (r.stdout.endsWith('\n') ? '' : '\n'))
      if (r.exit !== 0) console.log(`(exit=${String(r.exit)})`)
      return r
    }
    const waitMs = Math.min(2_000 * (i + 1), 15_000)
    process.stderr.write(
      `  [attempt ${String(i + 1)}/${String(tries)}: 429, retrying in ${String(waitMs / 1000)}s]\n`,
    )
    await new Promise((res) => setTimeout(res, waitMs))
  }
  console.log('(gave up after retries)')
  return { stdout: '', stderr: '', exit: 1 }
}

async function main(): Promise<void> {
  const resource = new SSCholarPaperResource({ config: { apiKey }, prefix: '/sscholar' })
  const ws = new Workspace({ '/sscholar/': resource }, { mode: MountMode.READ })

  try {
    await retry(
      ws,
      'search the paper by title',
      'search "SEAR Schema-Based Evaluation Routing LLM Gateways" /sscholar',
    )

    await retry(
      ws,
      'grep for unique phrase from the title',
      'grep "Schema-Based Evaluation and Routing" /sscholar',
    )

    const paperId = '65a15eb6186ac43f62d0b6b30817d32ad8f82671'
    const base = `/sscholar/computer-science/2026/${paperId}`

    await retry(ws, `cat ${base}/meta.json`, `cat ${base}/meta.json`)
    await retry(ws, `cat ${base}/tldr.txt`, `cat ${base}/tldr.txt`)
    await retry(ws, `cat ${base}/abstract.txt | head -c 600`, `cat ${base}/abstract.txt | head -c 600`)
  } finally {
    await ws.close()
    await resource.close()
  }
}

await main()
