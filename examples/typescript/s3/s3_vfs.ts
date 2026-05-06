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

// S3 in VFS mode — agent-style workflow using only `ws.execute()`. No FUSE.
//
// This is the default path. Every shell command you run against `/s3/...`
// is handled by Mirage's in-process executor: pipes, redirects, jq, awk, sed,
// grep, wc, head, tail — all reimplemented to read/write the S3 bucket
// through the resource's streamPath/readFile/writeFile methods.
//
// Use when:
//   - You don't need a real mountpoint on disk
//   - You don't want to install FUSE
//   - You want the lowest-friction S3 access from an agent
//
// Requires local MinIO on port 9000 (see s3_write.ts for the docker command).
import { MountMode, S3Resource, Workspace, type S3Config } from '@struktoai/mirage-node'
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3'

const config: S3Config = {
  bucket: 'mirage-vfs-demo',
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
    await ws.execute('rm -rf /s3/vfs-demo')
    console.log('=== VFS MODE: every command runs in-process ===\n')

    // Seed a typical analytics workflow.
    await ws.execute(`printf 'id,name,score\\n1,alice,87\\n2,bob,92\\n3,carol,78\\n' | tee /s3/vfs-demo/scores.csv`)
    await ws.execute(`echo '{"user":"alice","tier":"gold"}' | tee /s3/vfs-demo/user.json`)

    console.log('--- cat ---')
    const cat = await ws.execute('cat /s3/vfs-demo/scores.csv')
    process.stdout.write(cat.stdoutText)
    console.log()

    console.log('--- awk: sum scores in column 3 ---')
    const sum = await ws.execute(
      `awk -F, 'NR>1 { s += $3 } END { print s }' /s3/vfs-demo/scores.csv`,
    )
    process.stdout.write(sum.stdoutText)
    console.log()

    console.log('--- jq: extract user tier ---')
    const tier = await ws.execute('jq .tier /s3/vfs-demo/user.json')
    process.stdout.write(tier.stdoutText)
    console.log()

    console.log('--- grep + head pipeline ---')
    const grep = await ws.execute(
      "grep -i '^[12]' /s3/vfs-demo/scores.csv | head -n 5",
    )
    process.stdout.write(grep.stdoutText)
    console.log()

    console.log('--- wc -l across files ---')
    const wc = await ws.execute('wc -l /s3/vfs-demo/*.csv')
    process.stdout.write(wc.stdoutText)
    console.log()

    // Cleanup.
    await ws.execute('rm -rf /s3/vfs-demo')
  } finally {
    await ws.close()
  }
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
