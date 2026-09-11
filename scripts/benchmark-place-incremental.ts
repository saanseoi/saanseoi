import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { strict as assert } from 'node:assert'
import { currentSchema } from '@repo/db'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { normaliseOverturePlace } from '@repo/core/pipeline/services/place'
import {
  PlaceRecordCache,
  recordCacheKey,
} from '../apps/harbour-cli/src/lib/pipeline/places/placeRecordCache.ts'
import {
  createSupplementaryAddressAnalyser,
  compactAddressResolution,
  emptySupplementaryEntryLedger,
  parseSupplementaryCuration,
} from '../apps/harbour-cli/src/lib/pipeline/places/supplementaryPlaceAddress.ts'
import { stageEnrichedPlaces } from '../apps/harbour-cli/src/lib/pipeline/places/processLocalPlaceSqlUploadPreparation.ts'
import { PlaceProjectionSql } from '../apps/harbour-cli/src/lib/pipeline/places/placeProjectionSql.ts'
import { insertSql } from '../apps/harbour-cli/src/lib/pipeline/places/processLocalPlaceSqlUploadImport.ts'
import policy from '../apps/harbour-cli/src/lib/pipeline/places/testFixtures/supplementaryAddressPolicy.json'

// Isolated synthetic workload: no remote access, publication or production data writes.
const count = 1000
const definitions = Array.from({ length: count }, (_, index) => ({
  addressId: `building-${index}`,
  locale: 'en',
  formattedAddress: `Building ${index}, ${index + 1} Example Road`,
  buildingName: `Building ${index}`,
  streetName: 'Example Road',
  buildingNumberExpression: String(index + 1),
  buildingNumberFrom: String(index + 1),
  buildingNumberTo: null,
  estateName: null,
  blockExpression: null,
  phaseExpression: null,
}))
const ids = new Set(definitions.map(row => row.addressId))
const geometry = new Map(definitions.map(row => [row.addressId, { lng: 114, lat: 22 }]))
const addresses = definitions.map(row => ({
  id: row.addressId,
  snapshotId: 'als',
  parentAddressId: null,
  countryId: 'hk',
  areaId: null,
  districtId: null,
  hamletId: null,
  macrohoodId: null,
  microhoodId: null,
  neighbourhoodId: null,
  townId: null,
  villageId: null,
}))
const places = definitions.map((definition, index) =>
  normaliseOverturePlace(
    {
      id: `place-${index}`,
      geometry: { type: 'Point', coordinates: [114, 22] },
      names: { primary: `Shop ${index}` },
      addresses: [{ country: 'HK', freeform: definition.formattedAddress }],
    },
    '2026-01',
  ),
)
assert(places.every(place => place !== null))
const db = {
  select: () => ({
    from: (table: unknown) => ({
      where: () => ({
        all: async () =>
          table === currentSchema.address2d ? addresses : [{ id: 'hk' }],
      }),
    }),
  }),
} as unknown as HarbourReadableDb
const root = await mkdtemp(join(tmpdir(), 'place-incremental-benchmark-'))
const cache = new PlaceRecordCache(join(root, 'cache.sqlite'))
try {
  const run = async (name: string, records?: PlaceRecordCache) => {
    const start = performance.now()
    const fixture = parseSupplementaryCuration(
      structuredClone(policy),
      emptySupplementaryEntryLedger(),
    )
    const analyse = createSupplementaryAddressAnalyser(
      definitions,
      ids,
      geometry,
      fixture,
      records,
      true,
    )
    const resolutions = places.map(place =>
      compactAddressResolution(
        analyse(
          {
            placeId: place.id,
            sourceRelease: '2026-01',
            texts: place.addresses ?? [],
            lng: place.lng,
            lat: place.lat,
          },
          null,
        ),
      ),
    )
    assert(resolutions.every(row => row.tier !== 'review'))
    const analysisMs = performance.now() - start
    const release = join(root, name)
    await mkdir(release)
    async function* source() {
      yield* places
    }
    async function* resolved() {
      yield* resolutions
    }
    const enriched = await stageEnrichedPlaces(
      db,
      { addressSnapshotId: 'als', divisionSnapshotId: 'divisions' },
      source(),
      resolved(),
      release,
      undefined,
      { resolutionPath: '', snapshotId: 'supplementary', addresses: [] },
      undefined,
      records,
    )
    records?.flush()
    const elapsedMs = performance.now() - start
    const bytes = await readFile(enriched.path, 'utf8')
    return {
      analysisMs,
      enrichmentMs: elapsedMs - analysisMs,
      totalMs: elapsedMs,
      outputHash: recordCacheKey(bytes),
      resolutionHash: recordCacheKey(resolutions),
    }
  }
  const direct = await run('direct')
  const cold = await run('cold', cache)
  const warm = await run('warm', cache)
  assert.equal(direct.outputHash, cold.outputHash)
  assert.equal(direct.outputHash, warm.outputHash)
  assert.equal(direct.resolutionHash, warm.resolutionHash)
  const projection = new PlaceProjectionSql()
  const single = places.map(place => {
    const row = {
      snapshotId: 'new-snapshot',
      id: place.id,
      name: place.i18n[0]?.name,
      lng: place.lng,
      lat: place.lat,
    }
    projection.add('places', row)
    return insertSql('places', row)
  })
  const report = {
    workload:
      '1000 synthetic Places and official address definitions; in-memory reference reads; excludes mirroring, Parquet and remote delivery',
    direct,
    cold,
    warm,
    warmSpeedup: direct.totalMs / warm.totalMs,
    counts: Object.fromEntries(cache.counts),
    sql: {
      individualStatements: single.length,
      batchedStatements: projection.finish().length,
      individualBytes: Buffer.byteLength(single.join('')),
      batchedBytes: Buffer.byteLength(projection.finish().join('')),
    },
  }
  const output = resolve('.cache/preparation-benchmarks/place-incremental.json')
  await mkdir(resolve('.cache/preparation-benchmarks'), { recursive: true })
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({ ...report, output }, null, 2))
} finally {
  cache.close()
  await rm(root, { recursive: true, force: true })
}
