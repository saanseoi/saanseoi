import { expect, test } from 'bun:test'

import {
  formatApiReleaseSetCode,
  formatApiReleaseSetDocsGrid,
} from './releaseSetDisplay.ts'

test('keeps API release-set components in their stable display order', () => {
  const output = formatApiReleaseSetCode(
    'data-hk-divisions-2025-09-24.0-r1--overture',
  ).replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '')

  expect(output).toBe('data-hk-divisions-2025-09-24.0-r1--overture')
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
