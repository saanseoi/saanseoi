import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WRANGLER_CONFIG_PATH } from '../dbCache/localDbCacheConfig.ts'

export type RemoteR2Bucket = {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>
  head(
    key: string,
  ): Promise<{ size: number; checksums?: { sha256?: ArrayBuffer } } | null>
  put(
    key: string,
    bytes: Uint8Array,
    options: {
      sha256: string
      onlyIf: { etagDoesNotMatch: string }
      httpMetadata: { contentType: string; contentDisposition?: string }
    },
  ): Promise<unknown>
}

const sessions = new Map<
  string,
  Promise<{ bucket: RemoteR2Bucket; dispose(): Promise<void> }>
>()

/** R2-only proxy: it has no D1 bindings and cannot register production metadata. */
export function remoteR2Config(bucketName: string) {
  return {
    name: 'saanseoi-local-r2-upload',
    compatibility_date: '2026-05-01',
    r2_buckets: [{ binding: 'R2_ASSETS', bucket_name: bucketName, remote: true }],
  }
}

async function openBucket(environment: 'preview' | 'production') {
  const config = JSON.parse(await readFile(WRANGLER_CONFIG_PATH, 'utf8'))
  const bucket = config.env?.[environment]?.r2_buckets?.find(
    (entry: { binding: string }) => entry.binding === 'R2_ASSETS',
  )?.bucket_name
  if (!bucket) throw new Error(`Missing R2_ASSETS configuration for ${environment}.`)
  const directory = await mkdtemp(join(tmpdir(), 'saanseoi-r2-'))
  try {
    const configPath = join(directory, 'wrangler.json')
    await writeFile(configPath, JSON.stringify(remoteR2Config(bucket)))
    const { getPlatformProxy } = await import('wrangler')
    const proxy = await getPlatformProxy<{ R2_ASSETS: RemoteR2Bucket }>({
      configPath,
      persist: false,
      remoteBindings: true,
    })
    return {
      bucket: proxy.env.R2_ASSETS,
      async dispose() {
        try {
          await proxy.dispose()
        } finally {
          await rm(directory, { recursive: true, force: true })
        }
      },
    }
  } catch (error) {
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
  let bucket = bucketOverride
  if (!bucket) {
    const session = sessions.get(environment) ?? openBucket(environment)
    sessions.set(environment, session)
    bucket = (await session).bucket
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const matches = async () => {
    const existing = await bucket.head(key)
    if (!existing) return false
    let actual = existing.checksums?.sha256
      ? Buffer.from(existing.checksums.sha256).toString('hex')
      : undefined
    if (!actual) {
      const object = await bucket.get(key)
      if (!object) throw new Error(`R2 object disappeared during verification: ${key}`)
      actual = createHash('sha256')
        .update(new Uint8Array(await object.arrayBuffer()))
        .digest('hex')
    }
    if (existing.size !== bytes.byteLength || actual !== sha256)
      throw new Error(`R2 immutable object conflict: ${key}`)
    return true
  }
  if (await matches()) return
  await bucket.put(key, bytes, {
    sha256,
    onlyIf: { etagDoesNotMatch: '*' },
    httpMetadata: metadata,
  })
  if (!(await matches())) throw new Error(`R2 object missing after upload: ${key}`)
}
