import { readFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import {
  deliveryFileSha256,
  sha256,
  withDeliveryLock,
  writeDeliveryFile,
} from '../local/sqlDeliveryFiles.ts'
import type { StagedPlaces } from './processLocalPlaceSqlUploadTypes.ts'

/** Source-only staging. Address review and enrichment must remain outside this cache. */
export async function reuseStagedPlaces(input: {
  path: string
  sourceSha256: string
  computationContract?: string
  sourceVersion: string
  rawObjectKey: string
  generate: () => Promise<StagedPlaces>
}): Promise<StagedPlaces> {
  const directory = dirname(input.path)
  const manifestPath = `${input.path}.manifest.json`
  const identity = sha256(
    JSON.stringify({
      contract: 'places-source-v1',
      sourceSha256: input.sourceSha256,
      sourceVersion: input.sourceVersion,
      rawObjectKey: input.rawObjectKey,
    }),
  )
  return withDeliveryLock(`${input.path}.lock`, async () => {
    let manifest:
      | {
          version: number
          computationContract?: string
          identity: string
          fileSha256: string
          result: Omit<StagedPlaces, 'path'>
          checksum: string
        }
      | undefined
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    if (manifest !== undefined) {
      if (
        manifest?.version !== 1 ||
        manifest.identity !== identity ||
        manifest.checksum !==
          sha256(
            JSON.stringify({
              identity,
              fileSha256: manifest.fileSha256,
              result: manifest.result,
              ...(manifest.computationContract
                ? { computationContract: manifest.computationContract }
                : {}),
            }),
          ) ||
        !manifest.result ||
        !Number.isSafeInteger(manifest.result.processedRows) ||
        !Number.isSafeInteger(manifest.result.includedRows) ||
        manifest.result.includedRows < 0 ||
        manifest.result.processedRows < manifest.result.includedRows ||
        !Array.isArray(manifest.result.actions)
      )
        throw new Error('Staged Place preparation changed or its manifest is invalid.')
      if ((await deliveryFileSha256(input.path)) !== manifest.fileSha256)
        throw new Error(
          'Staged Place source checksum differs; refusing corrupted preparation.',
        )
      if (manifest.computationContract === input.computationContract)
        return { ...manifest.result, path: input.path }
    }
    const staged = await input.generate()
    if (staged.path !== input.path)
      throw new Error('Unexpected staged Place output path.')
    const { path: _, ...result } = staged
    const fileSha256 = await deliveryFileSha256(input.path)
    const payload = {
      identity,
      fileSha256,
      result,
      ...(input.computationContract
        ? { computationContract: input.computationContract }
        : {}),
    }
    await writeDeliveryFile(
      directory,
      basename(manifestPath),
      JSON.stringify({
        version: 1,
        ...payload,
        checksum: sha256(JSON.stringify(payload)),
      }),
    )
    return staged
  })
}
