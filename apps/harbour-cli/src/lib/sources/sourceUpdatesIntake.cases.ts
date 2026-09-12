import { expect, test } from 'bun:test'
import {
  buildHkgovAlsIngestCommand,
  buildHkgovCenstatdDistrictStatisticArchiveIngestCommand,
  buildHkgovCenstatdStatisticsArchiveIngestCommand,
  buildHkgovHadDistrictArchiveIngestCommand,
  buildHkgovHydStreetArchiveIngestCommand,
  buildHkgovLandsdPlaceNameArchiveIngestCommand,
  buildHkgovLandsdRoadCentrelineArchiveIngestCommand,
  buildHkgovPlandArchiveIngestCommand,
  formatHkgovAlsReviewCommand,
} from './sourceUpdates.ts'

test('passes requested C&SD geography materialisation to the native intake', () => {
  expect(
    buildHkgovCenstatdStatisticsArchiveIngestCommand({
      datasetCode:
        'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups',
      deferStatsReleaseSet: true,
      includeGeography: true,
      inputFile: '/tmp/hma-source.zip',
      releaseNotesUrl: 'https://publisher.example/hma',
      sourceArchiveKey: 'by-source/hk/hkgov-csdi/hma-source.zip',
      sourceArchiveSha256: 'a'.repeat(64),
      sourceVersion: '2021',
      target: { environment: 'dev', remote: false },
      yes: true,
    }),
  ).toEqual(expect.arrayContaining(['--include-geography']))
})

test('hands the exact mirrored LandsD archives to their native importers', () => {
  const common = {
    inputFile: '/tmp/landsd-source.zip',
    releaseNotesUrl: 'https://publisher.example/landsd',
    sourceArchiveKey: 'by-source/hk/landsd/source.zip',
    sourceArchiveSha256: 'f'.repeat(64),
    sourceVersion: '2026-Q2',
    target: { environment: 'preview' as const, remote: true },
  }

  for (const command of [
    buildHkgovLandsdPlaceNameArchiveIngestCommand(common),
    buildHkgovLandsdRoadCentrelineArchiveIngestCommand(common),
  ]) {
    expect(command).toEqual(
      expect.arrayContaining([
        '/tmp/landsd-source.zip',
        '--target',
        'preview',
        '--source-archive-key',
        'by-source/hk/landsd/source.zip',
        '--source-archive-sha256',
        'f'.repeat(64),
      ]),
    )
  }
})

test('hands the mirrored HyD archive and caller target to native street intake', () => {
  const command = buildHkgovHydStreetArchiveIngestCommand({
    datasetCode: 'ds-hk-hkgov-hyd-pedestrian-street',
    inputFile: '/tmp/td-source.zip',
    releaseNotesUrl: 'https://publisher.example/release',
    sourceArchiveKey: 'by-source/hk/hyd/source.zip',
    sourceArchiveSha256: 'a'.repeat(64),
    sourceVersion: '2025-Q1',
    target: { environment: 'production', remote: true },
  })

  expect(command).toEqual(
    expect.arrayContaining([
      'hkgov-hyd:street',
      '/tmp/td-source.zip',
      '--target',
      'production',
      '--dataset-code',
      'ds-hk-hkgov-hyd-pedestrian-street',
      '--source-archive-key',
      'by-source/hk/hyd/source.zip',
      '--source-archive-sha256',
      'a'.repeat(64),
    ]),
  )
})

test('passes --yes to DPO ingestion only when the parent update is non-interactive', () => {
  const common = {
    sourceRoot: '/tmp/als',
    version: '2026-07-26.0',
  }

  expect(
    buildHkgovAlsIngestCommand({
      ...common,
      target: { environment: 'preview', remote: true },
    }),
  ).toContain('preview')
  expect(
    buildHkgovAlsIngestCommand({
      ...common,
      target: { environment: 'production', remote: true },
    }),
  ).toContain('production')
  const local = buildHkgovAlsIngestCommand({
    ...common,
    target: { environment: 'dev', remote: false },
  })
  expect(local).toContain('local')
  expect(local).not.toContain('--yes')
  expect(
    buildHkgovAlsIngestCommand({
      ...common,
      skipPrompts: true,
      target: { environment: 'dev', remote: false },
    }),
  ).toContain('--yes')
})

test('prints the exact interactive DPO review command in the updater summary', () => {
  expect(
    formatHkgovAlsReviewCommand({
      target: { environment: 'dev', remote: false },
      version: '2026-08-19.0',
    }),
  ).toBe(
    'bun run dataops -- hkgov-dpo:ingest data/hkgov/dpo/ALS --target local --cohort-key 2026-08-19.0 --from-source-version 2026-08-19.0',
  )
})

test('starts PlanD native archive intake with the mirrored source package', () => {
  expect(
    buildHkgovPlandArchiveIngestCommand({
      inputFile: '/tmp/mirrored-source.zip',
      kind: 'pu',
      releaseNotesUrl: 'https://portal.csdi.gov.hk/example',
      sourceArchiveKey: 'by-source/hk/hkgov-csdi/pland/source.zip',
      sourceArchiveSha256: 'a'.repeat(64),
      sourceVersion: '2021',
      target: { environment: 'production', remote: true },
    }),
  ).toEqual(
    expect.arrayContaining([
      'hkgov-pland:ingest',
      '--kind',
      'pu',
      '/tmp/mirrored-source.zip',
      '--target',
      'production',
      '--source-version',
      '2021',
      '--source-archive-key',
      'by-source/hk/hkgov-csdi/pland/source.zip',
      '--source-archive-sha256',
      'a'.repeat(64),
    ]),
  )
})

test('starts C&SD density intake from the prepared archive and retains its identity', () => {
  const command = buildHkgovCenstatdDistrictStatisticArchiveIngestCommand({
    deferStatsReleaseSet: true,
    inputFile: '/tmp/prepared-density.zip',
    releaseNotesUrl: 'https://portal.csdi.gov.hk/density',
    sourceArchiveKey: 'by-source/hk/hkgov-csdi/density/archive-source.zip',
    sourceArchiveSha256: 'b'.repeat(64),
    sourceVersion: '2024',
    target: { environment: 'preview', remote: true },
    yes: true,
  })

  expect(command).toEqual(
    expect.arrayContaining([
      'hkgov-censtatd:district-land-area-population-density',
      '/tmp/prepared-density.zip',
      '--target',
      'preview',
      '--source-archive-key',
      'by-source/hk/hkgov-csdi/density/archive-source.zip',
      '--source-archive-sha256',
      'b'.repeat(64),
      '--defer-stats-release-set',
      '--yes',
    ]),
  )
})

test('starts C&SD subdivided-units statistics intake from the prepared native archive', () => {
  expect(
    buildHkgovCenstatdStatisticsArchiveIngestCommand({
      datasetCode: 'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district',
      deferStatsReleaseSet: true,
      inputFile: '/tmp/prepared-districts.zip',
      releaseNotesUrl: 'https://portal.csdi.gov.hk/districts',
      sourceArchiveKey: 'by-source/hk/hkgov-csdi/districts/source.zip',
      sourceArchiveSha256: 'd'.repeat(64),
      sourceVersion: '2021',
      target: { environment: 'production', remote: true },
      yes: true,
    }),
  ).toEqual(
    expect.arrayContaining([
      'hkgov-censtatd:statistics',
      '/tmp/prepared-districts.zip',
      '--target',
      'production',
      '--dataset-code',
      'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district',
      '--source-archive-key',
      'by-source/hk/hkgov-csdi/districts/source.zip',
      '--defer-stats-release-set',
      '--yes',
    ]),
  )
})

test('starts each remaining C&SD statistic from the prepared archive', () => {
  expect(
    buildHkgovCenstatdStatisticsArchiveIngestCommand({
      datasetCode: 'ds-hk-hkgov-censtatd-division-statistic-new-towns',
      deferStatsReleaseSet: true,
      inputFile: '/tmp/new-towns.zip',
      releaseNotesUrl: 'https://portal.csdi.gov.hk/new-towns',
      sourceArchiveKey: 'by-source/hk/hkgov-csdi/new-towns/source.zip',
      sourceArchiveSha256: 'e'.repeat(64),
      sourceVersion: '2021',
      target: { environment: 'preview', remote: true },
      yes: true,
    }),
  ).toEqual(
    expect.arrayContaining([
      'hkgov-censtatd:statistics',
      '/tmp/new-towns.zip',
      '--target',
      'preview',
      '--dataset-code',
      'ds-hk-hkgov-censtatd-division-statistic-new-towns',
      '--defer-stats-release-set',
      '--yes',
    ]),
  )
})

test('starts HAD district intake from the mirrored native FGDB archive', () => {
  expect(
    buildHkgovHadDistrictArchiveIngestCommand({
      inputFile: '/tmp/had-districts.zip',
      releaseNotesUrl: 'https://portal.csdi.gov.hk/had-districts',
      sourceArchiveKey: 'by-source/hk/hkgov-csdi/had/source.zip',
      sourceArchiveSha256: 'f'.repeat(64),
      sourceVersion: '2022',
      target: { environment: 'production', remote: true },
    }),
  ).toEqual(
    expect.arrayContaining([
      'hkgov-had:district-area',
      '/tmp/had-districts.zip',
      '--target',
      'production',
      '--source-archive-key',
      'by-source/hk/hkgov-csdi/had/source.zip',
    ]),
  )
})

test('preserves a production caller target for C&SD density publication', () => {
  expect(
    buildHkgovCenstatdDistrictStatisticArchiveIngestCommand({
      inputFile: '/tmp/prepared-density.zip',
      releaseNotesUrl: 'https://portal.csdi.gov.hk/density',
      sourceArchiveKey: 'by-source/hk/hkgov-csdi/density/archive-source.zip',
      sourceArchiveSha256: 'c'.repeat(64),
      sourceVersion: '2022',
      target: { environment: 'production', remote: true },
      yes: false,
    }),
  ).toContain('production')
})
