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
  DiscordResource,
  MountMode,
  Workspace,
  type DiscordConfig,
} from '@struktoai/mirage-node'

dotenv.config({ path: '.env.development' })

function buildConfig(): DiscordConfig {
  const token = process.env.DISCORD_BOT_TOKEN
  if (token === undefined || token === '') {
    throw new Error('DISCORD_BOT_TOKEN env var is required')
  }
  return { token }
}

async function main(): Promise<void> {
  const resource = new DiscordResource(buildConfig())
  const ws = new Workspace({ '/discord': resource }, { mode: MountMode.READ })

  try {
    console.log('=== ls /discord/ (guilds) ===')
    let r = await ws.execute('ls /discord/')
    console.log(r.stdoutText)

    const guilds = r.stdoutText.trim() === '' ? [] : r.stdoutText.trim().split('\n')
    if (guilds.length === 0) {
      console.log('no guilds found')
      return
    }

    const guild = guilds[0]!.trim()
    console.log(`=== ls /discord/${guild}/channels/ ===`)
    r = await ws.execute(`ls "/discord/${guild}/channels/"`)
    console.log(r.stdoutText)

    const channels = r.stdoutText.trim() === '' ? [] : r.stdoutText.trim().split('\n')
    if (channels.length === 0) {
      console.log('no channels found')
      return
    }

    const ch = channels[0]!.trim()
    const base = `/discord/${guild}/channels/${ch}`

    console.log('\n=== finding a date with messages via search API ===')
    r = await ws.execute(`grep -m 1 "" "${base}/"`)
    const searchOut = r.stdoutText.trim()
    let target = '2026-04-04.jsonl'
    if (searchOut !== '') {
      for (const line of searchOut.split('\n')) {
        const parts = line.split('/')
        let matched = false
        for (const part of parts) {
          if (part.endsWith('.jsonl')) {
            target = part.split(':')[0]!
            matched = true
            break
          }
        }
        if (matched) break
      }
    }
    const filePath = `${base}/${target}`
    console.log(`  using: ${target}`)

    console.log(`\n=== cat ${target} | head -n 3 ===`)
    r = await ws.execute(`cat "${filePath}" | head -n 3`)
    console.log(r.stdoutText.slice(0, 300))

    console.log(`\n=== grep at FILE level: grep content ${target} ===`)
    r = await ws.execute(`grep content "${filePath}"`)
    const grepOut = r.stdoutText.trim()
    const grepLines = grepOut === '' ? [] : grepOut.split('\n')
    console.log(`  matches: ${String(grepLines.length)}`)
    if (grepLines.length > 0) {
      console.log(`  first: ${grepLines[0]!.slice(0, 120)}...`)
    }

    console.log('\n=== grep -c content (file, count only) ===')
    r = await ws.execute(`grep -c content "${filePath}"`)
    console.log(`  count: ${r.stdoutText.trim()}`)

    console.log(`\n=== grep at CHANNEL level: grep hihi ${base}/ ===`)
    r = await ws.execute(`grep hihi "${base}/"`)
    console.log(`  exit=${String(r.exitCode)}`)
    {
      const out = r.stdoutText.trim()
      if (out !== '') {
        for (const line of out.split('\n').slice(0, 5)) {
          console.log(`  ${line.slice(0, 120)}`)
        }
      } else {
        console.log('  (no results)')
      }
      if (r.stderrText !== '') {
        console.log(`  stderr: ${r.stderrText}`)
      }
    }

    console.log(`\n=== grep at GUILD level: grep hihi /discord/${guild}/ ===`)
    r = await ws.execute(`grep hihi "/discord/${guild}/"`)
    console.log(`  exit=${String(r.exitCode)}`)
    {
      const out = r.stdoutText.trim()
      if (out !== '') {
        for (const line of out.split('\n').slice(0, 5)) {
          console.log(`  ${line.slice(0, 120)}`)
        }
      } else {
        console.log('  (no results)')
      }
      if (r.stderrText !== '') {
        console.log(`  stderr: ${r.stderrText}`)
      }
    }

    console.log(`\n=== rg at CHANNEL level: rg hihi ${base}/ ===`)
    r = await ws.execute(`rg hihi "${base}/"`)
    console.log(`  exit=${String(r.exitCode)}`)
    {
      const out = r.stdoutText.trim()
      if (out !== '') {
        for (const line of out.split('\n').slice(0, 5)) {
          console.log(`  ${line.slice(0, 120)}`)
        }
      } else {
        console.log('  (no results)')
      }
    }

    console.log(`\n=== jq '.[] | .author.username' ${target} ===`)
    r = await ws.execute(`jq ".[] | .author.username" "${filePath}"`)
    console.log(`  exit=${String(r.exitCode)}`)
    {
      const out = r.stdoutText.trim()
      if (out !== '') {
        for (const line of out.split('\n').slice(0, 5)) {
          console.log(`  ${line}`)
        }
      } else {
        console.log('  (no output)')
      }
    }

    console.log(`\n=== jq -r '.[] | .content' ${target} | head -n 5 ===`)
    r = await ws.execute(`jq -r ".[] | .content" "${filePath}" | head -n 5`)
    console.log(`  exit=${String(r.exitCode)}`)
    {
      const out = r.stdoutText.trim()
      if (out !== '') {
        for (const line of out.split('\n').slice(0, 5)) {
          console.log(`  ${line}`)
        }
      }
    }

    console.log(`\n=== stat ${target} ===`)
    r = await ws.execute(`stat "${filePath}"`)
    console.log(`  ${r.stdoutText.trim()}`)

    console.log(
      `\n=== cat ${target} | jq -r '.[] | .author.username' | sort | uniq -c ===`,
    )
    r = await ws.execute(
      `cat "${filePath}" | jq -r ".[] | .author.username" | sort | uniq -c`,
    )
    console.log(`  exit=${String(r.exitCode)}`)
    {
      const out = r.stdoutText.trim()
      if (out !== '') {
        for (const line of out.split('\n').slice(0, 10)) {
          console.log(`  ${line}`)
        }
      }
    }

    console.log(`\n=== wc -l ${target} ===`)
    r = await ws.execute(`wc -l "${filePath}"`)
    console.log(`  ${r.stdoutText.trim()}`)

    console.log(`\n=== head -n 3 ${target} ===`)
    r = await ws.execute(`head -n 3 "${filePath}"`)
    {
      const out = r.stdoutText.trim()
      if (out !== '') {
        for (const line of out.split('\n')) {
          console.log(`  ${line.slice(0, 120)}`)
        }
      }
    }

    console.log(`\n=== tail -n 2 ${target} ===`)
    r = await ws.execute(`tail -n 2 "${filePath}"`)
    {
      const out = r.stdoutText.trim()
      if (out !== '') {
        for (const line of out.split('\n')) {
          console.log(`  ${line.slice(0, 120)}`)
        }
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
    {
      const out = r.stdoutText.trim()
      if (out !== '') {
        for (const line of out.split('\n')) {
          console.log(`  ${line}`)
        }
      }
    }

    console.log(`\n=== cat ${target} (relative) | head -n 1 ===`)
    r = await ws.execute(`cat ${target} | head -n 1`)
    {
      const out = r.stdoutText.trim()
      if (out !== '') {
        console.log(`  ${out.slice(0, 120)}`)
      } else {
        console.log('  (empty)')
      }
    }

    console.log(`\n=== tree -L 1 /discord/${guild}/ ===`)
    r = await ws.execute(`tree -L 1 "/discord/${guild}/"`)
    console.log(`  exit=${String(r.exitCode)}`)
    {
      const out = r.stdoutText.trim()
      if (out !== '') {
        for (const line of out.split('\n')) {
          console.log(`  ${line}`)
        }
      }
    }

    console.log(
      `\n=== find /discord/${guild}/ -name '*.jsonl' -maxdepth 3 | head -n 10 ===`,
    )
    r = await ws.execute(
      `find "/discord/${guild}/" -name "*.jsonl" -maxdepth 3 | head -n 10`,
    )
    console.log(`  exit=${String(r.exitCode)}`)
    {
      const out = r.stdoutText.trim()
      if (out !== '') {
        for (const line of out.split('\n')) {
          console.log(`  ${line}`)
        }
      }
    }

    console.log("\n=== find /discord/ -name 'general*' ===")
    r = await ws.execute('find "/discord/" -name "general*"')
    console.log(`  exit=${String(r.exitCode)}`)
    {
      const out = r.stdoutText.trim()
      if (out !== '') {
        for (const line of out.split('\n')) {
          console.log(`  ${line}`)
        }
      }
    }

    console.log(`\n=== echo ${base}/*.jsonl (glob) ===`)
    r = await ws.execute(`echo "${base}/"*.jsonl`)
    console.log(`  ${r.stdoutText.trim().slice(0, 200)}`)

    console.log(`\n=== for f in ${base}/*.jsonl (glob loop) ===`)
    r = await ws.execute(
      `for f in "${base}/"*.jsonl; do echo found:$f; done | head -n 3`,
    )
    {
      const out = r.stdoutText.trim()
      for (const line of out.split('\n')) {
        console.log(`  ${line.slice(0, 120)}`)
      }
    }
  } finally {
    await ws.close()
  }
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
