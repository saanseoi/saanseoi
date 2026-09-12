import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import {
  alsSourcePayload,
  captureAlsPublisherSources,
} from '@repo/core/pipeline/services/sources/alsSourcePayload'
import {
  buildAlsDeletionReport,
  hasAlsDeletionReview,
  reviewAlsDeletions,
  assertPreparedAlsDeletionReview,
} from './hkgovAlsDeletionPreflight'
import {
  membershipSource,
  buildAlsMembership,
  validateAlsMembership,
  writeAlsMembership,
  type AlsMembership,
  type AlsMembershipAddress,
} from './hkgovAlsMembership'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

const address = (
  id: string,
  level = 'building',
  parentId: string | null = null,
): AlsMembershipAddress => ({
  id,
  level,
  parentId,
  en: `${id} HOUSE`,
  zhHant: `${id}樓`,
  coordinates: [114.1, 22.3],
  sourceIds: [],
  curations: [],
})
function release(sourceVersion = '2024-01-01.0'): AlsMembership {
  return {
    schemaVersion: 1,
    sourceVersion,
    addresses: [address('estate', 'complex'), address('house', 'building', 'estate')],
    collections: [
      {
        id: 'inventory',
        ownerId: 'house',
        sourceIds: ['source-3d'],
        units: [
          ['unit-1', '1', '101', '1/F, FLAT 101', '1樓101室'],
          ['unit-2', '1', '102', '1/F, FLAT 102', '1樓102室'],
        ],
      },
    ],
    sources: [
      {
        id: 'source-3d',
        kind: '3d',
        canonicalIds: ['house'],
        units: ['["1","101"]', '["1","102"]'],
      },
      { id: 'source-2d', kind: '2d', canonicalIds: ['house'] },
    ],
    aliases: [],
  }
}

test('ordinary flat omissions retire with bilingual labels and original parent chain', () => {
  const before = release()
  const after = release('2024-02-01.0')
  after.collections[0]!.units.shift()
  after.sources[0]!.units!.shift()
  const report = buildAlsDeletionReport(before, after)
  expect(report.requiresReview).toBeFalse()
  expect(report.groups.unit).toMatchObject({
    previousCount: 2,
    removedCount: 1,
    removedPercentage: 50,
  })
  expect(report.groups.unit!.retirements[0]).toMatchObject({
    id: 'unit-1',
    en: '1/F, FLAT 101',
    zhHant: '1樓101室',
    parentChain: [{ id: 'house' }, { id: 'estate' }],
    mapUrl: expect.stringContaining('114.1'),
  })
  expect(report.retainedPublisherUnitOmissions).toEqual([])
})

test('reparenting enduring units does not imply retirement or whole inventory loss', () => {
  const before = release()
  const after = release('2024-02-01.0')
  after.addresses.push(address('section', 'section', 'house'))
  after.collections[0]!.ownerId = 'section'
  after.collections[0]!.id = 'section-inventory'
  after.sources[0]!.canonicalIds = ['section']
  const report = buildAlsDeletionReport(before, after)
  expect(report.groups.unit!.removedCount).toBe(0)
  expect(report.wholeInventoryLosses).toEqual([])
  expect(report.requiresReview).toBeFalse()
})

test('aliases and curated publisher omissions are distinct from canonical retirements', () => {
  const before = release()
  before.addresses.push(address('alias', 'building', 'estate'))
  before.sources.push({ id: 'alias-source', kind: '2d', canonicalIds: ['alias'] })
  const after = release('2024-02-01.0')
  after.aliases.push(['alias', 'house'])
  after.sources = []
  after.collections[0]!.sourceIds = []
  after.addresses[1]!.curations = ['reviewed-retention']
  const report = buildAlsDeletionReport(before, after)
  expect(report.groups.building!.removedCount).toBe(0)
  expect(report.aliasReplacements).toMatchObject([
    { previous: { id: 'alias' }, current: { id: 'house' } },
  ])
  expect(
    report.rawSourceOmissions.find(value => value.id === 'source-2d'),
  ).toMatchObject({
    disposition: 'curation_retention',
    retainedCanonicalIds: ['house'],
  })
  expect(report.retainedPublisherUnitOmissions).toEqual([
    {
      sourceId: 'source-3d',
      ownerId: 'house',
      unitTokens: ['["1","101"]', '["1","102"]'],
      curations: [],
      disposition: 'curation_retention',
      supportingSourceIds: [],
    },
  ])
})

test('complex retirement reports affected descendants and requires exact digest review', async () => {
  const before = release()
  const after: AlsMembership = {
    ...release('2024-02-01.0'),
    addresses: [],
    collections: [],
    sources: [],
  }
  const report = buildAlsDeletionReport(before, after)
  expect(report.requiresReview).toBeTrue()
  expect(report.groups.complex!.retirements[0]).toMatchObject({
    descendantAddresses: 1,
    descendantUnits: 2,
  })
  expect(report.wholeInventoryLosses).toHaveLength(1)
  const approved = {
    schemaVersion: 1,
    reviews: [
      {
        digest: report.digest,
        sourceVersion: report.sourceVersion,
        previousSourceVersion: report.previousSourceVersion,
        reason: 'Reviewed demolition evidence',
        reviewedAt: '2026-09-11T10:00:00Z',
      },
    ],
  }
  expect(hasAlsDeletionReview(report, approved)).toBeTrue()
  expect(
    hasAlsDeletionReview(report, {
      ...approved,
      reviews: [{ ...approved.reviews[0], digest: 'stale' }],
    }),
  ).toBeFalse()
  const dir = await mkdtemp(join(tmpdir(), 'als-deletion-review-'))
  try {
    const reportFile = join(dir, 'report.json')
    const approvalsFile = join(dir, 'approvals.json')
    await expect(
      reviewAlsDeletions({
        previous: before,
        current: after,
        reportFile,
        approvalsFile,
      }),
    ).rejects.toThrow('--yes and --skip-curation-checks cannot approve')
    expect((await Bun.file(reportFile).json()).digest).toBe(report.digest)
    await Bun.write(approvalsFile, JSON.stringify(approved))
    await expect(
      reviewAlsDeletions({
        previous: before,
        current: after,
        reportFile,
        approvalsFile,
      }),
    ).resolves.toMatchObject({ digest: report.digest })
    after.addresses = [address('elsewhere')]
    await expect(
      reviewAlsDeletions({
        previous: before,
        current: after,
        reportFile,
        approvalsFile,
      }),
    ).rejects.toThrow('require review')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('remaining duplicate assertions and reparented curated units retain distinct evidence', () => {
  const before = release()
  const after = release('2024-02-01.0')
  after.sources[0]!.id = 'replacement-source'
  after.collections[0]!.sourceIds = ['replacement-source']
  const report = buildAlsDeletionReport(before, after)
  expect(report.rawSourceOmissions).toMatchObject([
    {
      id: 'source-3d',
      disposition: 'remaining_source_or_alias',
      retentionEvidence: [
        { id: 'house', sourceIds: ['replacement-source', 'source-2d'] },
      ],
    },
  ])
  expect(report.retainedPublisherUnitOmissions).toMatchObject([
    {
      disposition: 'remaining_source_or_alias',
      supportingSourceIds: ['replacement-source'],
    },
  ])

  after.sources[0]!.id = 'source-3d'
  after.sources[0]!.units = []
  after.sources[0]!.canonicalIds = ['section']
  after.addresses.push(address('section', 'section', 'house'))
  after.collections[0]!.ownerId = 'section'
  after.collections[0]!.sourceIds = ['source-3d']
  after.collections[0]!.curations = ['reviewed-unit-retention']
  const moved = buildAlsDeletionReport(before, after)
  expect(moved.groups.unit?.removedCount).toBe(0)
  expect(moved.retainedPublisherUnitOmissions).toEqual([
    {
      sourceId: 'source-3d',
      ownerId: 'section',
      unitTokens: ['["1","101"]', '["1","102"]'],
      curations: ['reviewed-unit-retention'],
      disposition: 'curation_retention',
      supportingSourceIds: [],
    },
  ])
})

test('large flat deletion spikes require review even when an inventory survives', () => {
  const before = release()
  before.collections[0]!.units = Array.from({ length: 2000 }, (_, i) => [
    `unit-${i}`,
    '1',
    String(i),
    String(i),
    String(i),
  ])
  const after = structuredClone(before)
  after.sourceVersion = '2024-02-01.0'
  after.collections[0]!.units.splice(0, 100)
  expect(buildAlsDeletionReport(before, after).suspicious).toContainEqual({
    reason: 'deletion_spike',
    level: 'unit',
    count: 100,
  })
})

test('final dangling parents, owner references and shared unit identities hard fail', () => {
  const invalid = release()
  invalid.addresses[1]!.parentId = 'missing'
  expect(() => validateAlsMembership(invalid)).toThrow('dangling parent')
  invalid.addresses[1]!.parentId = 'house'
  expect(() => validateAlsMembership(invalid)).toThrow('cycle')
  invalid.addresses[1]!.parentId = 'estate'
  invalid.collections[0]!.ownerId = 'missing'
  expect(() => validateAlsMembership(invalid)).toThrow('dangling inventory owner')
  invalid.collections[0]!.ownerId = 'house'
  invalid.collections.push({ ...invalid.collections[0]!, id: 'other-inventory' })
  expect(() => validateAlsMembership(invalid)).toThrow('Duplicate ALS inventory owner')
  invalid.collections[1]!.ownerId = 'estate'
  expect(() => validateAlsMembership(invalid)).toThrow('Duplicate ALS unit')
  invalid.collections.pop()
  invalid.collections[0]!.unresolvedSectionIds = ['estate']
  expect(() => validateAlsMembership(invalid)).toThrow('belongs to another owner')
  invalid.collections[0]!.unresolvedSectionIds = []
  invalid.addresses[0]!.sourceIds = ['missing-source']
  expect(() => validateAlsMembership(invalid)).toThrow('missing address source')
})

test('raw unit tokens use captured publisher payload before inventory corrections', () => {
  const raw = alsSourcePayload({
    properties: {
      Address: {
        PremisesAddress: {
          EngPremisesAddress: {
            Eng3dAddress: [
              {
                EngFloor: { FloorNum: 1, FloorDescription: '1/F' },
                EngUnit: { UnitNo: '101' },
              },
            ],
          },
          ChiPremisesAddress: {
            Chi3dAddress: [
              {
                ChiFloor: { FloorNum: 1, FloorDescription: '1樓' },
                ChiUnit: { UnitNo: '101' },
              },
            ],
          },
        },
      },
    },
  })
  expect(
    membershipSource({ sourceRecordId: 'source', properties: raw.properties }, '3d')
      .units,
  ).toEqual(['["1","101"]'])
})

test('membership uses final canonical granularity and retains publisher-only assertions', async () => {
  const sourceVersion = '2020-01-01.0'
  const sourceFile = 'als_addresses_(test_district).geojson'
  const publisherSources = await captureAlsPublisherSources(
    [1, 2].map(featureIndexOneBased => ({
      sourceFile,
      featureIndexOneBased,
      feature: {
        geometry: { type: 'Point', coordinates: [114.1, 22.3] },
        properties: {
          Address: {
            PremisesAddress: {
              GeoAddress: `RAW-${featureIndexOneBased}`,
              EngPremisesAddress: { BuildingName: 'RAW HOUSE' },
            },
          },
        },
      },
    })),
    sourceVersion,
  )
  const row = {
    id: 'canonical',
    canonicalId: 'canonical',
    sourceVersion,
    sourceFile,
    sourceFeatureIndexOneBased: 1,
    divisionSnapshotId: 'division',
    enFormattedAddress: 'FINAL COMPLEX',
    zhHantFormattedAddress: '最終屋邨',
    enBuildingName: 'FINAL COMPLEX',
    hierarchyCuration: 'reviewed-complex',
    curatedGranularity: 'complex',
    geometry: '{"type":"Point","coordinates":[114.1,22.3]}',
    sources: '[]',
  } as unknown as PreparedHkgovAlsRow
  const manifest = buildAlsMembership({
    sourceVersion,
    rows: [row],
    publisherSources,
    collections: [],
    sources3d: [],
    aliases: new Map([['retired-alias', 'canonical']]),
  })
  expect(manifest.addresses).toMatchObject([
    {
      id: 'canonical',
      level: 'complex',
      en: 'FINAL COMPLEX',
      zhHant: '最終屋邨',
      curations: ['reviewed-complex'],
    },
  ])
  expect(manifest.sources).toHaveLength(2)
  expect(
    manifest.sources.filter(source => source.canonicalIds.length === 0),
  ).toHaveLength(1)
  expect([...publisherSources.values()][0]!.properties?.buildingNameEn).toBe(
    'RAW HOUSE',
  )
  expect(manifest.aliases).toEqual([['retired-alias', 'canonical']])

  const curation = {
    id: 'retained-house',
    curationFile: 'hkgov-dpo-address-house-retentions.json',
    evidenceSourceVersion: '2019-01-01.0',
    curation: { verification: 'verified' },
    originalAssertions: [{ feature: { huge: 'raw assertion' } }],
  }
  row.sources = JSON.stringify({ hkgovAlsHouseRetention: curation })
  const retained = buildAlsMembership({
    sourceVersion,
    rows: [row],
    publisherSources,
    collections: [],
    sources3d: [],
    aliases: new Map(),
  })
  expect(retained.addresses[0]?.curations).toContain(
    JSON.stringify({
      id: curation.id,
      curationFile: curation.curationFile,
      evidenceSourceVersion: curation.evidenceSourceVersion,
      curation: curation.curation,
    }),
  )
  expect(retained.addresses[0]?.curations.join(' ')).not.toContain('huge')
})

test('upload validates prepared file hashes, source version and predecessor review', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'als-membership-upload-'))
  try {
    const preparedFile = join(dir, 'prepared.parquet')
    await Bun.write(preparedFile, 'prepared')
    await Bun.write(`${preparedFile}.address3d.jsonl`, 'inventory')
    const current = release()
    const digest = (value: string) => createHash('sha256').update(value).digest('hex')
    current.preparedSha256 = digest('prepared')
    current.address3dSha256 = digest('inventory')
    await writeAlsMembership(`${preparedFile}.membership.json`, current)
    const input = {
      preparedFile,
      sourceVersion: current.sourceVersion,
      reportFile: join(dir, 'review.json'),
      approvalsFile: join(dir, 'approvals.json'),
    }
    await expect(assertPreparedAlsDeletionReview(input)).resolves.toMatchObject({
      sourceVersion: current.sourceVersion,
    })
    await expect(
      assertPreparedAlsDeletionReview({ ...input, sourceVersion: 'wrong' }),
    ).rejects.toThrow('source version')
    await Bun.write(preparedFile, 'changed')
    await expect(assertPreparedAlsDeletionReview(input)).rejects.toThrow(
      'changed after membership',
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('reviewed redevelopment approves only the exact four Bay View houses', async () => {
  const fixture = (
    await import(
      '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-approved-retirements.json'
    )
  ).default
  const addresses: AlsMembershipAddress[] = structuredClone(
    fixture.decisions[0]!.previousAddresses,
  ).map(a => ({ ...a, coordinates: [a.coordinates[0]!, a.coordinates[1]!] }))
  const before: AlsMembership = {
    schemaVersion: 1,
    sourceVersion: '2024-07-25.0',
    addresses,
    collections: [],
    aliases: [],
    sources: [...new Set(addresses.flatMap(a => a.sourceIds))].map(id => ({
      id,
      kind: '2d',
      canonicalIds: addresses.filter(a => a.sourceIds.includes(id)).map(a => a.id),
    })),
  }
  const after: AlsMembership = {
    schemaVersion: 1,
    sourceVersion: '2024-07-31.0',
    addresses: [],
    collections: [],
    aliases: [],
    sources: [],
  }
  const report = buildAlsDeletionReport(before, after)
  expect(report.groups.building!.removedCount).toBe(4)
  expect(report.reviewedRetirements).toHaveLength(4)
  expect(report.requiresReview).toBeFalse()
  before.addresses.push(address('unrelated'))
  expect(buildAlsDeletionReport(before, after).requiresReview).toBeTrue()
  before.addresses.pop()
  before.addresses[0]!.coordinates = [114, 22]
  expect(buildAlsDeletionReport(before, after).reviewedRetirements).toHaveLength(3)
  expect(buildAlsDeletionReport(before, after).requiresReview).toBeTrue()
  before.addresses = addresses.map(a => structuredClone(a))
  const future = { ...after, sourceVersion: '2027-01-01.0' }
  expect(buildAlsDeletionReport(before, future).requiresReview).toBeTrue()
})

test('Hankow redevelopment covers both exact source generations without approving inventory loss', async () => {
  const fixture = (
    await import(
      '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-approved-retirements.json'
    )
  ).default
  const decision = fixture.decisions.find(
    d => d.id === 'hankow-apartments-redeveloped',
  )!
  const addresses: AlsMembershipAddress[] = structuredClone(
    decision.previousAddresses,
  ).map(a => ({ ...a, coordinates: [a.coordinates[0]!, a.coordinates[1]!] }))
  const before: AlsMembership = {
    schemaVersion: 1,
    sourceVersion: '2024-07-25.0',
    addresses,
    collections: [],
    aliases: [],
    sources: addresses.flatMap(a =>
      a.sourceIds.map(id => ({ id, kind: '2d' as const, canonicalIds: [a.id] })),
    ),
  }
  const after: AlsMembership = {
    ...before,
    sourceVersion: '2024-11-13.0',
    addresses: [],
    sources: [],
  }
  expect(buildAlsDeletionReport(before, after).reviewedRetirements).toHaveLength(6)
  expect(buildAlsDeletionReport(before, after).requiresReview).toBeFalse()
  before.addresses.push(address('dependent', 'building', addresses[0]!.id))
  const report = buildAlsDeletionReport(before, after)
  expect(report.reviewedRetirements).toHaveLength(5)
  expect(report.requiresReview).toBeTrue()
})
