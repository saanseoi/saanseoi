import { describe, expect, test } from 'bun:test'

import { selectSourceArchiveKey } from './hkgovCenstatdDistrictStatistics.ts'

const hash = 'a'.repeat(64)

describe('C&SD district-statistic archive resolution', () => {
  test('uses the asset registry key rather than reconstructing an R2 path from the archive slot', () => {
    expect(
      selectSourceArchiveKey(hash, [
        {
          assetKey: `by-source/hk/hkgov-csdi/censtatd_rcd_1635934215448_25451/${hash}-source.zip`,
          contentHash: hash,
          role: 'sourceArchive',
        },
      ]),
    ).toBe(
      `by-source/hk/hkgov-csdi/censtatd_rcd_1635934215448_25451/${hash}-source.zip`,
    )
  })

  test('requires exactly one registered source archive for the mapped hash', () => {
    expect(() => selectSourceArchiveKey(hash, [])).toThrow(
      'No local sourceArchive asset is registered',
    )
    expect(() =>
      selectSourceArchiveKey(hash, [
        { assetKey: 'one.zip', contentHash: hash, role: 'sourceArchive' },
        { assetKey: 'two.zip', contentHash: hash, role: 'sourceArchive' },
      ]),
    ).toThrow('Multiple local sourceArchive assets are registered')
  })
})
