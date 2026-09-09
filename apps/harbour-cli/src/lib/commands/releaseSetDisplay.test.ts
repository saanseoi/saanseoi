import { expect, test } from 'bun:test'

import { formatApiReleaseSetCode } from './releaseSetDisplay.ts'

test('keeps API release-set components in their stable display order', () => {
  const output = formatApiReleaseSetCode(
    'data-hk-divisions-2025-09-24.0-r1--overture',
  ).replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '')

  expect(output).toBe('data-hk-divisions-2025-09-24.0-r1--overture')
})
