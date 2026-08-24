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

const hierarchyWithNames = [
  {
    division_id: 'division-country-cn',
    subtype: 'country',
    name: '中国',
  },
  {
    division_id: 'division-hk-sar',
    subtype: 'dependency',
    name: 'Hong Kong SAR',
  },
  {
    division_id: 'division-east',
    subtype: 'region',
    name: '東區 Eastern District',
  },
  {
    division_id: 'division-a-kung-ngam',
    subtype: 'locality',
    name: '阿公岩 A Kung Ngam',
  },
]

const normalisedHierarchy = [
  {
    division_id: 'division-hk-sar',
    i18n: {
      en: {
        name: 'Hong Kong SAR',
      },
      'zh-hant': {
        name: '香港特別行政區',
      },
    },
    level: 0,
    type: 'sar',
  },
  {
    division_id: 'division-east',
    i18n: {
      en: {
        name: 'Eastern District',
      },
      'zh-hant': {
        name: '東區',
      },
    },
    level: 2,
    type: 'district',
  },
]

const baseRecord: DivisionRecord = {
  division: {
    snapshotId: activeSnapshot.snapshotId,
    id: 'division-a-kung-ngam',
    level: 3,
    type: 'locality',
    geometry: {
      type: 'Point',
      coordinates: [114.2262, 22.2788],
    },
    bbox: [114.22, 22.27, 114.23, 22.28],
    sourceKeys: {
      overture: {
        subtype: 'locality',
        class: 'locality',
        version: 7,
        hierarchies: hierarchyWithNames,
      },
    },
    wikidata: 'Q123456',
    hierarchy: normalisedHierarchy,
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
      type: 'country',
      geometry: null,
      bbox: null,
      sourceKeys: {
        overture: {
          subtype: 'country',
          class: 'country',
          admin_level: 1,
        },
      },
      wikidata: null,
      hierarchy: [{ ids: ['division-country-cn'] }],
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
      type: 'sar',
      geometry: null,
      bbox: null,
      sourceKeys: {
        overture: {
          subtype: 'dependency',
          class: 'dependency',
          admin_level: 1,
        },
      },
      wikidata: null,
      hierarchy: [{ ids: ['division-country-cn', 'division-hk-sar'] }],
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
      type: 'district',
      geometry: null,
      bbox: null,
      sourceKeys: {
        overture: {
          subtype: 'region',
          class: 'region',
          admin_level: 2,
        },
      },
      wikidata: null,
      hierarchy: [{ ids: ['division-country-cn', 'division-hk-sar', 'division-east'] }],
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

const divisionServiceDependencies: Partial<DivisionServiceDependencies> = {
  resolveApiReleaseSetSnapshotsForRequest:
    resolveApiReleaseSetSnapshotsForRequestMock as unknown as DivisionServiceDependencies['resolveApiReleaseSetSnapshotsForRequest'],
  resolveSnapshotReplayPlan:
    resolveSnapshotReplayPlanMock as unknown as DivisionServiceDependencies['resolveSnapshotReplayPlan'],
  resolveSnapshotVersionState:
    resolveSnapshotVersionStateMock as unknown as DivisionServiceDependencies['resolveSnapshotVersionState'],
  listReplayedDivisionRecords:
    listReplayedDivisionRecordsMock as unknown as DivisionServiceDependencies['listReplayedDivisionRecords'],
  listDivisionAreasCurrentByDivisionIds: mock(async () => []),
  listDivisionBoundariesCurrentByDivisionIds: mock(async () => []),
}

describe('division services', () => {
  beforeEach(() => {
    listRecords = [baseRecord]
    resolveApiReleaseSetSnapshotsForRequestMock.mockImplementation(
      async () => resolvedReleaseSet,
    )
    listReplayedDivisionRecordsMock.mockImplementation(async () => listRecords)
  })

  test('accepts the configured domains and C&SD area alternatives', () => {
    for (const query of [
      { domain: 'geographic', include: 'areas:hkgov-censtatd-area' },
      { domain: 'hkgov-censtatd-hma', include: 'areas:hkgov-censtatd-hma' },
      { domain: 'hkgov-landsd' },
    ]) {
      expect(DivisionsListQuerySchema.safeParse(query).success).toBe(true)
    }

    expect(DivisionsListQuerySchema.safeParse({ domain: 'overture' }).success).toBe(
      false,
    )
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
      expect(resource.attributes.type).toBe('locality')
      expect('divisionType' in resource.attributes).toBe(false)
      expect('parent' in resource.relationships).toBe(false)
      expect(
        resource.relationships.hierarchy.data.map(hierarchy => hierarchy.id),
      ).toEqual(['division-hk-sar', 'division-east'])

      if (profile === 'compact') {
        expect(resource.attributes).toEqual({
          level: 3,
          type: 'locality',
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
          type: 'locality',
          wikidata: 'Q123456',
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
          type: 'locality',
          wikidata: 'Q123456',
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
        expect(resource.attributes.sourceKeys).toBeUndefined()
      }

      if (profile === 'full') {
        expect(resource.attributes).toEqual({
          level: 3,
          type: 'locality',
          snapshotId: activeSnapshot.snapshotId,
          geometry: {
            type: 'Point',
            coordinates: [114.2262, 22.2788],
          },
          bbox: [114.22, 22.27, 114.23, 22.28],
          cartography: {
            kind: 'label-center',
          },
          wikidata: 'Q123456',
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
          sourceKeys: {
            overture: {
              subtype: 'locality',
              class: 'locality',
              version: 7,
              hierarchies: hierarchyWithNames,
            },
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
    expect(resolveSnapshotReplayPlanMock).toHaveBeenLastCalledWith(
      expect.anything(),
      activeSnapshot.snapshotId,
    )
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
        'http://localhost/divisions/v0.1?include=hierarchy,areas:overture&filter[divisionType]=locality',
      requestedVersionPath: 'divisions/v0.1',
      requestedApiVersion: '0.1',
      resolvedApiVersion: 'api-divisions-v0.1',
      query: {
        include: 'hierarchy,areas:overture',
        'filter[divisionType]': 'locality',
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

    expect(result.body.data.relationships.hierarchy.data).toEqual([
      {
        type: 'divisions',
        id: 'division-hk-sar',
        meta: {
          name: 'Hong Kong SAR',
          subType: 'sar',
        },
      },
      {
        type: 'divisions',
        id: 'division-east',
        meta: {
          name: 'Eastern District',
          subType: 'district',
        },
      },
    ])
    expect(result.body.included?.map(resource => resource.id)).toEqual([
      'division-hk-sar',
      'division-east',
    ])
    const hongKongSar = result.body.included?.find(
      resource => resource.type === 'divisions' && resource.id === 'division-hk-sar',
    ) as typeof result.body.data | undefined
    expect(hongKongSar?.attributes.sourceKeys).toMatchObject({
      overture: {
        subtype: 'dependency',
        class: 'dependency',
        admin_level: 1,
      },
    })
    const easternDistrict = result.body.included?.find(
      resource => resource.type === 'divisions' && resource.id === 'division-east',
    ) as typeof result.body.data | undefined
    expect(easternDistrict?.attributes.sourceKeys).toMatchObject({
      overture: {
        subtype: 'region',
        class: 'region',
        admin_level: 2,
      },
    })
  })
})
