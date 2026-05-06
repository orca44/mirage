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
import {
  MountMode,
  SlackResource,
  Workspace,
  type SlackConfig,
} from '@struktoai/mirage-node'

dotenv.config({ path: '.env.development' })

function buildConfig(): SlackConfig {
  const token = process.env.SLACK_BOT_TOKEN
  if (token === undefined || token === '') {
    throw new Error('SLACK_BOT_TOKEN env var is required')
  }
  const searchToken = process.env.SLACK_USER_TOKEN
  return {
    token,
    ...(searchToken !== undefined && searchToken !== '' ? { searchToken } : {}),
  }
}

async function main(): Promise<void> {
  const resource = new SlackResource(buildConfig())
  const ws = new Workspace({ '/slack': resource }, { mode: MountMode.READ })

  try {
    console.log('=== ls /slack/ (root) ===')
    let r = await ws.execute('ls /slack/')
    console.log(r.stdoutText)

    console.log('=== ls /slack/channels/ ===')
    r = await ws.execute('ls /slack/channels/ | head -n 5')
    console.log(r.stdoutText)

    console.log('=== ls /slack/users/ ===')
    r = await ws.execute('ls /slack/users/ | head -n 5')
    console.log(r.stdoutText)

    r = await ws.execute('ls /slack/channels/ | head -n 1')
    const firstCh = r.stdoutText.trim()
    if (firstCh === '') {
      console.log('no channels found')
      return
    }

    const base = `/slack/channels/${firstCh}`

    console.log(`=== ls ${firstCh} (dates) ===`)
    r = await ws.execute(`ls "${base}/" | tail -n 5`)
    console.log(r.stdoutText)

    r = await ws.execute(`rg -l "" "${base}/"`)
    const ridFiles = r.stdoutText.trim() === '' ? [] : r.stdoutText.trim().split('\n')
    let target: string
    let filePath: string
    if (ridFiles.length > 0) {
      filePath = ridFiles[0]!.trim()
      target = filePath.slice(filePath.lastIndexOf('/') + 1)
    } else {
      r = await ws.execute(`ls "${base}/" | tail -n 1`)
      target = r.stdoutText.trim()
      filePath = `${base}/${target}`
    }

    console.log(`  using: ${target}`)

    console.log(`\n=== cat ${target} | head -n 3 ===`)
    r = await ws.execute(`cat "${filePath}" | head -n 3`)
    console.log(r.stdoutText.slice(0, 300))

    r = await ws.execute('ls /slack/users/ | head -n 1')
    const firstUser = r.stdoutText.trim()
    console.log(`\n=== cat /slack/users/${firstUser} ===`)
    r = await ws.execute(`cat "/slack/users/${firstUser}"`)
    const userOut = r.stdoutText.trim()
    if (userOut !== '') {
      console.log(`  ${userOut.slice(0, 200)}`)
    } else {
      console.log('  (empty)')
    }
    if (r.stderrText !== '') {
      console.log(`  stderr: ${r.stderrText}`)
    }

    console.log(`\n=== stat ${target} ===`)
    r = await ws.execute(`stat "${filePath}"`)
    console.log(`  ${r.stdoutText.trim()}`)

    console.log(`\n=== wc -l ${target} ===`)
    r = await ws.execute(`wc -l "${filePath}"`)
    console.log(`  ${r.stdoutText.trim()}`)

    console.log(`\n=== head -n 2 ${target} ===`)
    r = await ws.execute(`head -n 2 "${filePath}"`)
    const headOut = r.stdoutText.trim()
    if (headOut !== '') {
      for (const line of headOut.split('\n')) {
        console.log(`  ${line.slice(0, 120)}`)
      }
    }

    console.log(`\n=== tail -n 1 ${target} ===`)
    r = await ws.execute(`tail -n 1 "${filePath}"`)
    const tailOut = r.stdoutText.trim()
    if (tailOut !== '') {
      console.log(`  ${tailOut.slice(0, 120)}`)
    }

    console.log(`\n=== grep message ${target} ===`)
    r = await ws.execute(`grep message "${filePath}"`)
    const grepOut = r.stdoutText.trim()
    const grepLines = grepOut === '' ? [] : grepOut.split('\n')
    console.log(`  matches: ${String(grepLines.length)}`)
    if (grepLines.length > 0) {
      console.log(`  first: ${grepLines[0]!.slice(0, 120)}...`)
    }

    console.log(`\n=== grep -c message ${target} ===`)
    r = await ws.execute(`grep -c message "${filePath}"`)
    console.log(`  count: ${r.stdoutText.trim()}`)

    console.log(`\n=== rg message ${base}/ ===`)
    r = await ws.execute(`rg message "${base}/"`)
    const rgOut = r.stdoutText.trim()
    const rgLines = rgOut === '' ? [] : rgOut.split('\n')
    console.log(`  matches across dates: ${String(rgLines.length)}`)

    console.log(`\n=== rg -l message ${base}/ ===`)
    r = await ws.execute(`rg -l message "${base}/"`)
    const rglOut = r.stdoutText.trim()
    const rglFiles = rglOut === '' ? [] : rglOut.split('\n')
    console.log(`  files with matches: ${String(rglFiles.length)}`)
    for (const f of rglFiles) {
      console.log(`  ${f}`)
    }

    const nativeDispatch: { label: string; cmd: string }[] = [
      {
        label: `grep hello ${base}/*.jsonl (channel scope)`,
        cmd: `grep hello "${base}/"*.jsonl`,
      },
      {
        label: `grep hello ${base}/ (channel scope)`,
        cmd: `grep hello "${base}/"`,
      },
      {
        label: 'grep hello /slack/channels/ (workspace scope)',
        cmd: 'grep hello /slack/channels/',
      },
      {
        label: 'rg hello /slack/ (workspace scope)',
        cmd: 'rg hello /slack/',
      },
    ]
    for (const { label, cmd } of nativeDispatch) {
      console.log(`\n=== ${label} ===`)
      r = await ws.execute(cmd)
      const out = r.stdoutText.trim()
      const err = r.stderrText.trim()
      const lines = out === '' ? [] : out.split('\n')
      console.log(`  exit=${String(r.exitCode)} matches: ${String(lines.length)}`)
      if (err !== '') {
        console.log(`  stderr: ${err.slice(0, 200)}`)
      }
      for (const line of lines.slice(0, 3)) {
        console.log(`  ${line.slice(0, 150)}`)
      }
    }

    console.log(`\n=== jq '.[] | .user' ${target} ===`)
    r = await ws.execute(`jq ".[] | .user" "${filePath}"`)
    console.log(`  exit=${String(r.exitCode)}`)
    const jqOut = r.stdoutText.trim()
    if (jqOut !== '') {
      for (const line of jqOut.split('\n').slice(0, 5)) {
        console.log(`  ${line}`)
      }
    }

    console.log(`\n=== cat ${target} | jq -r '.[] | .text' | head -n 5 ===`)
    r = await ws.execute(`cat "${filePath}" | jq -r ".[] | .text" | head -n 5`)
    console.log(`  exit=${String(r.exitCode)}`)
    const jqTextOut = r.stdoutText.trim()
    if (jqTextOut !== '') {
      for (const line of jqTextOut.split('\n').slice(0, 5)) {
        console.log(`  ${line}`)
      }
    }

    console.log('\n=== tree -L 1 /slack/ ===')
    r = await ws.execute('tree -L 1 /slack/')
    console.log(`  exit=${String(r.exitCode)}`)
    const treeOut = r.stdoutText.trim()
    if (treeOut !== '') {
      for (const line of treeOut.split('\n')) {
        console.log(`  ${line}`)
      }
    }

    console.log(`\n=== find ${base}/ -name '*.jsonl' | tail -n 5 ===`)
    r = await ws.execute(`find "${base}/" -name "*.jsonl" | tail -n 5`)
    console.log(`  exit=${String(r.exitCode)}`)
    const findOut = r.stdoutText.trim()
    if (findOut !== '') {
      for (const line of findOut.split('\n')) {
        console.log(`  ${line}`)
      }
    }

    console.log("\n=== find /slack/ -name 'general*' ===")
    r = await ws.execute('find /slack/ -name "general*"')
    console.log(`  exit=${String(r.exitCode)}`)
    const findGeneralOut = r.stdoutText.trim()
    if (findGeneralOut !== '') {
      for (const line of findGeneralOut.split('\n')) {
        console.log(`  ${line}`)
      }
    }

    console.log('\n=== pwd ===')
    r = await ws.execute('pwd')
    console.log(`  ${r.stdoutText.trim()}`)

    console.log(`\n=== cd "${base}" ===`)
    r = await ws.execute(`cd "${base}"`)
    console.log(`  exit=${String(r.exitCode)}`)

    console.log('\n=== pwd (after cd) ===')
    r = await ws.execute('pwd')
    console.log(`  ${r.stdoutText.trim()}`)

    console.log('\n=== ls (relative, in channel dir) ===')
    r = await ws.execute('ls | tail -n 5')
    const relLsOut = r.stdoutText.trim()
    if (relLsOut !== '') {
      for (const line of relLsOut.split('\n')) {
        console.log(`  ${line}`)
      }
    }

    console.log(`\n=== cat ${target} (relative) | head -n 1 ===`)
    r = await ws.execute(`cat ${target} | head -n 1`)
    const relCatOut = r.stdoutText.trim()
    if (relCatOut !== '') {
      console.log(`  ${relCatOut.slice(0, 120)}`)
    } else {
      console.log('  (empty)')
    }

    console.log(`\n=== echo ${base}/*.jsonl (glob) ===`)
    r = await ws.execute(`echo "${base}/"*.jsonl`)
    console.log(`  ${r.stdoutText.trim().slice(0, 200)}`)

    console.log(`\n=== for f in ${base}/*.jsonl (glob loop) ===`)
    r = await ws.execute(
      `for f in "${base}/"*.jsonl; do echo found:$f; done | head -n 3`,
    )
    const loopOut = r.stdoutText.trim()
    for (const line of loopOut.split('\n')) {
      console.log(`  ${line.slice(0, 120)}`)
    }
  } finally {
    await ws.close()
  }
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
