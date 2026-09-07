import { readFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { serialize, deserialize } from 'node:v8'
import type { HarbourReadableDb } from '@repo/core/db/types'
import {
  deliveryFileSha256,
  sha256,
  withDeliveryLock,
  writeDeliveryFile,
} from '../localPipeline/sqlDeliveryFiles.ts'
import { loadCollection, type PlaceAddress3dReadObserver } from './placeAddress3d.ts'
import type { StagedEnrichedPlaces } from './processLocalPlaceSqlUploadTypes.ts'

type Dependency = { snapshotId: string; ownerId: string; sha256: string }
const collectionHash = (value: unknown) => sha256(JSON.stringify(value ?? null))

export async function reuseEnrichedPlaces(input: {
  path: string
  identity: string
  db: HarbourReadableDb
  generate: (
    observe: PlaceAddress3dReadObserver,
    validateBeforeCommit: () => Promise<void>,
  ) => Promise<StagedEnrichedPlaces>
}) {
  return withDeliveryLock(`${input.path}.lock`, async () => {
    const manifestPath = `${input.path}.manifest.json`
    const unchanged = async (dependencies: Dependency[]) => {
      for (const dependency of dependencies) {
        if (
          collectionHash(
            await loadCollection(input.db, dependency.snapshotId, dependency.ownerId),
          ) !== dependency.sha256
        )
          return false
      }
      return true
    }
    const text = await readFile(manifestPath, 'utf8').catch(error => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (text !== null) {
      const envelope = JSON.parse(text) as { payload: string; checksum: string }
      if (
        typeof envelope.payload !== 'string' ||
        sha256(envelope.payload) !== envelope.checksum
      )
        throw new Error('Enriched Place cache checksum differs.')
      const cache = deserialize(Buffer.from(envelope.payload, 'base64')) as {
        contract: number
        identity: string
        fileSha256: string
        dependencies: Dependency[]
        result: StagedEnrichedPlaces
      }
      if (
        cache.contract !== 1 ||
        !Array.isArray(cache.dependencies) ||
        !Number.isSafeInteger(cache.result?.processedRows) ||
        cache.result.processedRows < 0
      )
        throw new Error('Invalid enriched Place cache.')
      if (cache.identity === input.identity && (await unchanged(cache.dependencies))) {
        if ((await deliveryFileSha256(input.path)) !== cache.fileSha256)
          throw new Error('Enriched Place output checksum differs.')
        return { ...cache.result, path: input.path }
      }
    }
    const dependencies = new Map<string, Dependency>()
    let validated = false
    const validateBeforeCommit = async () => {
      if (!(await unchanged([...dependencies.values()])))
        throw new Error('Address3D changed during Place enrichment.')
      validated = true
    }
    const result = await input.generate((snapshotId, ownerId, collection) => {
      validated = false
      const key = JSON.stringify([snapshotId, ownerId])
      const hash = collectionHash(collection)
      if (dependencies.has(key) && dependencies.get(key)?.sha256 !== hash)
        throw new Error('Address3D changed during Place enrichment.')
      dependencies.set(key, { snapshotId, ownerId, sha256: hash })
    }, validateBeforeCommit)
    if (result.path !== input.path)
      throw new Error('Unexpected enriched Place output path.')
    const rows = [...dependencies.values()]
    if (!validated) await validateBeforeCommit()
    const payload = serialize({
      contract: 1,
      identity: input.identity,
      fileSha256: await deliveryFileSha256(input.path),
      dependencies: rows,
      result,
    }).toString('base64')
    await writeDeliveryFile(
      dirname(input.path),
      basename(manifestPath),
      JSON.stringify({ payload, checksum: sha256(payload) }),
    )
    return result
  })
}
