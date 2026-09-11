import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WRANGLER_CONFIG_PATH } from '../dbCache/localDbCacheConfig.ts'
import { registerInterruptCleanup } from '../cli/interrupt.ts'
import { startR2Process } from './remoteR2Process.ts'
import {
  retainObjectInBucket,
  type RemoteR2Bucket,
  type R2Metadata,
} from './remoteR2Object.ts'
export type { RemoteR2Bucket } from './remoteR2Object.ts'

const sessions = new Map<
  string,
  Promise<{
    retain(key: string, bytes: Uint8Array, metadata: R2Metadata): Promise<void>
    dispose(): Promise<void>
  }>
>()

/** R2-only proxy: it has no D1 bindings and cannot register production metadata. */
export function remoteR2Config(bucketName: string) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()
  return {
    name: 'saanseoi-local-r2-upload',
    compatibility_date: '2026-05-01',
    ...(accountId ? { account_id: accountId } : {}),
    r2_buckets: [{ binding: 'R2_ASSETS', bucket_name: bucketName, remote: true }],
  }
}

async function openBucket(environment: 'preview' | 'production') {
  if (!process.env.CLOUDFLARE_ACCOUNT_ID?.trim())
    throw new Error(
      'Remote R2 uploads require CLOUDFLARE_ACCOUNT_ID in the environment.',
    )
  const config = JSON.parse(await readFile(WRANGLER_CONFIG_PATH, 'utf8'))
  const bucket = config.env?.[environment]?.r2_buckets?.find(
    (entry: { binding: string }) => entry.binding === 'R2_ASSETS',
  )?.bucket_name
  if (!bucket) throw new Error(`Missing R2_ASSETS configuration for ${environment}.`)
  const directory = await mkdtemp(join(tmpdir(), 'saanseoi-r2-'))
  let worker: ReturnType<typeof startR2Process> | undefined
  let unregister = () => {}
  try {
    const configPath = join(directory, 'wrangler.json')
    await writeFile(configPath, JSON.stringify(remoteR2Config(bucket)))
    process.stdout.write(`Connecting to ${environment} R2 (${bucket}) via Node…\n`)
    const client = startR2Process(configPath, {
      onProgress: message => process.stdout.write(`${message}\n`),
    })
    worker = client
    unregister = registerInterruptCleanup(() => client.stop())
    await client.ready
    let sequence = 0
    return {
      async retain(key: string, bytes: Uint8Array, metadata: R2Metadata) {
        // Transfer payloads by file, avoiding JSON/base64 expansion across IPC.
        const path = join(directory, `${++sequence}.object`)
        try {
          await writeFile(path, bytes)
          await client.retain(key, path, metadata)
        } finally {
          await rm(path, { force: true })
        }
      },
      async dispose() {
        unregister()
        try {
          await client.dispose()
        } finally {
          await rm(directory, { recursive: true, force: true })
        }
      },
    }
  } catch (error) {
    unregister()
    await worker?.dispose()
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}

export async function disposeRemoteR2() {
  const pending = [...sessions.values()]
  sessions.clear()
  await Promise.allSettled(pending.map(async session => (await session).dispose()))
}

export async function retainRemoteR2Object(
  environment: 'preview' | 'production',
  key: string,
  bytes: Uint8Array,
  metadata: { contentType: string; contentDisposition?: string },
  bucketOverride?: RemoteR2Bucket,
) {
  if (bucketOverride) return retainObjectInBucket(bucketOverride, key, bytes, metadata)
  const session = sessions.get(environment) ?? openBucket(environment)
  sessions.set(environment, session)
  await (await session).retain(key, bytes, metadata)
}
