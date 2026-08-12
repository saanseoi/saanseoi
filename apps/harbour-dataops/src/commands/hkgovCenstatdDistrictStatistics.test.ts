import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'

import { assertSourceArchiveIdentity } from './hkgovCenstatdDistrictStatistics.ts'

describe('C&SD district-density archive identity', () => {
  test('only accepts the archive represented by the updater manifest hash', () => {
    const archive = new TextEncoder().encode('prepared-local-source-archive')
    const hash = createHash('sha256').update(archive).digest('hex')

    expect(() => assertSourceArchiveIdentity(archive, hash)).not.toThrow()
    expect(() => assertSourceArchiveIdentity(archive, '0'.repeat(64))).toThrow(
      'differs from its updater manifest',
    )
  })
})
