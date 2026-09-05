import { readFile } from 'node:fs/promises'
import { readParquetObjectsInBatches } from '@repo/core/pipeline/parquetR2'
import { normaliseOverturePlace } from '@repo/core/pipeline/services/place'
import {
  resolvePlaceTranslationsBatch,
  type PlaceTranslationRecord,
} from './placeTranslations.ts'

export function createLocalParquetBuffer(contents: Uint8Array) {
  return {
    byteLength: contents.byteLength,
    async slice(start: number, end?: number) {
      // `Uint8Array.from` deliberately copies the requested range. This is
      // important for Node Buffers, whose `.buffer` may include unrelated
      // bytes before or after the view.
      return Uint8Array.from(contents.subarray(start, end)).buffer
    },
  }
}

/**
 * Builds the reviewable Places fixture in source-row batches. The input is a
 * retained Overture Places parquet file; no database rows are created by this
 * inspection helper. Place machine translation is currently disabled, so the
 * helper reads and normalises the source without calling Azure or changing a fixture.
 */
export async function buildPlaceTranslationFixtureFromParquet(input: {
  inputPath: string
  sourceRelease: string
  sourceVersion: string
  datasetCode?: string
  fixturePath?: string
  batchSize?: number
  translate?: Parameters<typeof resolvePlaceTranslationsBatch>[0]['translate']
}) {
  const contents = await readFile(input.inputPath)
  const file = createLocalParquetBuffer(contents)
  const batchSize = input.batchSize ?? 50
  let rowsRead = 0
  let placesRead = 0
  let applications = 0
  for await (const batch of readParquetObjectsInBatches(file, batchSize, {
    columns: ['id', 'geometry', 'names', 'brand', 'addresses'],
  })) {
    rowsRead += batch.length
    const places = batch
      .map(row => normaliseOverturePlace(row, input.sourceVersion))
      .filter((place): place is NonNullable<typeof place> => place !== null)
    placesRead += places.length
    const records: PlaceTranslationRecord[] = places.map(place => ({
      recordId: place.id,
      localisations: place.i18n,
    }))
    const result = await resolvePlaceTranslationsBatch({
      allowGeneration: true,
      datasetCode: input.datasetCode,
      fixturePath: input.fixturePath,
      records,
      sourceRelease: input.sourceRelease,
      translate: input.translate,
    })
    applications += [...result.values()].reduce(
      (count, value) => count + value.applications.length,
      0,
    )
  }
  return { rowsRead, placesRead, applications, batchSize }
}
