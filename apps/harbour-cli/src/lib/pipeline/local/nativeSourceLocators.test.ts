import { expect, test } from 'bun:test'
import { nativeSourceLocatorDefaults } from './nativeSourceLocators'
import { versionNativeSourceRows } from './nativeSourceSql'
test('release archive and record ID are redundant; shared layers move to the table receipt and differing indexes remain', async () => {
  const rows = [1, 2].map(index => ({
    sourceRecordId: String(index),
    properties: { name: 'x' },
    sources: [
      {
        sourceFile: 'archive.zip',
        sourceFeatureRef: String(index),
        layerName: 'names',
        featureIndexOneBased: index,
      },
    ],
  }))
  const defaults = nativeSourceLocatorDefaults(rows, 'archive.zip')
  expect(defaults).toEqual({ layerName: 'names' })
  const versions = await versionNativeSourceRows(
    rows,
    'release',
    '2026-09-01.0',
    false,
    true,
    'archive.zip',
    defaults,
  )
  expect(versions.map(row => row.sourceLocator)).toEqual([
    { featureIndexOneBased: 1 },
    { featureIndexOneBased: 2 },
  ])
})
