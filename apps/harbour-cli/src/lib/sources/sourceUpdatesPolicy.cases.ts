import { expect, test } from 'bun:test'
import {
  datasetCorrectionSuffixSources,
  datasetName,
  getDueUpdatePhases,
  isNewUpdate,
  isUpdateCheckDue,
  loadDatasetFixtures,
  recordUpdateState,
  recordUpdatePhaseCheck,
  recordUpdateArchiveMirror,
  recordUpdateDatabaseImport,
  resolveDatasetVersion,
  shouldCheckDataset,
  type DatasetUpdate,
  type DatasetFixture,
  type UpdateStateEntry,
} from './sourceUpdates.ts'

test('loads every dataset fixture', async () => {
  const fixtures = await loadDatasetFixtures()

  expect(fixtures.length).toBeGreaterThan(0)
  expect(new Set(fixtures.map(fixture => fixture.code)).size).toBe(fixtures.length)
  expect(fixtures.map(fixture => fixture.code)).toEqual(
    [...fixtures.map(fixture => fixture.code)].sort(),
  )
})

test('selects the English dataset name', () => {
  expect(
    datasetName({
      code: 'ds-example',
      publisherCode: 'example',
      regionCode: 'hk',
      theme: 'places',
      type: 'place',
      versionPolicy: { scheme: 'upstream', correctionSuffixSource: 'none' },
      i18n: [
        { locale: 'zh-hant', name: '例子' },
        { locale: 'en', name: 'Example' },
      ],
    }),
  ).toBe('Example')
})

test('detects an upstream version not present in local state', () => {
  const update = {
    dataset: {
      code: 'ds-example',
      publisherCode: 'example',
      regionCode: 'hk',
      theme: 'places',
      type: 'place',
      versionPolicy: { scheme: 'upstream', correctionSuffixSource: 'upstream' },
    },
    status: 'new',
    version: '2026-07-23.0',
    versionKey: '2026-07-23.0',
  } satisfies DatasetUpdate

  expect(isNewUpdate(update)).toBe(true)
  expect(isNewUpdate(update, { versionKey: '2026-07-23.0' })).toBe(false)
})

test('throttles update checks according to the fixture policy', () => {
  const dataset = {
    code: 'ds-example',
    publisherCode: 'example',
    regionCode: 'hk',
    theme: 'places',
    type: 'place',
    versionPolicy: { scheme: 'upstream', correctionSuffixSource: 'none' },
    updatePolicy: { allowUpdates: true, checkFrequency: 'monthly' as const },
  } satisfies DatasetFixture
  const lastChecked = '2026-07-01T00:00:00.000Z'

  expect(
    isUpdateCheckDue(dataset, { lastChecked }, false, Date.parse('2026-07-15')),
  ).toBe(false)
  expect(
    isUpdateCheckDue(dataset, { lastChecked }, false, Date.parse('2026-08-01')),
  ).toBe(true)
  expect(
    isUpdateCheckDue(dataset, { lastChecked }, true, Date.parse('2026-07-02')),
  ).toBe(true)
})

test('schedules each update phase from its own policy state', () => {
  const dataset = {
    code: 'ds-example',
    publisherCode: 'example',
    regionCode: 'hk',
    theme: 'places',
    type: 'place',
    versionPolicy: { scheme: 'upstream', correctionSuffixSource: 'none' },
    releasePolicy: {
      series: 'rolling',
      schedule: 'regular',
      revisionScope: 'latest',
      checks: {
        newReleases: {
          trigger: 'after-latest-release-age',
          ageDays: 25,
          frequency: 'daily',
        },
        revisions: { trigger: 'periodic', frequency: 'weekly' },
        archives: { trigger: 'on-discovery', discoveries: ['new-release'] },
      },
      archives: { availability: 'limited' },
    },
  } satisfies DatasetFixture
  const state: UpdateStateEntry = {
    phaseChecks: {
      'new-releases': {
        lastChecked: '2026-07-20T00:00:00.000Z',
        releaseLastRevisedAt: '2026-07-01.0',
      },
      revisions: { lastChecked: '2026-07-20T00:00:00.000Z' },
    },
  }

  expect(
    getDueUpdatePhases(dataset, state, {
      now: Date.parse('2026-07-26T00:00:00.000Z'),
    }),
  ).toEqual(['new-releases'])

  expect(
    getDueUpdatePhases(dataset, state, {
      force: true,
      now: Date.parse('2026-07-26T00:00:00.000Z'),
    }),
  ).toEqual(['new-releases', 'revisions', 'archives'])

  const mutableState: Record<string, UpdateStateEntry> = {}
  recordUpdatePhaseCheck(mutableState, dataset.code, 'archives', {
    checkedAt: '2026-07-26T00:00:00.000Z',
    sourceCursor: ['2026-07-26.0'],
  })
  expect(mutableState[dataset.code]?.phaseChecks?.archives).toEqual({
    lastChecked: '2026-07-26T00:00:00.000Z',
    releaseLastRevisedAt: undefined,
    sourceCursor: ['2026-07-26.0'],
  })
})

test('runs initial-only phases only before the target has a release', () => {
  const dataset = {
    code: 'ds-example',
    publisherCode: 'example',
    regionCode: 'hk',
    theme: 'places',
    type: 'place',
    versionPolicy: { scheme: 'upstream', correctionSuffixSource: 'none' },
    releasePolicy: {
      series: 'cohort',
      schedule: 'regular',
      revisionScope: 'all',
      checks: {
        newReleases: { trigger: 'initial-only' },
        revisions: { trigger: 'never' },
        archives: { trigger: 'never' },
      },
      archives: { availability: 'full' },
    },
  } satisfies DatasetFixture

  expect(getDueUpdatePhases(dataset, undefined, { hasTargetRelease: false })).toEqual([
    'new-releases',
  ])
  expect(getDueUpdatePhases(dataset, undefined, { hasTargetRelease: true })).toEqual([])
})

test('honours an explicit update freeze', () => {
  const dataset = {
    code: 'ds-example',
    publisherCode: 'example',
    regionCode: 'hk',
    theme: 'places',
    type: 'place',
    versionPolicy: { scheme: 'upstream', correctionSuffixSource: 'none' },
    updatePolicy: { allowUpdates: false },
  } as const

  expect(shouldCheckDataset(dataset)).toBe(false)
})

test('checks a newly configured release even when another source was checked', () => {
  const dataset = {
    code: 'ds-example',
    publisherCode: 'example',
    regionCode: 'hk',
    theme: 'places',
    type: 'place',
    versionPolicy: { scheme: 'upstream', correctionSuffixSource: 'none' },
    updatePolicy: { allowUpdates: true, checkFrequency: 'monthly' as const },
    releasePolicy: {
      series: 'cohort',
      schedule: 'regular',
      revisionScope: 'all',
      checks: {
        newReleases: { trigger: 'periodic', frequency: 'monthly' },
        revisions: { trigger: 'never' },
        archives: { trigger: 'never' },
      },
      archives: { availability: 'none' },
    },
    releases: [
      { sourceVersion: '2021', sourceUrl: 'https://example.test/2021' },
      { sourceVersion: '2026', sourceUrl: 'https://example.test/2026' },
    ],
  } satisfies DatasetFixture
  const state: UpdateStateEntry = {
    sourceChecks: {
      '2021': { lastChecked: '2026-07-20T00:00:00.000Z' },
    },
  }

  expect(shouldCheckDataset(dataset, state)).toBe(true)
})

test('records check state independently for each source release', () => {
  const state: Record<string, UpdateStateEntry> = {}
  recordUpdateState(state, 'ds-example', {
    dataset: {
      code: 'ds-example',
      publisherCode: 'example',
      regionCode: 'hk',
      theme: 'places',
      type: 'place',
      versionPolicy: { scheme: 'upstream', correctionSuffixSource: 'none' },
    } satisfies DatasetFixture,
    status: 'current',
    sourceKey: '2021',
    version: '2021.0',
    versionKey: '2021.0',
    checkedAt: '2026-07-23T00:00:00.000Z',
  })

  expect(state['ds-example']?.sourceChecks?.['2021']).toEqual({
    version: '2021.0',
    versionKey: '2021.0',
    lastChecked: '2026-07-23T00:00:00.000Z',
    releaseLastRevisedAt: undefined,
    metadataLastRevisedAt: undefined,
    sourceCursor: undefined,
  })
})

test('keeps archive custody separate from a completed database import', () => {
  const state: Record<string, UpdateStateEntry> = {}
  const update = {
    checkedAt: '2026-07-28T00:00:00.000Z',
    dataset: {
      code: 'ds-example',
      publisherCode: 'example',
      regionCode: 'hk',
      theme: 'streets',
      type: 'street',
      versionPolicy: { scheme: 'quarterly', correctionSuffixSource: 'generated' },
    } satisfies DatasetFixture,
    mirroredArchive: {
      contentHash: 'a'.repeat(64),
      mirroredAt: '2026-07-28T00:01:00.000Z',
      objectKey: 'by-source/hk/example/source.zip',
    },
    sourceKey: '2026-Q2',
    status: 'new' as const,
    version: '2026-Q2.0',
    versionKey: 'sha256:abc',
  }

  recordUpdateState(state, 'ds-example', update)
  recordUpdateArchiveMirror(state, 'ds-example', update)

  expect(state['ds-example']?.archiveMirrors?.['2026-Q2']).toEqual({
    contentHash: 'a'.repeat(64),
    mirroredAt: '2026-07-28T00:01:00.000Z',
    objectKey: 'by-source/hk/example/source.zip',
    version: '2026-Q2.0',
    versionKey: 'sha256:abc',
  })
  expect(state['ds-example']?.databaseImports).toBeUndefined()

  recordUpdateDatabaseImport(state, 'ds-example', update)
  expect(state['ds-example']?.databaseImports?.['2026-Q2']).toMatchObject({
    version: '2026-Q2.0',
    versionKey: 'sha256:abc',
  })
})

test('registers the requested CSDI datasets with their API families', async () => {
  const fixtures = await loadDatasetFixtures(
    new Set([
      'ds-hk-hkgov-hyd-street',
      'ds-hk-hkgov-hyd-sensitive-street',
      'ds-hk-hkgov-hyd-strategic-street',
      'ds-hk-hkgov-hyd-pedestrian-street',
      'ds-hk-hkgov-landsd-division',
    ]),
  )

  expect(fixtures).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: 'ds-hk-hkgov-hyd-street',
        sourceLayer: 'SNP',
        theme: 'streets',
        resourceTypes: ['street'],
      }),
      expect.objectContaining({
        code: 'ds-hk-hkgov-landsd-division',
        sourceLayer: 'GEO_PLACE_NAME',
        theme: 'divisions',
        resourceTypes: ['division'],
      }),
      expect.objectContaining({
        code: 'ds-hk-hkgov-hyd-sensitive-street',
        sourceLayer: 'sensitive',
        theme: 'streets',
        resourceTypes: ['street'],
      }),
      expect.objectContaining({
        code: 'ds-hk-hkgov-hyd-strategic-street',
        sourceLayer: 'STRATEGIC',
        theme: 'streets',
        resourceTypes: ['street'],
      }),
      expect.objectContaining({
        code: 'ds-hk-hkgov-hyd-pedestrian-street',
        sourceLayers: [
          'Full_Time_Pedestrian_Street',
          'Hawker_Street',
          'Market_Street',
          'Part_time_Pedestrian_Street',
          'Traffic_Calming_Street',
        ],
        theme: 'streets',
        resourceTypes: ['street'],
      }),
    ]),
  )
})

test('registers a version policy for every dataset fixture', async () => {
  const fixtures = await loadDatasetFixtures()

  expect(
    fixtures.every(
      fixture =>
        fixture.versionPolicy &&
        [
          'initial-release-date',
          'reference-date',
          'release-date',
          'quarterly',
          'upstream',
          'reference-year',
        ].includes(fixture.versionPolicy.scheme) &&
        datasetCorrectionSuffixSources.includes(
          fixture.versionPolicy.correctionSuffixSource,
        ),
    ),
  ).toBe(true)
})

test('registers a three-phase release policy for every dataset fixture', async () => {
  const fixtures = await loadDatasetFixtures()

  expect(
    fixtures.every(
      fixture =>
        fixture.releasePolicy?.checks.newReleases &&
        fixture.releasePolicy.checks.revisions &&
        fixture.releasePolicy.checks.archives,
    ),
  ).toBe(true)
})

test('records DPO as an irregular rolling series with daily archive checks', async () => {
  const [dataset] = await loadDatasetFixtures(new Set(['ds-hk-hkgov-dpo-address']))

  expect(dataset?.releasePolicy).toEqual({
    archives: {
      availability: 'limited',
      entryUrl: 'https://api.data.gov.hk/v1/historical-archive/list-file-versions',
      operation: 'data-gov-historical-file-versions',
    },
    checks: {
      archives: { trigger: 'periodic', frequency: 'daily' },
      newReleases: { trigger: 'periodic', frequency: 'daily' },
      revisions: { trigger: 'never' },
    },
    revisionScope: 'none',
    schedule: 'irregular',
    series: 'rolling',
  })
})

test('records Overture as a regular rolling series with conditional checks', async () => {
  const datasets = await loadDatasetFixtures(
    new Set([
      'ds-hk-overture-division',
      'ds-hk-overture-division-area',
      'ds-hk-overture-division-boundary',
      'ds-hk-overture-place',
    ]),
  )

  expect(datasets).toHaveLength(4)
  expect(
    datasets.every(
      dataset =>
        dataset.releasePolicy?.series === 'rolling' &&
        dataset.releasePolicy.schedule === 'regular' &&
        dataset.releasePolicy.revisionScope === 'latest' &&
        dataset.releasePolicy.checks.newReleases.trigger ===
          'after-latest-release-age' &&
        dataset.releasePolicy.checks.newReleases.ageDays === 25 &&
        dataset.releasePolicy.checks.newReleases.frequency === 'daily' &&
        dataset.releasePolicy.checks.revisions.trigger === 'periodic' &&
        dataset.releasePolicy.checks.revisions.frequency === 'daily' &&
        dataset.releasePolicy.checks.archives.trigger === 'on-discovery' &&
        dataset.releasePolicy.checks.archives.discoveries.includes('new-release') &&
        dataset.releasePolicy.archives.availability === 'limited' &&
        dataset.releasePolicy.archives.operation === 'overture-release-catalog',
    ),
  ).toBe(true)
})

test('records DPang as a manually maintained rolling series', async () => {
  const [dataset] = await loadDatasetFixtures(new Set(['ds-hk-dpang-street']))

  expect(dataset?.releasePolicy).toEqual({
    archives: { availability: 'full' },
    checks: {
      archives: { trigger: 'never' },
      newReleases: { trigger: 'never' },
      revisions: { trigger: 'never' },
    },
    revisionScope: 'latest',
    schedule: 'irregular',
    series: 'rolling',
  })
})

test('records Planning Department divisions as revisable regular cohorts', async () => {
  const datasets = await loadDatasetFixtures(
    new Set(['ds-hk-hkgov-pland-division-new-town', 'ds-hk-hkgov-pland-division-pu']),
  )

  expect(datasets).toHaveLength(2)
  expect(
    datasets.every(
      dataset =>
        dataset.releasePolicy?.series === 'cohort' &&
        dataset.releasePolicy.schedule === 'regular' &&
        dataset.releasePolicy.revisionScope === 'all' &&
        dataset.releasePolicy.checks.newReleases.trigger === 'periodic' &&
        dataset.releasePolicy.checks.newReleases.frequency === 'monthly' &&
        dataset.releasePolicy.checks.revisions.trigger === 'periodic' &&
        dataset.releasePolicy.checks.revisions.frequency === 'weekly' &&
        dataset.releasePolicy.checks.archives.trigger === 'periodic' &&
        dataset.releasePolicy.checks.archives.frequency === 'quarterly' &&
        dataset.releasePolicy.archives.availability === 'full' &&
        dataset.releasePolicy.archives.operation === 'csdi-archived-dataset',
    ),
  ).toBe(true)
})

test('records C&SD districts as initial-only cohorts with revision archive scans', async () => {
  const [dataset] = await loadDatasetFixtures(
    new Set(['ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district']),
  )

  expect(dataset?.releasePolicy).toEqual({
    archives: {
      availability: 'full',
      entryUrl:
        'https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=censtatd_rcd_1635933617052_68946',
      operation: 'csdi-archived-dataset',
    },
    checks: {
      archives: {
        discoveries: ['revision'],
        includeInitialDownload: true,
        trigger: 'on-discovery',
      },
      newReleases: { trigger: 'initial-only' },
      revisions: { frequency: 'weekly', trigger: 'periodic' },
    },
    revisionScope: 'all',
    schedule: 'regular',
    series: 'cohort',
  })
})

test('records C&SD statistics as initial-only cohorts with revision archive scans', async () => {
  const datasets = await loadDatasetFixtures()
  const statistics = datasets.filter(
    dataset => dataset.publisherCode === 'hkgov-censtatd' && dataset.theme === 'stats',
  )

  expect(statistics).toHaveLength(8)
  expect(
    statistics.every(
      dataset =>
        dataset.releasePolicy?.series === 'cohort' &&
        dataset.releasePolicy.schedule === 'regular' &&
        dataset.releasePolicy.revisionScope === 'all' &&
        dataset.releasePolicy.checks.newReleases.trigger === 'initial-only' &&
        dataset.releasePolicy.checks.revisions.trigger === 'periodic' &&
        dataset.releasePolicy.checks.revisions.frequency === 'weekly' &&
        dataset.releasePolicy.checks.archives.trigger === 'on-discovery' &&
        dataset.releasePolicy.checks.archives.includeInitialDownload === true &&
        dataset.releasePolicy.archives.availability === 'full' &&
        dataset.releasePolicy.archives.operation === 'csdi-archived-dataset',
    ),
  ).toBe(true)
})

test('declares reference periods carried by the historic Population and Household delivery', async () => {
  const [dataset] = await loadDatasetFixtures(
    new Set(['ds-hk-hkgov-censtatd-division-statistic-population-households-district']),
  )

  expect(
    dataset?.releases?.find(release => release.sourceVersion === '2026-Q2')
      ?.referencePeriods,
  ).toEqual({
    geometryStatus: 'fallback',
    materialiseAreaCompanions: true,
    sourceField: 'year',
  })
})

test('records HAD districts as a revisable irregular rolling series', async () => {
  const [dataset] = await loadDatasetFixtures(
    new Set(['ds-hk-hkgov-had-division-area-district']),
  )

  expect(dataset?.releasePolicy).toEqual({
    archives: {
      availability: 'full',
      entryUrl:
        'https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=had_rcd_1634523272907_75218',
      operation: 'csdi-archived-dataset',
    },
    checks: {
      archives: { discoveries: ['new-release'], trigger: 'on-discovery' },
      newReleases: { frequency: 'monthly', trigger: 'periodic' },
      revisions: { frequency: 'weekly', trigger: 'periodic' },
    },
    revisionScope: 'latest',
    schedule: 'irregular',
    series: 'rolling',
  })
})

test('records HyD and TD streets as quarterly rolling series', async () => {
  const datasets = await loadDatasetFixtures()
  const streets = datasets.filter(
    dataset =>
      dataset.theme === 'streets' &&
      [
        'ds-hk-hkgov-hyd-street',
        'ds-hk-hkgov-hyd-strategic-street',
        'ds-hk-hkgov-hyd-sensitive-street',
        'ds-hk-hkgov-hyd-pedestrian-street',
      ].includes(dataset.code),
  )

  expect(streets).toHaveLength(4)
  expect(
    streets.every(
      dataset =>
        dataset.releasePolicy?.series === 'rolling' &&
        dataset.releasePolicy.schedule === 'regular' &&
        dataset.releasePolicy.revisionScope === 'latest' &&
        dataset.releasePolicy.checks.newReleases.trigger ===
          'after-latest-release-age' &&
        dataset.releasePolicy.checks.newReleases.ageDays === 90 &&
        dataset.releasePolicy.checks.newReleases.frequency === 'daily' &&
        dataset.releasePolicy.checks.revisions.trigger === 'periodic' &&
        dataset.releasePolicy.checks.revisions.frequency === 'weekly' &&
        dataset.releasePolicy.checks.archives.trigger === 'on-discovery' &&
        dataset.releasePolicy.checks.archives.discoveries.includes('new-release') &&
        dataset.releasePolicy.checks.archives.includeInitialDownload === true &&
        dataset.releasePolicy.archives.availability === 'full' &&
        dataset.releasePolicy.archives.operation === 'csdi-archived-dataset',
    ),
  ).toBe(true)
})

test('records LandsD divisions as initial-only cohorts with revision archive scans', async () => {
  const [dataset] = await loadDatasetFixtures(new Set(['ds-hk-hkgov-landsd-division']))

  expect(dataset?.releasePolicy).toEqual({
    archives: {
      availability: 'full',
      entryUrl:
        'https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=landsd_rcd_1648571595120_89752',
      operation: 'csdi-archived-dataset',
    },
    checks: {
      archives: {
        discoveries: ['revision'],
        includeInitialDownload: true,
        trigger: 'on-discovery',
      },
      newReleases: { trigger: 'initial-only' },
      revisions: { frequency: 'weekly', trigger: 'periodic' },
    },
    revisionScope: 'all',
    schedule: 'regular',
    series: 'cohort',
  })
})

test('records the two LandsD street series separately', async () => {
  const datasets = await loadDatasetFixtures(
    new Set(['ds-hk-hkgov-landsd-road-centreline', 'ds-hk-hkgov-landsd-street']),
  )
  const centreline = datasets.find(
    dataset => dataset.code === 'ds-hk-hkgov-landsd-road-centreline',
  )
  const notices = datasets.find(dataset => dataset.code === 'ds-hk-hkgov-landsd-street')

  expect(centreline?.releasePolicy).toMatchObject({
    archives: { availability: 'full', operation: 'csdi-archived-dataset' },
    checks: {
      archives: {
        discoveries: ['new-release'],
        includeInitialDownload: true,
        trigger: 'on-discovery',
      },
      newReleases: {
        ageDays: 28,
        frequency: 'daily',
        trigger: 'after-latest-release-age',
      },
      revisions: { frequency: 'weekly', trigger: 'periodic' },
    },
    revisionScope: 'latest',
    schedule: 'regular',
    series: 'rolling',
  })
  expect(notices?.releasePolicy).toEqual({
    archives: { availability: 'none' },
    checks: {
      archives: { trigger: 'never' },
      newReleases: { frequency: 'weekly', trigger: 'periodic' },
      revisions: { trigger: 'never' },
    },
    revisionScope: 'latest',
    schedule: 'irregular',
    series: 'rolling',
  })
})

test('keeps the initial release date when a later delivery is a correction', () => {
  const dataset = {
    code: 'ds-example',
    publisherCode: 'example',
    regionCode: 'hk',
    theme: 'places',
    type: 'place',
    versionPolicy: {
      scheme: 'initial-release-date',
      correctionSuffixSource: 'generated',
    },
  } as const

  expect(
    resolveDatasetVersion(
      dataset,
      '2026-07-23',
      {
        versionKey: '2026-07-22.0',
        releaseLastRevisedAt: '2026-07-22',
      },
      '2026-07-23',
    ),
  ).toBe('2026-07-22.1')
})

test('uses a new release date as the base for release-date policies', () => {
  const dataset = {
    code: 'ds-example',
    publisherCode: 'example',
    regionCode: 'hk',
    theme: 'places',
    type: 'place',
    versionPolicy: { scheme: 'release-date', correctionSuffixSource: 'generated' },
  } as const

  expect(
    resolveDatasetVersion(
      dataset,
      '2026-07-23',
      {
        versionKey: '2026-07-22.0',
        releaseLastRevisedAt: '2026-07-22',
      },
      '2026-07-23',
    ),
  ).toBe('2026-07-23.0')
})

test('preserves an upstream correction suffix instead of generating one', () => {
  const dataset = {
    code: 'ds-example',
    publisherCode: 'example',
    regionCode: 'hk',
    theme: 'places',
    type: 'place',
    versionPolicy: {
      scheme: 'upstream',
      correctionSuffixSource: 'upstream',
    },
  } as const

  expect(
    resolveDatasetVersion(
      dataset,
      '2026-07-23.2',
      {
        versionKey: '2026-07-23.0',
        releaseLastRevisedAt: '2026-07-23.0',
      },
      '2026-07-23.2',
    ),
  ).toBe('2026-07-23.2')
})
