import { randomUUID, createHash } from 'node:crypto'
import { open, readFile, rename, rm, stat } from 'node:fs/promises'
import { dirname, basename, join } from 'node:path'
import {
  withDeliveryLock,
  writeDeliveryFile,
} from '../localPipeline/sqlDeliveryFiles.ts'
import { archiveMetadata } from './tilesStorage.ts'

/** Reuse only a fully built, checksummed archive with identical build inputs. */
export async function retainTilesBuild<T extends Record<string, unknown>>(input: {
  outputPath: string
  inputs: Record<string, unknown>
  force: boolean
  build: (temporaryPath: string) => Promise<T>
}): Promise<T> {
  const directory = `${input.outputPath}.build-state`
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(input.inputs))
    .digest('hex')
  return withDeliveryLock(directory, async () => {
    const checkpoint = await readFile(join(directory, 'build.json'), 'utf8').catch(
      error => {
        if (error.code === 'ENOENT') return null
        throw error
      },
    )
    if (checkpoint && !input.force) {
      const envelope = JSON.parse(checkpoint) as { payload: string; sha256: string }
      if (
        typeof envelope.payload !== 'string' ||
        createHash('sha256').update(envelope.payload).digest('hex') !== envelope.sha256
      )
        throw new Error('Basemap build checkpoint checksum differs.')
      const retained = JSON.parse(envelope.payload) as {
        version: number
        fingerprint: string
        archive: { size: number; sha256: string }
        result: T
      }
      if (retained.version !== 1 || retained.fingerprint !== fingerprint)
        throw new Error(
          'Basemap build inputs changed; inspect the archive before rebuilding with --force.',
        )
      const actual = await archiveMetadata(input.outputPath)
      if (
        actual.size !== retained.archive.size ||
        actual.sha256 !== retained.archive.sha256
      )
        throw new Error('Retained Basemap archive checksum differs; refusing reuse.')
      return retained.result
    }
    if (
      !input.force &&
      (await stat(input.outputPath).then(
        () => true,
        error => {
          if (error.code === 'ENOENT') return false
          throw error
        },
      ))
    )
      throw new Error(
        'Basemap archive exists without a completed build checkpoint; inspect it before rebuilding with --force.',
      )
    const temporaryPath = join(
      dirname(input.outputPath),
      `${basename(input.outputPath, '.pmtiles')}.building-${randomUUID()}.pmtiles`,
    )
    try {
      const result = await input.build(temporaryPath)
      const archive = await archiveMetadata(temporaryPath)
      if (!archive.size) throw new Error('Basemap build produced an empty archive.')
      const file = await open(temporaryPath, 'r')
      try {
        await file.sync()
      } finally {
        await file.close()
      }
      await rename(temporaryPath, input.outputPath)
      const payload = JSON.stringify({ version: 1, fingerprint, archive, result })
      await writeDeliveryFile(
        directory,
        'build.json',
        JSON.stringify({
          payload,
          sha256: createHash('sha256').update(payload).digest('hex'),
        }),
      )
      return result
    } finally {
      await rm(temporaryPath, { force: true })
    }
  })
}
