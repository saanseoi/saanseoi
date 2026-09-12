import { beforeEach, describe, expect, mock, test } from 'bun:test'

import type { DivisionRecord } from '../db/divisions'
import { DivisionsListQuerySchema } from '../schema/divisions'
import {
  getDivisionDetail,
  listDivisions,
  type DivisionServiceDependencies,
} from './divisions'

const activeSnapshot = {
  snapshotId: 'snapshot-hk-division',
  apiReleaseSet: 'data-hk-divisions-2026-06-17.0',
  apiCatalogRevision: 'catalog-hk-divisions-v0.1-2026-06-29.0',
  catalogPublishedAt: '2026-06-29T00:00:00.000Z',
  cohortKey: '2026-06-17.0',
  domainCode: 'geographic',
  effectiveFrom: '2026-06-17T00:00:00.000Z',
  schemaVersion: 'sv-division-v1',
  rulesetVersion: 'rs-division-merge-v1',
}

const resolvedReleaseSet = {
  releaseSet: {
    id: 'release-set-hk-division',
    code: activeSnapshot.apiReleaseSet,
    cohortKey: activeSnapshot.cohortKey,
    domainCode: activeSnapshot.domainCode,
    effectiveFrom: activeSnapshot.effectiveFrom,
    effectiveTo: null,
    revision: 0,
    schemaVersion: activeSnapshot.schemaVersion,
    rulesetVersion: activeSnapshot.rulesetVersion,
    apiCatalogRevision: activeSnapshot.apiCatalogRevision,
    catalogPublishedAt: activeSnapshot.catalogPublishedAt,
  },
  snapshots: [
    {
      snapshotResourceType: 'division',
      snapshotId: activeSnapshot.snapshotId,
      role: 'primary',
      variant: 'overture',
    },
  ],
}

const normalisedHierarchy = [
  { id: 'division-hk-sar', name: '香港特別行政區 Hong Kong SAR', class: 'sar' },
  { id: 'division-east', name: '東區 Eastern District', class: 'district' },
]
const hierarchies = {
  administrative: [normalisedHierarchy],
  locality: [],
  full: [normalisedHierarchy],
}

const baseRecord: DivisionRecord = {
  division: {
    snapshotId: activeSnapshot.snapshotId,
    id: 'division-a-kung-ngam',
    level: 3,
    class: 'locality',
    category: 'locality',
    hierarchies,
    geometry: {
      type: 'Point',
      coordinates: [114.2262, 22.2788],
    },
    bbox: [114.22, 22.27, 114.23, 22.28],
    identifiers: null,
    wikidataId: 'Q123456',
    cartography: {
      kind: 'label-center',
    },
    sources: {
      overture: [
        {
          property: '/properties/id',
          dataset: 'overture',
          record_id: 'ovt-division-a-kung-ngam',
        },
      ],
    },
    createdAt: '2026-06-17T00:00:00.000Z',
    updatedAt: '2026-06-18T00:00:00.000Z',
  },
  i18n: {
    en: {
      name: 'A Kung Ngam',
      nameVariant: ['A Kung Ngam'],
      nameAlts: ['A Kung-Ngam'],
      nameRules: [{ value: 'A Kung-Ngam', variant: 'alternate' }],
    },
    'zh-hant': {
      name: '阿公岩',
      nameVariant: ['阿公岩', '阿公岩 A Kung Ngam'],
      nameAlts: ['阿公岩 A Kung Ngam'],
      nameRules: [{ value: '阿公岩 A Kung Ngam', variant: 'alternate' }],
    },
  },
}

const includedRecordsById: Record<string, DivisionRecord> = {
  'division-country-cn': {
    division: {
      snapshotId: activeSnapshot.snapshotId,
      id: 'division-country-cn',
      level: 0,
      class: 'country',
      category: 'administrative',
      geometry: null,
      bbox: null,
      identifiers: null,
      wikidataId: null,
      hierarchies: { administrative: [], locality: [], full: [] },
      cartography: null,
      sources: null,
      createdAt: '2026-06-17T00:00:00.000Z',
      updatedAt: '2026-06-18T00:00:00.000Z',
    },
    i18n: {
      'zh-hant': {
        name: '中國',
      },
    },
  },
  'division-hk-sar': {
    division: {
      snapshotId: activeSnapshot.snapshotId,
      id: 'division-hk-sar',
      level: 0,
      class: 'sar',
      category: 'administrative',
      geometry: null,
      bbox: null,
      identifiers: null,
      wikidataId: null,
      hierarchies: { administrative: [], locality: [], full: [] },
      cartography: null,
      sources: null,
      createdAt: '2026-06-17T00:00:00.000Z',
      updatedAt: '2026-06-18T00:00:00.000Z',
    },
    i18n: {
      en: {
        name: 'Hong Kong SAR',
      },
    },
  },
  'division-east': {
    division: {
      snapshotId: activeSnapshot.snapshotId,
      id: 'division-east',
      level: 2,
      class: 'district',
      category: 'administrative',
      geometry: null,
      bbox: null,
      identifiers: null,
      wikidataId: null,
      hierarchies: { administrative: [], locality: [], full: [] },
      cartography: null,
      sources: null,
      createdAt: '2026-06-17T00:00:00.000Z',
      updatedAt: '2026-06-18T00:00:00.000Z',
    },
    i18n: {
      'zh-hant': {
        name: '東區',
      },
    },
  },
}

const includedDivisionRecords = Object.values(includedRecordsById)
let listRecords: DivisionRecord[] = [baseRecord]
const resolveApiReleaseSetSnapshotsForRequestMock = mock(
  async (): Promise<typeof resolvedReleaseSet | null> => resolvedReleaseSet,
)
const divisionHistoryDb = {} as never
const historyDbsByBinding = {
  DB_HISTORY_HK_BEFORE: {} as never,
  DB_HISTORY_HK_2025: divisionHistoryDb,
  DB_HISTORY_HK_2026: divisionHistoryDb,
}
const resolveSnapshotReplayPlanMock = mock(async () => [])
const resolveSnapshotVersionStateMock = mock(async () => new Map())
const listReplayedDivisionRecordsMock = mock(async () => listRecords)
const resolvePublishedAreaSnapshotMock = mock(
  async (): Promise<{ id: string } | null> => null,
)
let divisionAreaLookups: Array<{
  snapshotId: string
  divisionIds: string[]
  variant?: string
}> = []
const listDivisionAreasCurrentByDivisionIdsMock = mock(
  async (
    _db: never,
    lookup: { snapshotId: string; divisionIds: string[]; variant?: string },
  ) => {
    divisionAreaLookups.push(lookup)
    return []
  },
)

const divisionServiceDependencies: Partial<DivisionServiceDependencies> = {
  hasSupersedingPublication: async () => false,
  getPublicationReadiness: async () => 'ready',
  listDivisionRecordsCurrent: async (_db, lookup) =>
    listRecords.filter(
      record =>
        (lookup.class === undefined || record.division.class === lookup.class) &&
        (lookup.level === undefined || record.division.level === lookup.level) &&
        (lookup.category === undefined || record.division.category === lookup.category),
    ),
  countDivisionsCurrent: async () => listRecords.length,
  listDivisionRecordsCurrentByIds: async (_db, lookup) =>
    [...listRecords, ...includedDivisionRecords].filter(record =>
      lookup.divisionIds.includes(record.division.id),
    ),
  hasCurrentDivisionSnapshot: async () => true,
  hasCurrentDivisionGeometrySnapshot: async () => true,
  resolveApiReleaseSetSnapshotsForRequest:
    resolveApiReleaseSetSnapshotsForRequestMock as unknown as DivisionServiceDependencies['resolveApiReleaseSetSnapshotsForRequest'],
  resolvePublishedSnapshotForResourceTypeRegionCohortKey:
    resolvePublishedAreaSnapshotMock as unknown as DivisionServiceDependencies['resolvePublishedSnapshotForResourceTypeRegionCohortKey'],
  resolveSnapshotReplayPlan:
    resolveSnapshotReplayPlanMock as unknown as DivisionServiceDependencies['resolveSnapshotReplayPlan'],
  resolveSnapshotVersionState:
    resolveSnapshotVersionStateMock as unknown as DivisionServiceDependencies['resolveSnapshotVersionState'],
  listReplayedDivisionRecords:
    listReplayedDivisionRecordsMock as unknown as DivisionServiceDependencies['listReplayedDivisionRecords'],
  listDivisionAreasCurrentByDivisionIds:
    listDivisionAreasCurrentByDivisionIdsMock as unknown as DivisionServiceDependencies['listDivisionAreasCurrentByDivisionIds'],
  listDivisionBoundariesCurrentByDivisionIds: mock(async () => []),
}

describe('division services', () => {
  test('does not replay sparse geometry when its current snapshot still exists', async () => {
    const resolveReplay = mock(async () => {
      throw new Error('unexpected replay')
    })
    const hasGeometry = mock(async () => 'ready')
    const result = await listDivisions({
      currentDb: {} as never,
      historyDbsByBinding,
      metaDb: {} as never,
      requestUrl:
        'http://localhost/divisions/v0.1?include=areas:overture,boundaries:overture',
      requestedVersionPath: 'divisions/v0.1',
      requestedApiVersion: '0.1',
      resolvedApiVersion: 'api-divisions-v0.1',
      query: { include: 'areas:overture,boundaries:overture' },
      dependencies: {
        ...divisionServiceDependencies,
        hasCurrentDivisionSnapshot: async () => true,
        listDivisionRecordsCurrent: async () => [baseRecord],
        countDivisionsCurrent: async () => 1,
        getPublicationReadiness: hasGeometry,
        resolveSnapshotReplayPlan: resolveReplay,
        resolveApiReleaseSetSnapshotsForRequest: async () =>
          ({
            ...resolvedReleaseSet,
            snapshots: [
              ...resolvedReleaseSet.snapshots,
              {
                snapshotResourceType: 'divisionArea',
                snapshotId: 'area-sparse',
                role: 'supporting',
                variant: 'overture',
              },
              {
                snapshotResourceType: 'divisionBoundary',
                snapshotId: 'boundary-sparse',
                role: 'supporting',
                variant: 'overture',
              },
            ],
          }) as never,
      },
    })
    expect(result.status).toBe(200)
    expect(hasGeometry).toHaveBeenCalledTimes(6)
    expect(resolveReplay).not.toHaveBeenCalled()
  })

  test('reads a materialised detail by ID without history replay', async () => {
    const lookup = mock(async () => [baseRecord])
    const replay = mock(async () => {
      throw new Error('Unexpected replay')
    })
    const result = await getDivisionDetail({
      currentDb: {} as never,
      historyDbsByBinding,
      metaDb: {} as never,
      requestUrl: 'http://localhost/divisions/v0/example',
      requestedVersionPath: 'divisions/v0',
      requestedApiVersion: '0.1',
      resolvedApiVersion: 'api-divisions-v0.1',
      id: baseRecord.division.id,
      query: {},
      dependencies: {
        ...divisionServiceDependencies,
        hasCurrentDivisionSnapshot: async () => true,
        listDivisionRecordsCurrentByIds: lookup,
        resolveSnapshotReplayPlan: replay,
      },
    })
    expect(result.status).toBe(200)
    expect(lookup).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ divisionIds: [baseRecord.division.id] }),
    )
    expect(replay).not.toHaveBeenCalled()
  })
  test('paginates materialised divisions without replaying history', async () => {
    const list = mock(async () => [baseRecord])
    const count = mock(async () => 5269)
    const replay = mock(async () => {
      throw new Error('Must not replay current data')
    })
    const result = await listDivisions({
      currentDb: {} as never,
      historyDbsByBinding,
      metaDb: {} as never,
      requestUrl: 'http://localhost/divisions/v0?page[limit]=1&page[offset]=100',
      requestedVersionPath: 'divisions/v0',
      requestedApiVersion: '0.1',
      resolvedApiVersion: 'api-divisions-v0.1',
      query: { 'page[limit]': 1, 'page[offset]': 100 },
      dependencies: {
        ...divisionServiceDependencies,
        hasCurrentDivisionSnapshot: async () => true,
        listDivisionRecordsCurrent: list,
        countDivisionsCurrent: count,
        resolveSnapshotReplayPlan: replay,
      },
    })
    expect(result.status).toBe(200)
    expect(list).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ limit: 1, offset: 100 }),
    )
    expect(count).toHaveBeenCalledTimes(1)
    expect(replay).not.toHaveBeenCalled()
    if (result.status === 200) expect(result.body.meta.page.total).toBe(5269)
  })

  beforeEach(() => {
    listRecords = [baseRecord]
    resolveApiReleaseSetSnapshotsForRequestMock.mockImplementation(
      async () => resolvedReleaseSet,
    )
    listReplayedDivisionRecordsMock.mockImplementation(async () => listRecords)
    resolvePublishedAreaSnapshotMock.mockImplementation(async () => null)
    divisionAreaLookups = []
  })

  test('accepts the configured domains and C&SD area alternatives', () => {
    for (const query of [
      { domain: 'geographic', include: 'areas:hkgov-censtatd' },
      { domain: 'geographic', include: 'areas:hkgov-censtatd-landclipped' },
      {
        domain: 'geographic',
        include: 'areas:hkgov-censtatd-landclipped@2021',
      },
      { domain: 'hkgov-censtatd-hma', include: 'areas:hkgov-censtatd-hma' },
      { domain: 'hkgov-landsd' },
    ]) {
      expect(DivisionsListQuerySchema.safeParse(query).success).toBe(true)
    }

    expect(DivisionsListQuerySchema.safeParse({ domain: 'overture' }).success).toBe(
      false,
    )
    expect(
      DivisionsListQuerySchema.safeParse({
        domain: 'geographic',
        include: 'areas:hkgov-censtatd:2021',
      }).success,
    ).toBe(false)
  })

  test('keeps current division identities while selecting an explicit area cohort', async () => {
    resolvePublishedAreaSnapshotMock.mockImplementation(async () => ({
      id: 'snapshot-censtatd-2021-areas',
    }))

    const result = await listDivisions({
      currentDb: {} as never,
      historyDbsByBinding,
      metaDb: {} as never,
      requestUrl:
        'http://localhost/divisions/v0.1?include=areas:hkgov-censtatd-landclipped@2021&transform=simplified',
      requestedVersionPath: 'divisions/v0.1',
      requestedApiVersion: '0.1',
      resolvedApiVersion: 'api-divisions-v0.1',
      query: {
        include: 'areas:hkgov-censtatd-landclipped@2021',
        transform: 'simplified',
      },
      dependencies: divisionServiceDependencies,
    })

    expect(result.status).toBe(200)
    expect(resolvePublishedAreaSnapshotMock).toHaveBeenLastCalledWith(
      expect.anything(),
      'divisionArea',
      'hk',
      '2021',
      { variant: 'hkgov-censtatd-landclipped:simplified' },
    )
    expect(divisionAreaLookups).toContainEqual({
      snapshotId: 'snapshot-censtatd-2021-areas',
      divisionIds: ['division-a-kung-ngam'],
      variant: 'hkgov-censtatd-landclipped:simplified',
    })
  })

  test('rejects a registered but unavailable provider area variant', async () => {
    const result = await listDivisions({
      currentDb: {} as never,
      historyDbsByBinding,
      metaDb: {} as never,
      requestUrl: 'http://localhost/divisions/v0.1?include=areas:hkgov-pland-new-town',
      requestedVersionPath: 'divisions/v0.1',
      requestedApiVersion: '0.1',
      resolvedApiVersion: 'api-divisions-v0.1',
      query: { include: 'areas:hkgov-pland-new-town' },
      dependencies: divisionServiceDependencies,
    })

    expect(result).toEqual({
      status: 409,
      body: {
        httpStatus: 409,
        error: 'variant_unavailable',
        message:
          'The requested areas:hkgov-pland-new-town variant is not available in the active division release set.',
      },
    })
  })

  test('listDivisions shapes division attributes by profile', async () => {
    const profiles = ['compact', 'default', 'map', 'full'] as const

    for (const profile of profiles) {
      const result = await listDivisions({
        currentDb: {} as never,
        historyDbsByBinding,
        metaDb: {} as never,
        requestUrl: `http://localhost/divisions/v0.1?profile=${profile}`,
        requestedVersionPath: 'divisions/v0.1',
        requestedApiVersion: '0.1',
        resolvedApiVersion: 'api-divisions-v0.1',
        query: {
          profile,
        },
        dependencies: divisionServiceDependencies,
      })

      expect(result.status).toBe(200)

      if (result.status !== 200) {
        continue
      }

      const permalinkValue = result.body.links.permalink
      if (!permalinkValue) throw new Error('Expected a fully qualified permalink.')
      const permalink = new URL(permalinkValue)
      expect(permalink.pathname).toBe('/divisions/v0.1')
      expect(Object.fromEntries(permalink.searchParams)).toMatchObject({
        catalogRevision: activeSnapshot.apiCatalogRevision,
        cohort: activeSnapshot.cohortKey,
        domain: activeSnapshot.domainCode,
        include: 'none',
        knownAt: activeSnapshot.catalogPublishedAt,
        profile,
        releaseSet: activeSnapshot.apiReleaseSet,
      })

      const resource = result.body.data[0]

      expect(resource).toBeDefined()

      if (!resource) {
        continue
      }

      expect(resource.attributes.level).toBe(3)
      expect(resource.attributes.class).toBe('locality')
      expect('divisionType' in resource.attributes).toBe(false)
      expect('parent' in resource.relationships).toBe(false)
      expect(resource.attributes.hierarchies.full[0]?.map(entry => entry.id)).toEqual([
        'division-hk-sar',
        'division-east',
      ])

      if (profile === 'compact') {
        expect(resource.attributes).toEqual({
          level: 3,
          class: 'locality',
          category: 'locality',
          hierarchies,
          i18n: {
            en: {
              name: 'A Kung Ngam',
            },
            'zh-hant': {
              name: '阿公岩',
            },
          },
        })
      }

      if (profile === 'default') {
        expect(resource.attributes).toMatchObject({
          level: 3,
          class: 'locality',
          category: 'locality',
          hierarchies,
          wikidataId: 'Q123456',
          createdAt: '2026-06-17T00:00:00.000Z',
          updatedAt: '2026-06-18T00:00:00.000Z',
        })
        expect(resource.attributes.geometry).toBeUndefined()
        expect(resource.attributes.cartography).toBeUndefined()
        expect(resource.attributes.snapshotId).toBeUndefined()
      }

      if (profile === 'map') {
        expect(resource.attributes).toMatchObject({
          level: 3,
          class: 'locality',
          category: 'locality',
          hierarchies,
          wikidataId: 'Q123456',
          createdAt: '2026-06-17T00:00:00.000Z',
          updatedAt: '2026-06-18T00:00:00.000Z',
          geometry: {
            type: 'Point',
            coordinates: [114.2262, 22.2788],
          },
          bbox: [114.22, 22.27, 114.23, 22.28],
          cartography: {
            kind: 'label-center',
          },
        })
        expect(resource.attributes.snapshotId).toBeUndefined()
        expect(resource.attributes.identifiers).toBeUndefined()
      }

      if (profile === 'full') {
        expect(resource.attributes).toEqual({
          level: 3,
          class: 'locality',
          category: 'locality',
          hierarchies,
          snapshotId: activeSnapshot.snapshotId,
          geometry: {
            type: 'Point',
            coordinates: [114.2262, 22.2788],
          },
          bbox: [114.22, 22.27, 114.23, 22.28],
          identifiers: null,
          cartography: {
            kind: 'label-center',
          },
          wikidataId: 'Q123456',
          createdAt: '2026-06-17T00:00:00.000Z',
          updatedAt: '2026-06-18T00:00:00.000Z',
          sources: {
            overture: [
              {
                property: '/properties/id',
                dataset: 'overture',
                record_id: 'ovt-division-a-kung-ngam',
              },
            ],
          },
          i18n: {
            en: {
              name: 'A Kung Ngam',
              nameVariant: ['A Kung Ngam'],
              nameAlts: ['A Kung-Ngam'],
              nameRules: [{ value: 'A Kung-Ngam', variant: 'alternate' }],
            },
            'zh-hant': {
              name: '阿公岩',
              nameVariant: ['阿公岩', '阿公岩 A Kung Ngam'],
              nameAlts: ['阿公岩 A Kung Ngam'],
              nameRules: [{ value: '阿公岩 A Kung Ngam', variant: 'alternate' }],
            },
          },
        })
      }
    }
  })

  test('returns unavailable geometry when a division record is not a supported shape', async () => {
    listRecords = [
      {
        ...baseRecord,
        division: {
          ...baseRecord.division,
          geometry: {
            type: 'LineString',
            coordinates: [
              [114.2, 22.2],
              [114.3, 22.3],
            ],
          },
        },
      },
    ]

    const result = await listDivisions({
      currentDb: {} as never,
      historyDbsByBinding,
      metaDb: {} as never,
      requestUrl: 'http://localhost/divisions/v0.1?profile=map',
      requestedVersionPath: 'divisions/v0.1',
      requestedApiVersion: '0.1',
      resolvedApiVersion: 'api-divisions-v0.1',
      query: { profile: 'map' },
      dependencies: divisionServiceDependencies,
    })

    expect(result).toMatchObject({
      status: 200,
      body: { data: [{ attributes: { geometry: null } }] },
    })
  })

  test('includes composition enrichment division snapshots in the Geographic lookup', async () => {
    resolveApiReleaseSetSnapshotsForRequestMock.mockImplementation(async () => ({
      ...resolvedReleaseSet,
      snapshots: [
        ...resolvedReleaseSet.snapshots,
        {
          snapshotResourceType: 'division' as const,
          snapshotId: 'snapshot-censtatd-area',
          role: 'enrichment' as const,
          variant: 'hkgov-censtatd-area',
        },
      ],
    }))

    const result = await listDivisions({
      currentDb: {} as never,
      historyDbsByBinding,
      metaDb: {} as never,
      requestUrl: 'http://localhost/divisions/v0.1?domain=geographic',
      requestedVersionPath: 'divisions/v0.1',
      requestedApiVersion: '0.1',
      resolvedApiVersion: 'api-divisions-v0.1',
      query: { domain: 'geographic' },
      dependencies: divisionServiceDependencies,
    })

    expect(result.status).toBe(200)
    expect(result.status).toBe(200)
  })

  test('combined list includes retain hierarchy resources', async () => {
    listRecords = [baseRecord, ...includedDivisionRecords]
    resolveApiReleaseSetSnapshotsForRequestMock.mockImplementation(async () => ({
      ...resolvedReleaseSet,
      snapshots: [
        ...resolvedReleaseSet.snapshots,
        {
          snapshotResourceType: 'divisionArea' as const,
          snapshotId: 'snapshot-overture-area',
          role: 'primary' as const,
          variant: 'overture',
        },
      ],
    }))
    const result = await listDivisions({
      currentDb: {} as never,
      historyDbsByBinding,
      metaDb: {} as never,
      requestUrl:
        'http://localhost/divisions/v0.1?include=hierarchy,areas:overture&filter[class]=locality',
      requestedVersionPath: 'divisions/v0.1',
      requestedApiVersion: '0.1',
      resolvedApiVersion: 'api-divisions-v0.1',
      query: {
        include: 'hierarchy,areas:overture',
        'filter[class]': 'locality',
      },
      dependencies: divisionServiceDependencies,
    })

    expect(result.status).toBe(200)
    if (result.status !== 200) return
    expect(result.body.included?.map(resource => resource.id)).toEqual([
      'division-hk-sar',
      'division-east',
    ])
  })

  test('combined detail includes derive hierarchy from canonical hierarchy', async () => {
    listRecords = [baseRecord, ...includedDivisionRecords]
    resolveApiReleaseSetSnapshotsForRequestMock.mockImplementation(async () => ({
      ...resolvedReleaseSet,
      snapshots: [
        ...resolvedReleaseSet.snapshots,
        {
          snapshotResourceType: 'divisionArea' as const,
          snapshotId: 'snapshot-overture-area',
          role: 'primary' as const,
          variant: 'overture',
        },
      ],
    }))
    const result = await getDivisionDetail({
      currentDb: {} as never,
      historyDbsByBinding,
      metaDb: {} as never,
      requestUrl:
        'http://localhost/divisions/v0.1/division-a-kung-ngam?include=hierarchy,areas:overture&profile=full',
      requestedVersionPath: 'divisions/v0.1',
      requestedApiVersion: '0.1',
      resolvedApiVersion: 'api-divisions-v0.1',
      id: 'division-a-kung-ngam',
      query: {
        include: 'hierarchy,areas:overture',
        profile: 'full',
      },
      dependencies: divisionServiceDependencies,
    })

    expect(result.status).toBe(200)

    if (result.status !== 200) {
      return
    }

    expect(result.body.data.attributes.hierarchies).toEqual(hierarchies)
    expect(result.body.included?.map(resource => resource.id)).toEqual([
      'division-hk-sar',
      'division-east',
    ])
  })
})

function publicationRequest(dependencies: Partial<DivisionServiceDependencies>) {
  return {
    currentDb: {} as never,
    historyDbsByBinding,
    metaDb: {} as never,
    requestUrl: 'http://localhost/divisions/v0.1',
    requestedVersionPath: 'divisions/v0.1' as const,
    requestedApiVersion: '0.1' as const,
    resolvedApiVersion: 'api-divisions-v0.1' as const,
    query: {},
    dependencies: { ...divisionServiceDependencies, ...dependencies },
  }
}

test('latest Division selections return readiness responses for absent or pending receipts', async () => {
  const replay = mock(async () => {
    throw new Error('Must not replay an unready latest selection')
  })
  const args = publicationRequest({
    getPublicationReadiness: async () => null,
    resolveSnapshotReplayPlan: replay,
    resolveApiReleaseSetSnapshotsForRequest: async () => resolvedReleaseSet as never,
  })
  expect((await listDivisions(args)).status).toBe(503)
  expect((await getDivisionDetail({ ...args, id: 'missing' })).status).toBe(503)
  expect(
    (
      await listDivisions({
        ...args,
        query: { releaseSet: activeSnapshot.apiReleaseSet },
      })
    ).status,
  ).toBe(503)
  expect(replay).not.toHaveBeenCalled()
})

test('ready empty Division snapshots return empty collections and absent details', async () => {
  const args = publicationRequest({
    resolveApiReleaseSetSnapshotsForRequest: async () => resolvedReleaseSet as never,
    listDivisionRecordsCurrent: async () => [],
    countDivisionsCurrent: async () => 0,
    listDivisionRecordsCurrentByIds: async () => [],
  })
  const list = await listDivisions(args)
  expect(list.status).toBe(200)
  if (list.status === 200) {
    expect(list.body.data).toEqual([])
    expect(list.body.meta.page.total).toBe(0)
  }
  expect((await getDivisionDetail({ ...args, id: 'missing' })).status).toBe(404)
})

test('Division responses are discarded when publication changes between component reads', async () => {
  let token = 'first'
  const args = publicationRequest({
    resolveApiReleaseSetSnapshotsForRequest: async () => resolvedReleaseSet as never,
    getPublicationReadiness: async () => token,
    listDivisionRecordsCurrent: async () => [baseRecord],
    countDivisionsCurrent: async () => {
      token = 'replacement'
      return 1
    },
  })
  expect((await listDivisions(args)).status).toBe(503)
  token = 'first'
  expect(
    (
      await getDivisionDetail({
        ...args,
        id: 'missing',
        dependencies: {
          ...args.dependencies,
          listDivisionRecordsCurrentByIds: async () => {
            token = 'replacement'
            return []
          },
        },
      })
    ).status,
  ).toBe(503)
})

test('an explicitly older Division release continues to replay immutable history', async () => {
  const replay = mock(async () => [baseRecord])
  const args = publicationRequest({
    getPublicationReadiness: async () => null,
    resolveApiReleaseSetSnapshotsForRequest: async (_db, _family, selectors) =>
      ({
        ...resolvedReleaseSet,
        releaseSet: {
          ...resolvedReleaseSet.releaseSet,
          code: selectors?.releaseSet ? 'older' : 'latest',
        },
      }) as never,
    listReplayedDivisionRecords: replay,
  })
  expect(
    (await listDivisions({ ...args, query: { releaseSet: 'older' } })).status,
  ).toBe(200)
  expect(replay).toHaveBeenCalledTimes(1)
})
