import { expect, test } from 'bun:test'
import { strict as assert } from 'node:assert'
import { Database } from 'bun:sqlite'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parquetWriteFile } from 'hyparquet-writer'
import { normaliseOverturePlace } from '@repo/core/pipeline/services/places/place'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { PlaceRecordCache } from './placeRecordCache.ts'
import {
  stagePlaces,
  stageEnrichedPlaces,
} from './processLocalPlaceSqlUploadPreparation.ts'
import { LocalPipelineBucket } from '../local/localBucket.ts'
import { deliveryFileSha256 } from '../local/sqlDeliveryFiles.ts'
import {
  createSupplementaryAddressAnalyser,
  parseSupplementaryCuration,
  emptySupplementaryEntryLedger,
  addressFingerprint,
  type StagedAddressResolution,
} from './supplementaryPlaceAddress.ts'
import policyFixture from './testFixtures/supplementaryAddressPolicy.json'
import type { PlaceAddressDefinition } from './placeAddressMatcher.ts'
import type { EnrichedPlace } from './processLocalPlaceSqlUploadTypes.ts'
import { createRecordEnrichmentReuse } from './placeRecordEnrichment.ts'
import { createPlaceAddress3dMatcher } from './placeAddress3d.ts'
import { PlaceProjectionSql } from './placeProjectionSql.ts'
import { insertSql } from './processLocalPlaceSqlUploadImport.ts'
import { MAX_SQL_BYTES } from './processLocalPlaceSqlUploadConfig.ts'

const definition: PlaceAddressDefinition = {
  addressId: 'building',
  locale: 'en',
  formattedAddress: 'Citygate, 20 Tat Tung Road',
  buildingName: 'Citygate',
  streetName: 'Tat Tung Road',
  buildingNumberExpression: '20',
  buildingNumberFrom: '20',
  buildingNumberTo: null,
  estateName: null,
  blockExpression: null,
  phaseExpression: null,
}
const source = {
  id: 'place',
  geometry: { type: 'Point', coordinates: [114, 22] },
  names: { primary: 'Shop' },
  addresses: [{ country: 'HK', freeform: 'Citygate, 20 Tat Tung Road' }],
}
const observation = {
  placeId: 'place',
  sourceRelease: '2026-01',
  texts: ['Citygate, 20 Tat Tung Road'],
  lng: 114,
  lat: 22,
}
const fixture = () =>
  parseSupplementaryCuration(
    structuredClone(policyFixture),
    emptySupplementaryEntryLedger(),
  )

test('record normalisation survives restart and new release dates; rule changes invalidate same-release staging', async () => {
  const root = await mkdtemp(join(tmpdir(), 'incremental-source-'))
  const cachePath = join(root, 'cache.sqlite')
  let cache = new PlaceRecordCache(cachePath, 'rules-1')
  try {
    const path = join(root, 'source.parquet')
    parquetWriteFile({
      filename: path,
      columnData: Object.entries(source).map(([name, value]) => ({
        name,
        type: typeof value === 'string' ? ('STRING' as const) : ('JSON' as const),
        data: [value],
      })),
    })
    const run = async (month: string) => {
      const release = join(root, month)
      await mkdir(release, { recursive: true })
      const bucket = new LocalPipelineBucket(release)
      await bucket.seedRawObject('source.parquet', path)
      const staged = await stagePlaces(
        bucket,
        'source.parquet',
        month,
        release,
        undefined,
        await deliveryFileSha256(path),
        cache,
      )
      return JSON.parse((await readFile(staged.path, 'utf8')).trim())
    }
    const first = await run('2026-01')
    cache.close()
    cache = new PlaceRecordCache(cachePath, 'rules-1')
    const second = await run('2026-02')
    expect(second).toEqual({
      ...first,
      firstSeenMonth: '2026-02',
      lastSeenMonth: '2026-02',
    })
    expect(cache.counts.get('normalisation')).toEqual({ reused: 1, computed: 0 })
    cache.close()
    cache = new PlaceRecordCache(cachePath, 'rules-2')
    expect(await run('2026-02')).toEqual(second)
    expect(cache.counts.get('normalisation')).toEqual({ reused: 0, computed: 1 })
  } finally {
    cache.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('address reuse preserves cold decisions and invalidates geometry, definitions, policy, previous links and curation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'incremental-analysis-'))
  const cache = new PlaceRecordCache(join(root, 'cache.sqlite'), 'test')
  try {
    const ledger = fixture()
    const geometry = new Map([['building', { lng: 114, lat: 22 }]])
    const build = (cached = true, definitions = [definition]) =>
      createSupplementaryAddressAnalyser(
        definitions,
        new Set(['building']),
        geometry,
        ledger,
        cached ? cache : undefined,
      )
    const first = build()(observation, null)
    expect(first.tier).toBe('direct')
    const next = { ...observation, sourceRelease: '2026-02' }
    expect(build()(next, null)).toEqual(build(false)(next, null))
    expect(cache.counts.get('address resolution')?.reused).toBe(1)
    for (const changed of [
      { ...next, lng: 115 },
      { ...next, texts: ['Unknown building'] },
    ])
      expect(build()(changed, null)).toEqual(build(false)(changed, null))
    geometry.set('building', { lng: 115, lat: 22 })
    expect(build()(next, null)).toEqual(build(false)(next, null))
    expect(build()(next, null).tier).toBe('review')
    const definitions = [{ ...definition, buildingName: 'Other building' }]
    expect(build(true, definitions)(next, null)).toEqual(
      build(false, definitions)(next, null),
    )
    const activePolicy = ledger.policies[ledger.activePolicy]
    assert(activePolicy)
    activePolicy.weights.street++
    expect(build()(next, null)).toEqual(build(false)(next, null))
    const previous = {
      addressId: 'building',
      addressSnapshotId: 'als',
      fingerprint: addressFingerprint(next.texts),
    }
    expect(build()(next, previous)).toEqual(build(false)(next, previous))
    ledger.decisions.push({
      placeId: next.placeId,
      sourceRelease: next.sourceRelease,
      fingerprint: addressFingerprint(next.texts),
      resolution: 'leave_unlinked',
      previousAddressId: null,
      addressId: null,
      reason: 'Reviewed',
    })
    expect(build()(next, null)).toEqual(build(false)(next, null))
    expect(build()({ ...next, sourceRelease: '2026-03' }, null).reason).toBe(
      'explicit_retirement',
    )
    expect(cache.counts.get('address parsing')?.reused).toBeGreaterThan(0)
  } finally {
    cache.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('enrichment reuses unchanged records across releases with fresh dates and invalidates coordinates and references', async () => {
  const root = await mkdtemp(join(tmpdir(), 'incremental-enrichment-'))
  const cache = new PlaceRecordCache(join(root, 'cache.sqlite'), 'test')
  const db = {
    select: () => ({ from: () => ({ where: () => ({ all: async () => [] }) }) }),
  } as unknown as HarbourReadableDb
  const resolution: StagedAddressResolution = {
    placeId: 'place',
    tier: 'delayed',
    addressId: null,
    sourceTexts: [],
    fingerprint: 'f',
    previous: null,
    candidates: [],
    reason: 'unlinked',
    parsed: [],
  }
  try {
    async function run(
      month: string,
      lng = 114,
      addressSnapshotId = 'als',
      cached = true,
    ) {
      const release = join(root, `${month}-${lng}-${addressSnapshotId}-${cached}`)
      await mkdir(release, { recursive: true })
      const place = normaliseOverturePlace(
        { ...source, geometry: { type: 'Point', coordinates: [lng, 22] } },
        month,
      )
      assert(place)
      async function* places() {
        assert(place)
        yield place
      }
      async function* resolutions() {
        yield resolution
      }
      const staged = await stageEnrichedPlaces(
        db,
        { addressSnapshotId, divisionSnapshotId: 'divisions' },
        places(),
        resolutions(),
        release,
        undefined,
        { resolutionPath: '', snapshotId: 'supplementary', addresses: [] },
        undefined,
        cached ? cache : undefined,
      )
      return { ...staged, path: undefined, rows: await readFile(staged.path, 'utf8') }
    }
    await run('2026-01')
    expect(await run('2026-02')).toEqual(await run('2026-02', 114, 'als', false))
    expect(cache.counts.get('enrichment')).toEqual({ reused: 1, computed: 1 })
    expect(await run('2026-03', 115)).toEqual(await run('2026-03', 115, 'als', false))
    expect(await run('2026-04', 114, 'als-2')).toEqual(
      await run('2026-04', 114, 'als-2', false),
    )
    expect(cache.counts.get('enrichment')).toEqual({ reused: 1, computed: 3 })
  } finally {
    cache.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('per-record enrichment validates missing, added, edited and removed 3D collections', async () => {
  const root = await mkdtemp(join(tmpdir(), 'incremental-units-'))
  const cache = new PlaceRecordCache(join(root, 'cache.sqlite'), 'test')
  let unit: string | null = null
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          get: async () =>
            unit === null
              ? undefined
              : {
                  id: 'collection',
                  address2dId: 'building',
                  unresolvedSectionIds: [],
                  units: [
                    {
                      id: unit,
                      floorType: 'F',
                      floorRef: '1',
                      unitType: 'F',
                      unitRef: 'A',
                    },
                  ],
                },
        }),
      }),
    }),
  } as unknown as HarbourReadableDb
  let computed = 0
  const place = normaliseOverturePlace(source, '2026-01')
  assert(place)
  const run = () =>
    createRecordEnrichmentReuse(db, cache)('same', async observer => {
      computed++
      const reference = await createPlaceAddress3dMatcher(db)(
        'als',
        { id: 'building', parentAddressId: null },
        ['Flat A, 1/F, Citygate'],
        observer,
      )
      return {
        place,
        address2dId: 'building',
        address3dId: null,
        divisionIds: [],
        versionHash: 'hash',
        sourcePayloadHash: 'source',
        ...reference,
      } as EnrichedPlace
    })
  try {
    expect((await run()).address3dId).toBeNull()
    await run()
    expect(computed).toBe(1)
    unit = 'first'
    expect((await run()).address3dUnitId).toBe('first')
    unit = 'edited'
    expect((await run()).address3dUnitId).toBe('edited')
    unit = null
    expect((await run()).address3dId).toBeNull()
    expect(computed).toBe(4)
  } finally {
    cache.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('bounded projection inserts match individual replay with quotes and Unicode', () => {
  const individual = new Database(':memory:')
  const bulk = new Database(':memory:')
  for (const db of [individual, bulk])
    db.exec('CREATE TABLE places (id TEXT PRIMARY KEY, name TEXT, data TEXT)')
  const inserts = new PlaceProjectionSql()
  const rows = Array.from({ length: 1000 }, (_, index) => ({
    id: String(index),
    name: "香港'); SELECT '😀".repeat(12),
    data: { index },
  }))
  try {
    for (const row of rows) {
      individual.exec(insertSql('places', row))
      inserts.add('places', row)
    }
    const statements = inserts.finish()
    expect(statements.length).toBeLessThan(20)
    for (const statement of statements)
      expect(Buffer.byteLength(statement)).toBeLessThanOrEqual(MAX_SQL_BYTES)
    bulk.exec(statements.join(''))
    bulk.exec(statements.join(''))
    expect(bulk.query('SELECT * FROM places ORDER BY id').all()).toEqual(
      individual.query('SELECT * FROM places ORDER BY id').all(),
    )
  } finally {
    individual.close()
    bulk.close()
  }
})

test('record cache checks persisted checksums and isolates implementation contracts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'incremental-integrity-'))
  const path = join(root, 'cache.sqlite')
  let cache = new PlaceRecordCache(path, 'one')
  try {
    cache.set('test', 'key', { value: 1 })
    cache.close()
    cache = new PlaceRecordCache(path, 'two')
    expect(cache.get('test', 'key')).toBeUndefined()
    cache.close()
    const db = new Database(path)
    db.exec("UPDATE computations SET value = '{}' ")
    db.close()
    cache = new PlaceRecordCache(path, 'one')
    expect(() => cache.get('test', 'key')).toThrow('checksum differs')
  } finally {
    cache.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('ingestion caches compact resolved results and retains full review evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'incremental-compact-'))
  const cache = new PlaceRecordCache(join(root, 'cache.sqlite'), 'test')
  try {
    const ledger = fixture()
    const geometry = new Map([['building', { lng: 114, lat: 22 }]])
    const build = () =>
      createSupplementaryAddressAnalyser(
        [definition],
        new Set(['building']),
        geometry,
        ledger,
        cache,
        true,
      )
    const direct = build()(observation, null)
    expect(direct.tier).toBe('direct')
    expect(direct.candidates).toEqual([])
    expect(direct.parsed).toEqual([])
    expect(build()(observation, null)).toEqual(direct)
    const moved = { ...observation, lng: 115 }
    const review = build()(moved, null)
    expect(review.tier).toBe('review')
    expect(review.candidates.length).toBeGreaterThan(0)
    expect(review.parsed.length).toBeGreaterThan(0)
    expect(build()(moved, null)).toEqual(review)
  } finally {
    cache.close()
    await rm(root, { recursive: true, force: true })
  }
})
