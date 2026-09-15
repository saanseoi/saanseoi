import { expect, test } from 'bun:test'
import { addressSourceReferences } from './sourceReferences'

test('canonical references preserve exact assertions without copying processing or release metadata', () => {
  const row = {
    publisherSource: {
      sourceRecordId: 'publisher-occurrence',
      versionHash: 'exact-hash',
      properties: { geoAddress: 'original' },
      sourceGeometry: null,
      sources: [],
    },
    sources: JSON.stringify({
      hkgovAls: { cohortKey: 'old', sourceFile: 'district.geojson' },
      reviewedComplex: {
        authority: 'reviewed decision',
        originalAliases: [{ id: 'old-alias' }],
      },
    }),
  }
  const references = addressSourceReferences(row, 'ss-complex')
  expect(references).toEqual({
    hkgovAls: [{ record_id: 'publisher-occurrence', versionHash: 'exact-hash' }],
    curation: [{ record_id: 'ss-complex' }],
  })
  expect(
    addressSourceReferences({ ...row, sourceVersion: 'next' }, 'ss-complex'),
  ).toEqual(references)
  expect(JSON.stringify(references)).not.toContain('authority')
  expect(JSON.stringify(references)).not.toContain('cohortKey')
  expect(JSON.stringify(references)).not.toContain('sourceFile')
  expect(
    addressSourceReferences(
      { ...row, publisherSource: { ...row.publisherSource, versionHash: 'changed' } },
      'ss-complex',
    ),
  ).not.toEqual(references)
})
