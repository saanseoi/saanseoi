import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { deserialize, serialize } from 'node:v8'
import { withDeliveryLock } from './sqlDeliveryFiles'
import { pruneNormalisedArtefactCache } from './normalisedArtefactCacheRetention'

const REPO_ROOT = resolve(import.meta.dir, '../../../../../..')
const CACHE_ROOT = resolve(REPO_ROOT, '.local/harbour-sql/normalised-cache')

export async function openNormalisedArtefactCache(input: {
  filePath: string
  processingContract: string
}) {
  const sourceSha256 = await hashFile(input.filePath)
  const cacheKey = createHash('sha256')
    .update(`${sourceSha256}\0${input.processingContract}`)
    .digest('hex')
  const cachePath = resolve(CACHE_ROOT, `${cacheKey}.bin`)

  return {
    async read<T>(): Promise<T | null> {
      try {
        return deserialize(await readFile(cachePath)) as T
      } catch (error) {
        if (isMissingFileError(error)) return null
        throw error
      }
    },
    async write<T>(value: T) {
      await mkdir(CACHE_ROOT, { recursive: true })
      await withDeliveryLock(CACHE_ROOT, async () => {
        const temporaryPath = `${cachePath}.${crypto.randomUUID()}.tmp`
        try {
          await writeFile(temporaryPath, serialize(value))
          await rename(temporaryPath, cachePath)
        } finally {
          await rm(temporaryPath, { force: true }).catch(() => undefined)
        }
      })
      await pruneNormalisedArtefactCache(CACHE_ROOT).catch(error => {
        console.warn('Normalised cache retention deferred:', error)
      })
    },
    sourceSha256,
  }
}

async function hashFile(filePath: string) {
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) digest.update(chunk)
  return digest.digest('hex')
}

function isMissingFileError(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
