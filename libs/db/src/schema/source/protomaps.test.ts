import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { sourceProtomapsIslandFeatures } from './protomaps'

describe('Protomaps island source payload boundary', () => {
  test('retains native spatial assertions without canonical selection fields', () => {
    const config = getTableConfig(sourceProtomapsIslandFeatures)
    expect(config.columns.map(column => column.name).sort()).toEqual(
      [
        'sourceRecordId',
        'properties',
        'sourceGeometry',
        'versionHash',
        'resourceReleaseId',
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
    expect(config.indexes.map(index => index.config.name).sort()).toEqual([
      `${config.name}_open_records_idx`,
      `${config.name}_release_validity_idx`,
      `${config.name}_resourceReleaseId_idx`,
    ])
  })
})
