import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { sourceProtomapsIslandFeatures } from './protomaps'

describe('Protomaps island source payload boundary', () => {
  test('retains native spatial assertions without canonical selection fields', () => {
    const config = getTableConfig(sourceProtomapsIslandFeatures)
    expect(config.columns.map(column => column.name).sort()).toEqual(
      [
        'sourceRecordId',
        'sourceLocator',
        'properties',
        'sourceGeometry',
        'versionHash',
        'releaseId',
        'validFromRelease',
        'validToRelease',
        'isCurrent',
        'createdAt',
        'updatedAt',
      ].sort(),
    )
    expect(config.primaryKeys[0]?.columns.map(column => column.name)).toEqual([
      'sourceRecordId',
      'versionHash',
    ])
    expect(config.indexes).toHaveLength(4)
  })
})
