import { describe, expect, test } from 'bun:test'

import {
  getStatisticDetail,
  getStatisticsGeographies,
  listStatistics,
} from './statistics'

const statistic = {
  id: 'statistic-population-2021',
  datasetCode: 'ds-hk-hkgov-censtatd-division-statistic-population-households-district',
  sourceReleaseId: 'release-statistics-2021',
  sourceFeatureRef:
    'hkgov-censtatd/ds-hk-hkgov-censtatd-division-statistic-population-households-district/2021/District:1',
  divisionId: 'division-central-western',
  referencePeriodCode: '2021',
  referencePeriodStart: null,
  referencePeriodEnd: null,
  referencePeriodEndYear: '2021',
  referencePeriodGranularity: 'year',
  geography: { kind: 'district', code: '11', class: 'A' },
  dimensions: { sex: 'all' },
  values: {
    totalPopulation: '235953',
  },
  createdAt: '2026-08-20T00:00:00.000Z',
  updatedAt: '2026-08-20T00:00:00.000Z',
} as const

const majorHousingEstateStatistic = {
  ...statistic,
  id: 'statistic-major-housing-estate-population-2021',
  datasetCode: 'ds-hk-hkgov-censtatd-division-statistic-major-housing-estates',
  sourceFeatureRef:
    'hkgov-censtatd/ds-hk-hkgov-censtatd-division-statistic-major-housing-estates/2021/HousingEstate:1',
  divisionId: null,
  geography: { kind: 'housing-estate', code: 'estate-1' },
  dimensions: { 'housing-estate': 'estate-1', sex: 'all' },
} as const

const newTownStatistic = {
  ...statistic,
  id: 'statistic-new-town-population-2021',
  datasetCode: 'ds-hk-hkgov-censtatd-division-statistic-new-towns',
  sourceFeatureRef:
    'hkgov-censtatd/ds-hk-hkgov-censtatd-division-statistic-new-towns/2021/NewTown:1',
  divisionId: 'division-new-town-shatin',
  geography: { kind: 'new-town', code: 'NT-1' },
  dimensions: { 'new-town': 'NT-1', sex: 'all' },
} as const

function releaseSelection(type: string, domainCode = 'geographic') {
  if (type === 'divisionStatistic') {
    return {
      releaseSet: {
        code: 'data-hk-stats-2021',
        apiCatalogRevision: 'catalog-hk-stats-v0.1-2026-08-20-r0',
        catalogPublishedAt: '2026-08-20T00:00:00.000Z',
        cohortKey: '2021',
        domainCode: 'default',
        effectiveFrom: '2026-08-20T00:00:00.000Z',
        schemaVersion: 'sv-statistics-v1',
        rulesetVersion: 'rs-division-statistic-merge-v1',
      },
      snapshots: [
        {
          snapshotResourceType: 'divisionStatistic',
          snapshotId: 'snapshot-statistics-2021',
          role: 'primary',
          variant: statistic.datasetCode,
        },
      ],
    }
  }
  return {
    releaseSet: {
      code: 'data-hk-divisions-2025-09-24.0',
      apiCatalogRevision: 'catalog-hk-divisions-v0.1-2026-08-14-r0',
      catalogPublishedAt: '2026-08-14T00:00:00.000Z',
      cohortKey: '2025-09-24.0',
      domainCode,
      effectiveFrom: '2025-09-24T00:00:00.000Z',
      schemaVersion: 'sv-division-v1',
      rulesetVersion: 'rs-division-merge-v1',
    },
    snapshots: [
      {
        snapshotResourceType: 'division',
        snapshotId:
          domainCode === 'hkgov-pland-new-town'
            ? 'snapshot-divisions-new-town'
            : 'snapshot-divisions',
        role: 'primary',
        variant: 'overture',
      },
      {
        snapshotResourceType: 'divisionArea',
        snapshotId:
          domainCode === 'hkgov-pland-new-town'
            ? 'snapshot-areas-new-town'
            : 'snapshot-areas-censtatd-2021',
        role: 'geometry',
        variant:
          domainCode === 'hkgov-pland-new-town'
            ? 'hkgov-pland-new-town'
            : 'hkgov-censtatd:2021',
      },
    ],
  }
}

function dependencies() {
  return {
    resolveApiReleaseSetSnapshotsForRequest: async (
      _db: unknown,
      type: string,
      options?: { domainCode?: string },
    ) => releaseSelection(type, options?.domainCode),
    listSnapshotSourceReleases: async () => [
      {
        datasetCode: statistic.datasetCode,
        snapshotId: 'snapshot-statistics-2021',
        sourceReleaseId: statistic.sourceReleaseId,
      },
    ],
    listStatisticRecords: async () => [statistic],
    listStatisticRecordsForGeography: async () => [statistic],
    countStatisticRecords: async () => 1,
    getStatisticRecord: async () => statistic,
    listStatisticFieldDefinitions: async () => [
      {
        datasetCode: statistic.datasetCode,
        fieldName: 'totalPopulation',
        sourceField: 'T_POP',
        sourceNullOption: null,
        statisticKind: 'count' as const,
        aggregation: 'total' as const,
        aggregationPercentile: null,
        comparability: {
          affectedReferencePeriods: ['2011', '2016'],
          reason: 'economic-activity-status-classification-changed' as const,
          status: 'caution' as const,
        },
        denominatorFieldName: null,
        valueKind: 'numeric',
        unitCode: 'person',
        i18n: {
          en: {
            name: 'Total population',
            description: null,
            isTranslationVerified: true,
          },
        },
      },
    ],
    listDivisionRecordsCurrentByIds: async () => [
      {
        division: {
          snapshotId: 'snapshot-divisions',
          id: statistic.divisionId,
          divisionCode: 'CW',
          level: 2,
          type: 'district',
          geometry: null,
          bbox: null,
          sourceKeys: null,
          subtype: null,
          class: null,
          overtureFeatureVersion: null,
          overtureAdminLevel: null,
          overtureHierarchies: null,
          wikidata: null,
          hierarchy: [],
          cartography: null,
          sources: null,
          createdAt: '2026-08-14T00:00:00.000Z',
          updatedAt: '2026-08-14T00:00:00.000Z',
        },
        i18n: { en: { name: 'Central and Western District' } },
      },
    ],
    listDivisionAreasCurrentByDivisionIds: async () => [
      {
        id: 'area-central-western-2021',
        variant: 'hkgov-censtatd:2021',
        divisionId: statistic.divisionId,
        bbox: [114.12, 22.26, 114.17, 22.3],
        geometry: { type: 'Polygon', coordinates: [] },
        sourceKeys: null,
        sources: null,
        type: 'district',
        isLand: true,
        isTerritorial: false,
      },
    ],
  }
}

describe('Statistics service', () => {
  test('returns statistical values and separately requested division and area resources', async () => {
    const result = await listStatistics({
      currentDb: {} as never,
      historyDbs: [],
      metaDb: {} as never,
      requestUrl:
        'https://api.saanseoi.hk/v0.1/stats?include=divisions,areas&page[limit]=10',
      requestedVersionPath: 'v0.1',
      requestedApiVersion: '0.1',
      resolvedApiVersion: 'api-stats-v0.1',
      query: {
        include: 'divisions,areas',
        'page[limit]': 10,
      },
      dependencies: dependencies() as never,
    })

    expect(result.status).toBe(200)
    if (result.status !== 200) return
    expect(result.body.data[0]).toMatchObject({
      type: 'statistics',
      id: statistic.id,
      attributes: {
        datasetCode: statistic.datasetCode,
        referencePeriod: {
          code: '2021',
          endYear: '2021',
          granularity: 'year',
        },
        values: {
          totalPopulation: '235953',
        },
        comparability: {
          totalPopulation: {
            affectedReferencePeriods: ['2011', '2016'],
            reason: 'economic-activity-status-classification-changed',
            status: 'caution',
          },
        },
      },
      relationships: {
        division: {
          data: { type: 'divisions', id: statistic.divisionId },
        },
      },
    })
    expect(result.body.included?.map(resource => resource.type)).toEqual([
      'divisions',
      'division-areas',
    ])
    expect(result.body.links.permalink).toContain(
      'include=areas%3Ahkgov-censtatd%3A2021%2Cdivisions',
    )
  })

  test('resolves New Town statistics through the Planning Department domain', async () => {
    const mocks = dependencies()
    const requestedDomains: string[] = []
    mocks.resolveApiReleaseSetSnapshotsForRequest = async (
      _db: unknown,
      type: string,
      options?: { domainCode?: string },
    ) => {
      if (type === 'division') requestedDomains.push(options?.domainCode ?? '')
      return releaseSelection(type, options?.domainCode)
    }
    mocks.listSnapshotSourceReleases = (async () => [
      {
        datasetCode: newTownStatistic.datasetCode,
        snapshotId: 'snapshot-statistics-2021',
        sourceReleaseId: newTownStatistic.sourceReleaseId,
      },
    ]) as never
    mocks.listStatisticRecords = (async () => [newTownStatistic]) as never
    mocks.countStatisticRecords = async () => 1

    const result = await listStatistics({
      currentDb: {} as never,
      historyDbs: [],
      metaDb: {} as never,
      requestUrl:
        'https://api.saanseoi.hk/v0.1/stats?include=divisions,areas&page[limit]=10',
      requestedVersionPath: 'v0.1',
      requestedApiVersion: '0.1',
      resolvedApiVersion: 'api-stats-v0.1',
      query: {
        include: 'divisions,areas',
        'page[limit]': 10,
      },
      dependencies: mocks as never,
    })

    expect(result.status).toBe(200)
    if (result.status !== 200) return
    expect(requestedDomains).toEqual(['hkgov-pland-new-town'])
    expect(result.body.included?.map(resource => resource.type)).toEqual([
      'divisions',
      'division-areas',
    ])
    expect(result.body.links.permalink).toContain(
      'include=areas%3Ahkgov-pland-new-town%2Cdivisions',
    )
  })

  test('returns a stable not-found response inside the selected release set', async () => {
    const mocks = dependencies()
    mocks.getStatisticRecord = async () => null as never
    const result = await getStatisticDetail({
      currentDb: {} as never,
      historyDbs: [],
      metaDb: {} as never,
      requestUrl: 'https://api.saanseoi.hk/v0.1/stats/missing',
      requestedVersionPath: 'v0.1',
      requestedApiVersion: '0.1',
      resolvedApiVersion: 'api-stats-v0.1',
      id: 'missing',
      query: {},
      dependencies: mocks as never,
    })

    expect(result).toEqual({
      status: 404,
      body: {
        httpStatus: 404,
        error: 'not_found',
        message: 'No statistic found for missing.',
      },
    })
  })

  test('always scopes record lookup to the selected exact period', async () => {
    let listLookup: { cohortKey?: string } | undefined
    const mocks = {
      ...dependencies(),
      listStatisticRecords: async (_dbs: unknown, lookup: { cohortKey?: string }) => {
        listLookup = lookup
        return []
      },
      countStatisticRecords: async () => 0,
    }

    const result = await listStatistics({
      currentDb: {} as never,
      historyDbs: [],
      metaDb: {} as never,
      requestUrl: 'https://api.saanseoi.hk/v0.1/stats?filter[referencePeriod]=2020',
      requestedVersionPath: 'v0.1',
      requestedApiVersion: '0.1',
      resolvedApiVersion: 'api-stats-v0.1',
      query: { 'filter[referencePeriod]': '2020' },
      dependencies: mocks as never,
    })

    expect(result.status).toBe(200)
    expect(listLookup?.cohortKey).toBe('2021')
  })

  test('resolves a field without a dataset when geography selects one candidate', async () => {
    const mocks = dependencies()
    mocks.listStatisticRecordsForGeography = async () =>
      [statistic, majorHousingEstateStatistic] as never

    const ambiguous = await getStatisticsGeographies({
      currentDb: {} as never,
      historyDbs: [],
      metaDb: {} as never,
      query: {
        'filter[field]': 'totalPopulation',
        'filter[referencePeriod]': '2021',
      },
      dependencies: mocks as never,
    })
    expect(ambiguous).toMatchObject({
      status: 409,
      body: {
        error: 'ambiguous_measure',
        candidates: [
          {
            datasetCode: majorHousingEstateStatistic.datasetCode,
            geography: { kind: 'majorHousingEstate' },
          },
          { datasetCode: statistic.datasetCode, geography: { kind: 'division' } },
        ],
      },
    })

    const resolved = await getStatisticsGeographies({
      currentDb: {} as never,
      historyDbs: [],
      metaDb: {} as never,
      query: {
        'filter[field]': 'totalPopulation',
        'filter[referencePeriod]': '2021',
        'filter[geographyKind]': 'division',
      },
      dependencies: mocks as never,
    })
    expect(resolved).toMatchObject({
      status: 200,
      body: {
        meta: { measure: { datasetCode: statistic.datasetCode } },
        values: { CW: '235953' },
      },
    })
  })
})
