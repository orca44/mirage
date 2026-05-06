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

// S3 mounted as a real FUSE filesystem. Any OS-level tool (cat, ls,
// external scripts, editors, other processes) can then read from the mount
// just like a local directory.
//
// Use when:
//   - You want to pipe S3 content into non-Mirage-aware tools
//   - You want to `cat $mountpoint/s3/foo.json` from another shell
//   - A long-running service benefits from kernel-level caching + metadata
//
// Requires: macFUSE / libfuse3 + @zkochan/fuse-native (see /typescript/setup/fuse).
// Also requires local MinIO (see s3_write.ts).
//
// Known issue: in-process `fs.promises.readdir` against a FUSE-mounted S3
// bucket can fail with EIO on Node (the FUSE napi callback needs the event
// loop to make network calls while the `readdir` promise is already holding
// it). External shell access (from another terminal) works fine. For
// in-process real-fs access, use RAM as a cache layer or host the FUSE
// mount in a helper process — see examples/typescript/fuse/main_with_helper.ts.
import {
  FuseManager,
  MountMode,
  S3Resource,
  Workspace,
  type S3Config,
} from '@struktoai/mirage-node'
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3'

const config: S3Config = {
  bucket: 'mirage-fuse-demo',
  region: 'us-east-1',
  endpoint: 'http://localhost:9000',
  accessKeyId: 'minioadmin',
  secretAccessKey: 'minioadmin',
  forcePathStyle: true,
}

async function ensureBucket(): Promise<void> {
  const sdk = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId!, secretAccessKey: config.secretAccessKey! },
  })
  try {
    await sdk.send(new CreateBucketCommand({ Bucket: config.bucket }))
  } catch (err) {
    const code = (err as { name?: string }).name
    if (code !== 'BucketAlreadyOwnedByYou' && code !== 'BucketAlreadyExists') throw err
  } finally {
    sdk.destroy()
  }
}

async function main(): Promise<void> {
  await ensureBucket()
  const ws = new Workspace({ '/s3/': new S3Resource(config) }, { mode: MountMode.WRITE })
  try {
    // Seed files via the virtual executor.
    await ws.execute('rm -rf /s3/fuse-demo')
    await ws.execute('echo "via fuse" | tee /s3/fuse-demo/hello.txt')
    await ws.execute(`printf 'line1\\nline2\\nline3\\n' | tee /s3/fuse-demo/multi.txt`)

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
        process.exit(sig === 'SIGINT' ? 130 : 143)
      })()
    }
    process.on('SIGINT', handler)
    process.on('SIGTERM', handler)
    console.log(`=== FUSE MODE: mounted at ${mp} ===\n`)

    try {
      console.log(`  ws.fuseMountpoint = ${ws.fuseMountpoint ?? 'null'}`)
      console.log(`  ws.ownsFuseMount  = ${String(ws.ownsFuseMount)}`)
      console.log()

      // The mount is live. All virtual-executor commands continue to work —
      // they bypass the FUSE kernel path but read/write the same S3 bucket.
      console.log('--- virtual executor still works while mounted ---')
      const cat = await ws.execute('cat /s3/fuse-demo/hello.txt')
      console.log(`  cat: ${JSON.stringify(cat.stdoutText)}`)
      const grep = await ws.execute('grep line2 /s3/fuse-demo/multi.txt')
      console.log(`  grep: ${JSON.stringify(grep.stdoutText.trim())}`)

      console.log()
      console.log('>>> Mount is live. From ANOTHER terminal you can:')
      console.log(`>>>   ls  ${mp}/s3/fuse-demo/`)
      console.log(`>>>   cat ${mp}/s3/fuse-demo/hello.txt`)
      console.log(`>>>   grep line2 ${mp}/s3/fuse-demo/multi.txt`)
      console.log()
      console.log('>>> In-process `fs.promises.readdir` on an S3-backed FUSE mount')
      console.log('>>> may fail with EIO on Node — see the comment at the top of')
      console.log('>>> this file for workarounds.')
    } finally {
      await ws.execute('rm -rf /s3/fuse-demo')
      await fm.close(ws)
      console.log(`\nafter unmount: ws.fuseMountpoint = ${ws.fuseMountpoint ?? 'null'}`)
    }
  } finally {
    await ws.close()
  }
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
