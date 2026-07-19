import { describe, expect, test } from 'bun:test'

import { formatSourceDuplicateSummary } from './hkgovAls.ts'

describe('formatSourceDuplicateSummary', () => {
  test('reports aggregate duplicate statistics without source-record JSON', () => {
    const summary = formatSourceDuplicateSummary([
      {
        address: '1 EXAMPLE STREET',
        canonicalRecord: { canonicalId: 'canonical-1' },
        ignoredRecords: [{ canonicalId: 'ignored-1' }],
        occurrences: [
          { featureIndexOneBased: 4, sourceFile: 'central.geojson' },
          { featureIndexOneBased: 9, sourceFile: 'central.geojson' },
        ],
      },
      {
        address: '2 EXAMPLE STREET',
        occurrences: [
          { featureIndexOneBased: 11, sourceFile: 'eastern.geojson' },
          { featureIndexOneBased: 21, sourceFile: 'kowloon.geojson' },
          { featureIndexOneBased: 37, sourceFile: 'kowloon.geojson' },
        ],
      },
    ])

    expect(summary).toContain('affectedPremises')
    expect(summary).toContain('2')
    expect(summary).toContain('sourceFeaturesInvolved')
    expect(summary).toContain('5')
    expect(summary).toContain('sourceFeaturesRemoved')
    expect(summary).toContain('3')
    expect(summary).toContain('sourceFilesInvolved')
    expect(summary).toContain('3')
    expect(summary).not.toContain('canonical-1')
    expect(summary).not.toContain('ignored-1')
  })
})
