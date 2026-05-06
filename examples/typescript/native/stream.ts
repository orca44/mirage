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

import { nativeExecStream } from '@struktoai/mirage-node'

const DEC = new TextDecoder()

async function main(): Promise<void> {
  console.log('=== nativeExecStream — async-iterate stdout chunks ===\n')

  // `seq 1 100000` emits ~600KB of output. With nativeExec() you'd buffer
  // the whole thing in memory before seeing anything; with the stream API
  // you see each chunk as soon as the kernel flushes it.
  const proc = nativeExecStream('seq 1 100000', { cwd: '/tmp' })

  let chunkCount = 0
  let byteCount = 0
  let lineCount = 0
  for await (const chunk of proc.stdoutStream()) {
    const bytes = chunk as Uint8Array
    chunkCount += 1
    byteCount += bytes.byteLength
    lineCount += [...DEC.decode(bytes)].filter((c) => c === '\n').length
  }

  const exitCode = await proc.wait()
  console.log(
    `seq 1 100000 → ${String(chunkCount)} chunks, ` +
      `${byteCount.toLocaleString('en-US')} bytes, ` +
      `${String(lineCount)} lines, exit ${String(exitCode)}\n`,
  )

  console.log('=== transforming on the fly ===\n')

  // Mirror the classic `find | xargs` pipeline but entirely in TS:
  // consume `find` output as it arrives, process each path synchronously,
  // and never buffer the full list.
  const find = nativeExecStream(
    "find /usr/bin -maxdepth 1 -type f -name 'b*' 2>/dev/null | head -n 20",
    { cwd: '/tmp' },
  )

  let leftover = ''
  let matched = 0
  for await (const chunk of find.stdoutStream()) {
    const text = leftover + DEC.decode(chunk as Uint8Array)
    const lines = text.split('\n')
    leftover = lines.pop() ?? ''
    for (const line of lines) {
      if (line.length === 0) continue
      // "process" each path as it arrives — could be a network call,
      // a DB write, a cache lookup, etc. Here we just count.
      matched += 1
    }
  }
  if (leftover.length > 0) matched += 1
  await find.wait()
  console.log(`streamed ${String(matched)} paths from find | head -n 20\n`)

  console.log('=== combining stdout + stderr streams ===\n')

  // Some tools emit progress to stderr and results to stdout. The stream
  // API exposes both.
  const both = nativeExecStream(
    "bash -c 'for i in 1 2 3; do echo \"progress $i\" >&2; echo \"data $i\"; done'",
    { cwd: '/tmp' },
  )

  const stdoutTask = (async () => {
    const parts: string[] = []
    for await (const chunk of both.stdoutStream()) {
      parts.push(DEC.decode(chunk as Uint8Array))
    }
    return parts.join('').trim()
  })()

  const stderrStream = both.stderrStream()
  const stderrTask = (async () => {
    if (stderrStream === null) return ''
    const parts: string[] = []
    for await (const chunk of stderrStream) {
      parts.push(DEC.decode(chunk as Uint8Array))
    }
    return parts.join('').trim()
  })()

  const [out, err, code] = await Promise.all([stdoutTask, stderrTask, both.wait()])
  console.log('stdout:', out.split('\n'))
  console.log('stderr:', err.split('\n'))
  console.log(`exit:   ${String(code)}`)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
