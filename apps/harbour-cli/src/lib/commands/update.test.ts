import { expect, test } from 'bun:test'

import {
  datasetLabel,
  formatCheckLine,
  formatDownloadCompleteLine,
  formatDownloadProgressLine,
  formatDatasetCheckLine,
  formatDatasetPromptLabel,
  formatUpdateProgressLine,
  resolveTargetVersion,
  wrapUpdateMessage,
} from './update.ts'

test('formats update rows with the requested publisher/resource/subtype label', () => {
  expect(
    datasetLabel({
      code: 'ds-hk-hkgov-censtatd-division-area-district',
      publisherCode: 'hkgov-censtatd',
      regionCode: 'hk',
      theme: 'divisions',
      resourceTypes: ['divisionArea'],
      versionPolicy: { scheme: 'upstream', correction: false },
    }),
  ).toBe('hkgov-censtatd : divisionArea [::district]')
})

test('formats the high-signal Clack dataset label without version noise', () => {
  expect(
    formatDatasetPromptLabel({
      code: 'ds-hk-hkgov-censtatd-division-area-district',
      publisherCode: 'hkgov-censtatd',
      regionCode: 'hk',
      theme: 'divisions',
      resourceTypes: ['divisionArea'],
      versionPolicy: { scheme: 'upstream', correction: false },
    }),
  ).toBe('CenstatD ∷ DivisionArea ∷ District')
})

test('left-aligns publisher/resource columns and right-aligns versions for a 120-column terminal', () => {
  const line = formatCheckLine(
    {
      code: 'ds-hk-hkgov-censtatd-division-area-district',
      publisherCode: 'hkgov-censtatd',
      regionCode: 'hk',
      theme: 'divisions',
      resourceTypes: ['divisionArea'],
      versionPolicy: { scheme: 'upstream', correction: false },
    },
    'NEW',
    '2026-06-05T03:45:16.749Z',
    '2026-03-05.0',
  )

  expect(line).toContain('CenstatD   ∷ DivisionArea     ∷ District')
  expect(line).not.toContain('NEW')
  expect(line).toEndWith(' v2026-06-05.0 ←  v2026-03-05.0')
  expect(line).toHaveLength(120)
})

test('shows a matching source and local version once', () => {
  const line = formatCheckLine(
    {
      code: 'ds-hk-hkgov-censtatd-division-area-district',
      publisherCode: 'hkgov-censtatd',
      regionCode: 'hk',
      theme: 'divisions',
      resourceTypes: ['divisionArea'],
      versionPolicy: { scheme: 'upstream', correction: false },
    },
    'SAME',
    '2021',
    '2021.0',
  )
  expect(line).toEndWith('SAME         v2021.0')
  expect(line).not.toContain('=')
  expect(line).not.toContain('vlatest')
})

test('does not add a separator when the target has no release', () => {
  const line = formatCheckLine(
    {
      code: 'ds-hk-hkgov-pland-division-area-new-town',
      publisherCode: 'hkgov-pland',
      regionCode: 'hk',
      theme: 'divisions',
      resourceTypes: ['divisionArea'],
      versionPolicy: { scheme: 'reference-year', correction: true },
    },
    'NEW',
    '2016.0',
    null,
  )

  expect(line).toContain('v2016.0')
  expect(line).not.toContain('·')
})

test('keeps active progress beside its stage rather than a trailing version placeholder', () => {
  const line = formatUpdateProgressLine(
    {
      code: 'ds-hk-hkgov-pland-division-area-new-town',
      publisherCode: 'hkgov-pland',
      regionCode: 'hk',
      theme: 'divisions',
      resourceTypes: ['divisionArea'],
      versionPolicy: { scheme: 'reference-year', correction: true },
    },
    'checking latest',
  )

  expect(line).toEndWith('checking latest')
  expect(line).not.toContain('—')
})

test('keeps the dataset context and release position while downloading a batch', () => {
  const line = formatDownloadProgressLine(
    {
      code: 'ds-hk-dpang-street',
      publisherCode: 'dpang',
      regionCode: 'hk',
      theme: 'streets',
      resourceTypes: ['street'],
      versionPolicy: { scheme: 'upstream', correction: true },
    },
    6,
    19,
    '2026-06-17T03:45:16.749Z',
  )

  expect(line).toContain('Dpang')
  expect(line).toContain('Street')
  expect(line).toContain('downloading 7/19')
  expect(line).toContain('v2026-06-17.0')
})

test('reports each completed download with its dataset and release context', () => {
  const line = formatDownloadCompleteLine(
    {
      code: 'ds-hk-dpang-street',
      publisherCode: 'dpang',
      regionCode: 'hk',
      theme: 'streets',
      resourceTypes: ['street'],
      versionPolicy: { scheme: 'upstream', correction: true },
    },
    6,
    19,
    '2026-06-17T03:45:16.749Z',
    1_024,
    559 * 1_024,
  )

  expect(line).toContain('Dpang')
  expect(line).toContain('downloaded 7/19')
  expect(line).toContain('v2026-06-17.0')
  expect(line).toContain('(1s, 559KB)')
})

test('renders every configured release while showing the dataset label once', () => {
  const dataset = {
    code: 'ds-hk-hkgov-censtatd-division-area-district',
    publisherCode: 'hkgov-censtatd',
    regionCode: 'hk',
    theme: 'divisions',
    resourceTypes: ['divisionArea'],
    versionPolicy: { scheme: 'reference-year', correction: true },
  } as const
  const line = formatDatasetCheckLine(
    dataset,
    [
      { dataset, sourceKey: '2016', status: 'current', version: '2016.0' },
      { dataset, sourceKey: '2021', status: 'current', version: '2021.0' },
    ],
    new Map([
      ['2016', '2016.0'],
      ['2021', '2021.0'],
    ]),
  )

  const [first = '', second = ''] = line.split('\n')
  expect(first).toContain('CenstatD   ∷ DivisionArea     ∷ District')
  expect(first).toEndWith('no updates         v2016.0')
  expect(second).toEndWith('no updates         v2021.0')
  expect(second).toStartWith('│ ')
  expect(line).not.toContain('=')
  expect(first).toHaveLength(120)
  expect(second).toHaveLength(123)
})

test('formats division statistics and identifies the HyD nameplate source', () => {
  expect(
    formatDatasetPromptLabel({
      code: 'ds-hk-hkgov-censtatd-division-statistic-land-area',
      publisherCode: 'hkgov-censtatd',
      regionCode: 'hk',
      theme: 'stats',
      resourceTypes: ['divisionStatistic'],
      versionPolicy: { scheme: 'upstream', correction: false },
    }),
  ).toBe('CenstatD ∷ Statistic ∷ Land Area')
  expect(
    formatDatasetPromptLabel({
      code: 'ds-hk-hkgov-pland-division-pu',
      publisherCode: 'hkgov-pland',
      regionCode: 'hk',
      theme: 'divisions',
      resourceTypes: ['division', 'divisionArea'],
      versionPolicy: { scheme: 'reference-year', correction: true },
    }),
  ).toBe('PlanD ∷ Division(Area) ∷ Pu')
  expect(
    formatDatasetPromptLabel({
      code: 'ds-hk-hkgov-hyd-street',
      publisherCode: 'hkgov-hyd',
      regionCode: 'hk',
      theme: 'streets',
      resourceTypes: ['street'],
      versionPolicy: { scheme: 'upstream', correction: false },
    }),
  ).toBe('HyD ∷ Street ∷ Nameplate')
})

test('falls back to the saved target version when the report has no rows', () => {
  expect(resolveTargetVersion(undefined, '2026-06-04.0')).toBe('2026-06-04.0')
  expect(resolveTargetVersion('2026-07-10.0', '2026-06-04.0')).toBe('2026-07-10.0')
})

test('wraps update errors to the guided output width, including long URLs', () => {
  const lines = wrapUpdateMessage(
    'Download failed',
    'https://portal.csdi.gov.hk/csdi-webpage/download/common/021c43ea9c4cc70e7add1c285c18928b93efe2970b8c04a56ac0efe6a2458233',
  )

  expect(lines.every(line => line.length <= 117)).toBe(true)
  expect(lines.join('\n')).toContain('Download failed:')
})
