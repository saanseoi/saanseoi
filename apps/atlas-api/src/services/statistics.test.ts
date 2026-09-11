import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'

import { getStatisticDetail, listStatistics } from './statistics'
import { getStatisticsGeographies } from './statisticsAggregates'
import { statisticGeometryDependencies } from './statisticsGeometry'

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
  geography: {
    kind: 'district',
    code: '11',
    class: 'A',
    areaCompanion: {
      variant: 'hkgov-censtatd',
      domainCode: 'geographic',
      cohortKey: '2021',
    },
  },
  values: {
    totalPopulation: '235953',
  },
  fieldSources: {
    totalPopulation: {
      sourceReleaseId: 'release-statistics-2021',
      sourceFeatureRef: 'population/2021/district/11',
    },
  },
  fieldDefinitionHashes: { totalPopulation: 'population-field-version' },
  versionHash: 'population-pack-version',
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
} as const

const newTownStatistic = {
  ...statistic,
  id: 'statistic-new-town-population-2021',
  datasetCode: 'ds-hk-hkgov-censtatd-division-statistic-new-towns',
  sourceFeatureRef:
    'hkgov-censtatd/ds-hk-hkgov-censtatd-division-statistic-new-towns/2021/NewTown:1',
  divisionId: 'division-new-town-shatin',
  geography: {
    kind: 'new-town',
    code: 'NT-1',
    areaCompanion: {
      variant: 'hkgov-pland-new-town',
      domainCode: 'hkgov-pland-new-town',
      cohortKey: '2021',
    },
  },
} as const

function releaseSelection(type: string, domainCode = 'geographic') {
  if (type === 'divisionStatistic') {
    return {
      releaseSet: {
        code: 'data-hk-stats-2021',
        apiCatalogRevision: 'catalog-hk-stats-v0.1-2026-08-20-r0',
        catalogPublishedAt: '2026-08-20T00:00:00.000Z',
        cohortKey: '2021',
        domainCode: 'government',
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
    isStatisticPublicationReady: async () => true,
    resolveSnapshotReplayPlan: async (_db: unknown, snapshotId: string) => [
      { snapshotId, parentSnapshotId: null, shards: [] },
    ],
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
    resolvePublishedSnapshotForResourceTypeRegionCohortKey: async (
      _db: unknown,
      _resourceType: string,
      _regionCode: string,
      cohortKey: string,
      options?: { variant?: string },
    ) => ({
      id:
        cohortKey === '2024'
          ? 'snapshot-areas-censtatd-2024'
          : options?.variant === 'hkgov-pland-new-town'
            ? 'snapshot-areas-new-town'
            : 'snapshot-areas-censtatd-2021',
    }),
    listStatisticRecords: async () => [statistic],
    listStatisticRecordsForGeography: async () => [statistic],
    countStatisticRecords: async () => 1,
    getStatisticRecord: async () => statistic,
    listStatisticFieldDefinitions: async () => [
      {
        datasetCode: statistic.datasetCode,
        fieldName: 'totalPopulation',
        versionHash: 'population-field-version',
        measureCode: 'totalPopulation',
        sourceField: 'T_POP',
        dimensions: { sex: 'all' },
        sourceNullOption: null,
        statisticKind: 'count' as const,
        aggregation: 'total' as const,
        aggregationPercentile: null,
        periodicity: null,
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
    getPublicationReadiness: async () => 'ready',
    listDivisionAreasCurrentByDivisionIds: async () => [
      {
        id: 'area-central-western-2021',
        variant: 'hkgov-censtatd:2021',
        divisionId: statistic.divisionId,
        bbox: [114.12, 22.26, 114.17, 22.3],
        geometry: { type: 'Polygon', coordinates: [] },
        sources: null,
        type: 'district',
        isLand: true,
        isTerritorial: false,
      },
    ],
  }
}

function geometryReplayFixture() {
  const current = new Database(':memory:')
  const history = new Database(':memory:')
  const snapshotId = 'snapshot-areas-censtatd-2021'
  const geometry = {
    type: 'Polygon',
    coordinates: [
      [
        [114.12, 22.26],
        [114.17, 22.26],
        [114.12, 22.26],
      ],
    ],
  }
  for (const sqlite of [current, history]) {
    sqlite.exec(`CREATE TABLE divisionAreas (
      snapshotId TEXT, id TEXT, variant TEXT, divisionId TEXT, bbox TEXT,
      geometry TEXT, identifiers TEXT, sources TEXT, type TEXT,
      isLand INTEGER, isTerritorial INTEGER, versionHash TEXT
    )`)
    sqlite
      .query(
        'INSERT INTO divisionAreas VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, 1, 0, ?)',
      )
      .run(
        sqlite === current ? `scope:${snapshotId}` : 'mutable-later-snapshot',
        'area-historical',
        'hkgov-censtatd',
        statistic.divisionId,
        JSON.stringify([114.12, 22.26, 114.17, 22.3]),
        JSON.stringify(geometry),
        'district',
        'historical-geometry-hash',
      )
  }
  history.exec(`CREATE TABLE snapshotVersionChanges (
    snapshotId TEXT, recordType TEXT, recordId TEXT, locale TEXT,
    versionHash TEXT, operation TEXT, sourceReleaseId TEXT
  )`)
  history
    .query('INSERT INTO snapshotVersionChanges VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(
      snapshotId,
      'divisionArea',
      'area-historical',
      '',
      'historical-geometry-hash',
      'upsert',
      'source-2021',
    )
  current.exec(
    `CREATE TABLE divisionAreaPublicationState(scopeId TEXT PRIMARY KEY,snapshotId TEXT UNIQUE,status TEXT,publicationToken TEXT,preparedAt TEXT,updatedAt TEXT)`,
  )
  current
    .query('INSERT INTO divisionAreaPublicationState VALUES (?, ?, ?, ?, ?, ?)')
    .run(
      `scope:${snapshotId}`,
      snapshotId,
      'current',
      'token',
      '2026-01-01',
      '2026-01-01',
    )
  const currentDb = drizzle({ client: current })
  const historyDb = drizzle({ client: history })
  const mocks = {
    ...dependencies(),
    ...statisticGeometryDependencies,
    resolveSnapshotReplayPlan: async (_db: unknown, selectedId: string) => [
      {
        snapshotId: selectedId,
        parentSnapshotId: null,
        shards:
          selectedId === snapshotId
            ? [{ dataShardId: 'history-before', bindingName: 'DB_HISTORY_HK_BEFORE' }]
            : [],
      },
    ],
  }
  return {
    current,
    history,
    geometry,
    mocks,
    args: {
      currentDb: currentDb as never,
      historyDbs: [historyDb] as never,
      historyDbsByBinding: { DB_HISTORY_HK_BEFORE: historyDb } as never,
      metaDb: {} as never,
      requestUrl: 'https://api.saanseoi.hk/stats/v0.1?cohort=2021&include=areas',
      requestedVersionPath: 'stats/v0.1' as const,
      requestedApiVersion: '0.1' as const,
      resolvedApiVersion: 'api-stats-v0.1' as const,
      query: { cohort: '2021', include: 'areas' },
      dependencies: mocks as never,
    },
  }
}

describe('Statistics service', () => {
  test('preserves old-cohort areas on list and detail reads after deleting their current materialisation', async () => {
    const fixture = geometryReplayFixture()
    try {
      const before = await listStatistics(fixture.args)
      fixture.current.exec(
        'DELETE FROM divisionAreas; DELETE FROM divisionAreaPublicationState',
      )
      const after = await listStatistics(fixture.args)
      const detail = await getStatisticDetail({ ...fixture.args, id: statistic.id })
      expect(before.status).toBe(200)
      expect(after.status).toBe(200)
      expect(detail.status).toBe(200)
      if (before.status !== 200 || after.status !== 200 || detail.status !== 200)
        throw new Error('Expected historical Statistics responses.')
      expect(after.body.included).toEqual(before.body.included)
      expect(detail.body.included).toEqual(before.body.included)
      expect(after.body.included).toMatchObject([
        {
          type: 'division-areas',
          id: 'area-historical',
          attributes: { geometry: fixture.geometry },
        },
      ])
    } finally {
      fixture.current.close()
      fixture.history.close()
    }
  })

  test('keeps sparse current geometry empty when requested divisions are absent', async () => {
    const fixture = geometryReplayFixture()
    fixture.current.exec("UPDATE divisionAreas SET divisionId = 'another-division'")
    fixture.mocks.resolveSnapshotReplayPlan = async (_db, snapshotId) => {
      if (snapshotId === 'snapshot-areas-censtatd-2021')
        throw new Error('A materialised sparse snapshot must not replay geometry.')
      return [{ snapshotId, parentSnapshotId: null, shards: [] }]
    }
    try {
      const result = await listStatistics(fixture.args)
      expect(result.status).toBe(200)
      if (result.status !== 200) throw new Error('Expected sparse Statistics response.')
      expect(result.body.included ?? []).toEqual([])
    } finally {
      fixture.current.close()
      fixture.history.close()
    }
  })

  test('does not return missing or mixed data when publication starts during a read', async () => {
    const mocks = dependencies()
    let checks = 0
    mocks.isStatisticPublicationReady = async () => ++checks === 1
    mocks.getStatisticRecord = async () => null as never
    const result = await getStatisticDetail({
      currentDb: {} as never,
      historyDbs: [],
      historyDbsByBinding: {} as never,
      metaDb: {} as never,
      requestUrl: 'https://api.saanseoi.hk/stats/v0.1/missing',
      requestedVersionPath: 'stats/v0.1',
      requestedApiVersion: '0.1',
      resolvedApiVersion: 'api-stats-v0.1',
      id: 'missing',
      query: {},
      dependencies: mocks as never,
    })
    expect(result.status).toBe(503)
    expect(checks).toBe(2)
  })

  test('returns statistical values and separately requested division and area resources', async () => {
    const result = await listStatistics({
      currentDb: {} as never,
      historyDbs: [],
      historyDbsByBinding: {} as never,
      metaDb: {} as never,
      requestUrl:
        'https://api.saanseoi.hk/stats/v0.1?include=divisions,areas&page[limit]=10',
      requestedVersionPath: 'stats/v0.1',
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
      'include=areas%3Ahkgov-censtatd%2Cdivisions',
    )
  })

  test('selects the matching C&SD 2024 district-area variant for 2024 statistics', async () => {
    const densityStatistic = {
      ...statistic,
      id: 'statistic-density-2024',
      datasetCode:
        'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district',
      referencePeriodCode: '2024',
      referencePeriodEndYear: '2024',
      sourceFeatureRef:
        'hkgov-censtatd/ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district/2024/Density:11',
      geography: {
        kind: 'district',
        code: '11',
        class: 'A',
        areaCompanion: {
          variant: 'hkgov-censtatd',
          domainCode: 'geographic',
          cohortKey: '2024',
        },
      },
    } as const
    const mocks = {
      ...dependencies(),
      resolveApiReleaseSetSnapshotsForRequest: async (
        _db: unknown,
        type: string,
        options?: { domainCode?: string },
      ) => {
        if (type === 'divisionStatistic') return releaseSelection(type)
        const selection = releaseSelection(type, options?.domainCode)
        return {
          ...selection,
          snapshots: [
            selection.snapshots[0],
            {
              snapshotResourceType: 'divisionArea',
              snapshotId: 'snapshot-areas-censtatd-2024',
              role: 'geometry',
              variant: 'hkgov-censtatd',
            },
          ],
        }
      },
      listStatisticRecords: async () => [densityStatistic],
      resolvePublishedSnapshotForResourceTypeRegionCohortKey: async () => ({
        id: 'snapshot-areas-censtatd-2024',
      }),
      listDivisionAreasCurrentByDivisionIds: async () => [
        {
          id: 'area-central-western-2024',
          variant: 'hkgov-censtatd',
          divisionId: densityStatistic.divisionId,
          bbox: [114.12, 22.26, 114.17, 22.3],
          geometry: { type: 'Polygon', coordinates: [] },
          sources: null,
          type: 'district',
          isLand: true,
          isTerritorial: false,
        },
      ],
    }

    const result = await listStatistics({
      currentDb: {} as never,
      historyDbs: [],
      historyDbsByBinding: {} as never,
      metaDb: {} as never,
      requestUrl: 'https://api.saanseoi.hk/stats/v0.1?include=areas',
      requestedVersionPath: 'stats/v0.1',
      requestedApiVersion: '0.1',
      resolvedApiVersion: 'api-stats-v0.1',
      query: { include: 'areas' },
      dependencies: mocks as never,
    })

    expect(result.status).toBe(200)
    if (result.status !== 200) throw new Error('Expected Statistics response.')
    expect(result.body.included).toMatchObject([
      { type: 'division-areas', attributes: { variant: 'hkgov-censtatd' } },
    ])
    expect(result.body.links.permalink).toContain('include=areas%3Ahkgov-censtatd')
  })

  test('does not substitute another cohort when an area variant is unavailable', async () => {
    const result = await listStatistics({
      currentDb: {} as never,
      historyDbs: [],
      historyDbsByBinding: {} as never,
      metaDb: {} as never,
      requestUrl:
        'https://api.saanseoi.hk/stats/v0.1?include=areas:hkgov-censtatd-landclipped',
      requestedVersionPath: 'stats/v0.1',
      requestedApiVersion: '0.1',
      resolvedApiVersion: 'api-stats-v0.1',
      query: { include: 'areas:hkgov-censtatd-landclipped' },
      dependencies: {
        ...dependencies(),
        resolvePublishedSnapshotForResourceTypeRegionCohortKey: async () => null,
      } as never,
    })

    expect(result).toEqual({
      status: 409,
      body: {
        httpStatus: 409,
        error: 'variant_cohort_unavailable',
        message:
          'The areas:hkgov-censtatd-landclipped variant is not available for geometry cohort 2021.',
      },
    })
  })

  test.each([undefined, 'fields'])(
    'includes dimensions through used field definitions with include=%s',
    async include => {
      const result = await listStatistics({
        currentDb: {} as never,
        historyDbs: [],
        historyDbsByBinding: {} as never,
        metaDb: {} as never,
        requestUrl: `https://api.saanseoi.hk/stats/v0.1${include ? `?include=${include}` : ''}`,
        requestedVersionPath: 'stats/v0.1',
        requestedApiVersion: '0.1',
        resolvedApiVersion: 'api-stats-v0.1',
        query: { include, locales: 'en,zh-hant' },
        dependencies: dependencies() as never,
      })

      expect(result.status).toBe(200)
      if (result.status !== 200) return
      expect(
        new URL(result.body.links.permalink ?? '').searchParams.get('include'),
      ).toBe('fields')
      expect(result.body.included).toEqual([
        {
          type: 'statistic-fields',
          id: `${statistic.datasetCode}:totalPopulation:population-field-version`,
          attributes: {
            datasetCode: statistic.datasetCode,
            fieldName: 'totalPopulation',
            versionHash: 'population-field-version',
            measureCode: 'totalPopulation',
            sourceField: 'T_POP',
            dimensions: { sex: 'all' },
            sourceNullOption: null,
            statisticKind: 'count',
            aggregation: 'total',
            aggregationPercentile: null,
            periodicity: null,
            comparability: {
              affectedReferencePeriods: ['2011', '2016'],
              reason: 'economic-activity-status-classification-changed',
              status: 'caution',
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
        },
      ])
    },
  )

  test.each([
    [undefined, ['statistic-fields']],
    ['none', []],
    ['divisions', ['divisions']],
    ['fields,divisions', ['divisions', 'statistic-fields']],
  ] as const)(
    'detail resolves include=%s and pins it in its permalink',
    async (include, types) => {
      const result = await getStatisticDetail({
        currentDb: {} as never,
        historyDbs: [],
        historyDbsByBinding: {} as never,
        metaDb: {} as never,
        requestUrl: `https://api.saanseoi.hk/stats/v0.1/${statistic.id}${include ? `?include=${include}` : ''}`,
        requestedVersionPath: 'stats/v0.1',
        requestedApiVersion: '0.1',
        resolvedApiVersion: 'api-stats-v0.1',
        id: statistic.id,
        query: { include },
        dependencies: dependencies() as never,
      })
      expect(result.status).toBe(200)
      if (result.status !== 200) return
      expect(result.body.included?.map(resource => resource.type) ?? []).toEqual([
        ...types,
      ])
      expect(
        new URL(result.body.links.permalink ?? '').searchParams.get('include'),
      ).toBe((include ?? 'fields').split(',').sort().join(','))
    },
  )

  test('shares each exact field definition once across packs while retaining different versions', async () => {
    const mocks = dependencies()
    const [original] = await mocks.listStatisticFieldDefinitions()
    if (!original) throw new Error('Expected the field definition fixture.')
    const revised = {
      ...original,
      versionHash: 'population-field-version-2',
      dimensions: { sex: 'all', residency: 'usual' },
    }
    const revisedRecord = {
      ...statistic,
      id: 'another-geography',
      fieldDefinitionHashes: { totalPopulation: revised.versionHash },
    }
    mocks.listStatisticRecords = async () => [
      statistic,
      revisedRecord as never,
      { ...revisedRecord, id: 'third-geography' } as never,
    ]
    mocks.countStatisticRecords = async () => 3
    mocks.listStatisticFieldDefinitions = async () => [
      revised,
      original,
      revised,
      { ...original, fieldName: 'unusedField' },
    ]
    const result = await listStatistics({
      currentDb: {} as never,
      historyDbs: [],
      historyDbsByBinding: {} as never,
      metaDb: {} as never,
      requestUrl: 'https://api.saanseoi.hk/stats/v0.1',
      requestedVersionPath: 'stats/v0.1',
      requestedApiVersion: '0.1',
      resolvedApiVersion: 'api-stats-v0.1',
      query: {},
      dependencies: mocks as never,
    })
    expect(result.status).toBe(200)
    if (result.status !== 200) return
    expect(result.body.included).toMatchObject([
      {
        id: `${statistic.datasetCode}:totalPopulation:population-field-version`,
        attributes: { dimensions: { sex: 'all' } },
      },
      {
        id: `${statistic.datasetCode}:totalPopulation:population-field-version-2`,
        attributes: { dimensions: { sex: 'all', residency: 'usual' } },
      },
    ])
    expect(result.body.included).toHaveLength(2)
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
      historyDbsByBinding: {} as never,
      metaDb: {} as never,
      requestUrl:
        'https://api.saanseoi.hk/stats/v0.1?include=divisions,areas&page[limit]=10',
      requestedVersionPath: 'stats/v0.1',
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
      historyDbsByBinding: {} as never,
      metaDb: {} as never,
      requestUrl: 'https://api.saanseoi.hk/stats/v0.1/missing',
      requestedVersionPath: 'stats/v0.1',
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
    let selectedCohort: string | undefined
    const mocks = {
      ...dependencies(),
      resolveApiReleaseSetSnapshotsForRequest: async (
        _db: unknown,
        type: string,
        options?: { cohortKey?: string; domainCode?: string },
      ) => {
        if (type === 'divisionStatistic') selectedCohort = options?.cohortKey
        return releaseSelection(type, options?.domainCode)
      },
      listStatisticRecords: async (_dbs: unknown, lookup: { cohortKey?: string }) => {
        listLookup = lookup
        return []
      },
      countStatisticRecords: async () => 0,
    }

    const result = await listStatistics({
      currentDb: {} as never,
      historyDbs: [],
      historyDbsByBinding: {} as never,
      metaDb: {} as never,
      requestUrl: 'https://api.saanseoi.hk/stats/v0.1?filter[referencePeriod]=2020',
      requestedVersionPath: 'stats/v0.1',
      requestedApiVersion: '0.1',
      resolvedApiVersion: 'api-stats-v0.1',
      query: { 'filter[referencePeriod]': '2020' },
      dependencies: mocks as never,
    })

    expect(result.status).toBe(200)
    expect(selectedCohort).toBe('2020')
    expect(listLookup?.cohortKey).toBe('2021')
  })

  test('resolves a field without a dataset when geography selects one candidate', async () => {
    const mocks = dependencies()
    mocks.listStatisticRecordsForGeography = async () =>
      [statistic, majorHousingEstateStatistic] as never
    const fieldDefinitions = await mocks.listStatisticFieldDefinitions()
    mocks.listStatisticFieldDefinitions = async () =>
      [
        ...fieldDefinitions,
        ...fieldDefinitions.map(field => ({
          ...field,
          datasetCode: majorHousingEstateStatistic.datasetCode,
        })),
      ] as never

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

  test('uses persisted C&SD district codes when the current Divisions lookup is unavailable', async () => {
    const mocks = dependencies()
    mocks.listStatisticRecordsForGeography = async () =>
      [{ ...statistic, geography: { kind: 'district', code: 'CW' } }] as never
    mocks.listDivisionRecordsCurrentByIds = async () => []

    const result = await getStatisticsGeographies({
      currentDb: {} as never,
      historyDbs: [],
      metaDb: {} as never,
      query: {
        'filter[dataset]': statistic.datasetCode,
        'filter[field]': 'totalPopulation',
        'filter[referencePeriod]': '2021',
      },
      dependencies: mocks as never,
    })

    expect(result).toMatchObject({
      status: 200,
      body: {
        meta: {
          geography: {
            codeAttribute: 'divisionCode',
            domainCode: 'geographic',
            kind: 'division',
            level: 2,
          },
        },
        values: { CW: '235953' },
      },
    })
  })
})
