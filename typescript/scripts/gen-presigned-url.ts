/**
 * Generate a presigned URL (GET + PUT) for the AWS S3 bucket configured in
 * .env.development, and write them back to the same file under
 * AWS_PRESIGNED_GET_URL / AWS_PRESIGNED_PUT_URL.
 *
 * Run:  pnpm tsx scripts/gen-presigned-url.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const ENV_FILE = resolve(process.cwd(), '../.env.development')
// AWS SigV4 maximum for long-lived access keys is 7 days (604800s). For
// role/STS creds, the cap is the session's remaining lifetime.
const MAX_TTL_SEC = 604800
const TTL_SEC = (() => {
  const arg = process.argv[2]
  const envVal = process.env.PRESIGNED_TTL_SEC
  const raw = arg ?? envVal ?? String(MAX_TTL_SEC)
  const parsed = Number.parseInt(raw, 10)
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid TTL: ${raw}`)
  }
  if (parsed > MAX_TTL_SEC) {
    throw new Error(`TTL ${parsed}s exceeds AWS max ${MAX_TTL_SEC}s (7 days)`)
  }
  return parsed
})()
const TEST_KEY = `presigned-demo/${Date.now()}.txt`

function parseEnv(raw: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m !== null) {
      out.set(m[1] as string, m[2] as string)
    }
  }
  return out
}

function writeEnvUpdates(raw: string, updates: Record<string, string>): string {
  const keys = new Set(Object.keys(updates))
  const lines = raw.split('\n')
  const seen = new Set<string>()
  const next = lines.map((line) => {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m === null) return line
    const key = m[1] as string
    if (!keys.has(key)) return line
    seen.add(key)
    return `${key}=${updates[key]}`
  })
  for (const key of keys) {
    if (!seen.has(key)) next.push(`${key}=${updates[key]}`)
  }
  return next.join('\n')
}

async function main(): Promise<void> {
  const raw = readFileSync(ENV_FILE, 'utf8')
  const env = parseEnv(raw)
  const bucket = env.get('AWS_S3_BUCKET') ?? ''
  const region = env.get('AWS_DEFAULT_REGION') ?? 'us-east-1'
  const accessKeyId = env.get('AWS_ACCESS_KEY_ID') ?? ''
  const secretAccessKey = env.get('AWS_SECRET_ACCESS_KEY') ?? ''
  if (bucket === '' || accessKeyId === '' || secretAccessKey === '') {
    throw new Error(
      'Missing AWS_S3_BUCKET / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in .env.development',
    )
  }
  const client = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  })
  const putUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: TEST_KEY,
      ContentType: 'text/plain',
    }),
    { expiresIn: TTL_SEC },
  )
  const getUrl = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: TEST_KEY }),
    { expiresIn: TTL_SEC },
  )
  const expiresAt = new Date(Date.now() + TTL_SEC * 1000).toISOString()
  const updated = writeEnvUpdates(raw, {
    AWS_PRESIGNED_KEY: TEST_KEY,
    AWS_PRESIGNED_GET_URL: getUrl,
    AWS_PRESIGNED_PUT_URL: putUrl,
    AWS_PRESIGNED_EXPIRES_AT: expiresAt,
  })
  writeFileSync(ENV_FILE, updated, 'utf8')
  client.destroy()
  console.log(`bucket:   ${bucket}`)
  console.log(`region:   ${region}`)
  console.log(`key:      ${TEST_KEY}`)
  console.log(`expires:  ${expiresAt}  (${TTL_SEC}s)`)
  console.log(`put:      ${putUrl.slice(0, 80)}...`)
  console.log(`get:      ${getUrl.slice(0, 80)}...`)
  console.log(`wrote:    ${ENV_FILE}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
