import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import {
  sourceOvertureDivisionAreas,
  sourceOvertureDivisionBoundaries,
  sourceOvertureDivisions,
  sourceOverturePlaces,
} from './overture'

describe('Overture source payload boundary', () => {
  for (const table of [
    sourceOvertureDivisions,
    sourceOvertureDivisionAreas,
    sourceOvertureDivisionBoundaries,
    sourceOverturePlaces,
  ]) {
    const config = getTableConfig(table)
    test(`${config.name} retains only the raw payload and source envelope`, () => {
      expect(config.columns.map(column => column.name).sort()).toEqual(
        [
          'sourceRecordId',
          'sourceLocator',
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
  }
})
