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

// S3 + native shell commands. The naive approach (same-process FUSE +
// ws.execute({ native: true })) DEADLOCKS on Node — Mirage catches it and
// raises. The recommended pattern is to host the FUSE mount in a helper
// process; see examples/typescript/fuse/helper.ts + main_with_helper.ts
// for the full worked pattern.
//
// This file demonstrates the deadlock guard behavior: the error message
// gives you the three workarounds directly.
import {
  FuseManager,
  MountMode,
  S3Resource,
  Workspace,
  type S3Config,
} from '@struktoai/mirage-node'
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3'

const config: S3Config = {
  bucket: 'mirage-native-demo',
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

  console.log('=== Path 1: native=true without FUSE → falls back to virtual ===\n')
  {
    const ws = new Workspace({ '/s3/': new S3Resource(config) }, { mode: MountMode.WRITE })
    await ws.execute('echo "virtual fallback works" | tee /s3/native-demo/x.txt')
    // native: true with no fuseMountpoint → logs a warning and falls back
    // to the virtual executor. No deadlock, just a soft warning.
    const res = await ws.execute('cat /s3/native-demo/x.txt', { native: true })
    const dec = new TextDecoder()
    console.log('  stdout:', JSON.stringify(dec.decode(res.stdout)))
    await ws.execute('rm -rf /s3/native-demo')
    await ws.close()
  }

  console.log('\n=== Path 2: native=true WITH self-owned FUSE → guarded error ===\n')
  {
    const ws = new Workspace(
      { '/s3/': new S3Resource(config) },
      { mode: MountMode.WRITE },
    )
    await ws.execute('echo "about to deadlock" | tee /s3/native-demo/y.txt')
    const fm = new FuseManager()
    await fm.setup(ws)
    try {
      // THIS IS THE DEADLOCK CASE. Mirage catches it and raises.
      await ws.execute('cat /s3/native-demo/y.txt', { native: true })
      console.log('  unexpected: should have raised')
    } catch (err) {
      const msg = (err as Error).message
      console.log(`  ✅ caught: ${msg.split('\n')[0]}`)
      const wasDeadlockGuard = /deadlock/i.test(msg)
      console.log(`  ✅ deadlock guard fired: ${String(wasDeadlockGuard)}`)
    } finally {
      await ws.execute('rm -rf /s3/native-demo')
      await fm.close(ws)
      await ws.close()
    }
  }

  console.log('\n=== Path 3: the recommended workaround ===\n')
  console.log('  Run FUSE in a helper process; call nativeExec from your main process.')
  console.log('  See examples/typescript/fuse/main_with_helper.ts for the worked pattern.')
  console.log('  Or: use execute() without native=true — the virtual executor handles')
  console.log('  S3 reads and writes just as well for most shell pipelines.')
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
