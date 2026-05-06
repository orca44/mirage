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

import { MountMode, SSCholarPaperResource, Workspace } from '@struktoai/mirage-browser'

const logEl = document.getElementById('log')!

function line(text: string, cls?: string): void {
  const div = document.createElement('div')
  if (cls !== undefined) div.className = cls
  div.textContent = text
  logEl.appendChild(div)
}

async function run(ws: Workspace, cmd: string): Promise<void> {
  line(`$ ${cmd}`, 'prompt')
  const r = await ws.execute(cmd)
  const out = r.stdoutText.replace(/\s+$/, '')
  if (out !== '') line(out)
  const err = r.stderrText.replace(/\s+$/, '')
  if (err !== '') line(err, 'err')
  if (r.exitCode !== 0) line(`exit=${String(r.exitCode)}`, 'err')
}

declare const __SEMANTIC_SCHOLAR_API_KEY__: string

async function main(): Promise<void> {
  line('=== Semantic Scholar via direct fetch (CORS-open) ===', 'ok')

  const apiKey = __SEMANTIC_SCHOLAR_API_KEY__ === '' ? null : __SEMANTIC_SCHOLAR_API_KEY__
  if (apiKey === null) {
    line(
      '(no SEMANTIC_SCHOLAR_API_KEY set — anon shared pool, expect 429 on year listings)',
      'err',
    )
  }

  const resource = new SSCholarPaperResource({ config: { apiKey }, prefix: '/sscholar' })
  const ws = new Workspace({ '/sscholar/': resource }, { mode: MountMode.READ })

  try {
    await run(ws, 'ls /sscholar | head -n 8')
    await run(ws, 'ls /sscholar/computer-science | tail -n 5')
    await run(ws, 'ls /sscholar/computer-science/2024')

    const list = await ws.execute('ls /sscholar/computer-science/2024 | head -n 1')
    const firstId = list.stdoutText.trim()
    if (firstId !== '') {
      const base = `/sscholar/computer-science/2024/${firstId}`
      await run(ws, `ls ${base}`)
      await run(ws, `cat ${base}/tldr.txt`)
      await run(ws, `cat ${base}/meta.json`)
    }

    await run(ws, 'search "diffusion model" /sscholar')
    await run(ws, 'grep "attention is all you need"')

    line('\ndone.', 'ok')
  } finally {
    await ws.close()
  }
}

main().catch((err: unknown) => {
  line(String(err instanceof Error ? (err.stack ?? err.message) : err), 'err')
  line('done.', 'ok')
})
