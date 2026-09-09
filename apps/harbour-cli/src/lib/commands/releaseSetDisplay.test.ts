import { expect, test } from 'bun:test'

import {
  formatApiReleaseSetCode,
  formatApiReleaseSetDocsGrid,
  formatReleaseDocsGrid,
} from './releaseSetDisplay.ts'

test('keeps API release-set components in their stable display order', () => {
  const output = formatApiReleaseSetCode(
    'data-hk-divisions-2025-09-24.0-r1--overture',
  ).replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '')

  expect(output).toBe('data-hk-divisions-2025-09-24.0-r1--overture')
})

test('formats source-release documentation updates as a compact grid', () => {
  const output = formatReleaseDocsGrid([
    {
      datasetCode: 'ds-hk-hkgov-dpo-address',
      regionCode: 'hk',
      source: 'hkgov-dpo',
      sourceVersion: '2024-07-25.0',
    },
    {
      datasetCode: 'ds-hk-overture-division',
      regionCode: 'hk',
      source: 'overture',
      sourceVersion: '2025-09-24.0',
    },
  ]).map(line =>
    line.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), ''),
  )

  expect(output).toEqual([
    '  hkgov-dpo           address               2024-07-25.0',
    '  overture            division              2025-09-24.0',
  ])
})

test('formats documentation updates as a compact release-set grid', () => {
  const output = formatApiReleaseSetDocsGrid([
    'data-hk-addresses-2024-07-25.0',
    'data-hk-divisions-2025-09-24.0-r1--overture',
  ]).map(line =>
    line.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), ''),
  )

  expect(output).toEqual([
    '  addresses         2024-07-25.0    r0',
    '  divisions         2025-09-24.0    r1  --overture',
  ])
})
