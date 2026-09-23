import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { address2d as currentAddress2d } from './addresses'
import { address2d as historyAddress2d } from '../history/addresses'

const divisionIdColumns = [
  'countryId',
  'landformId',
  'areaId',
  'districtId',
  'townId',
  'macrohoodId',
  'neighbourhoodId',
  'microhoodId',
  'villageId',
  'hamletId',
] as const

describe('Address division indexes', () => {
  test('indexes each non-null division role on current addresses', () => {
    const config = getTableConfig(currentAddress2d)
    const indexesByColumns = new Map(
      config.indexes.map(index => [
        index.config.columns.map(column => column.name).join(','),
        index,
      ]),
    )

    for (const column of divisionIdColumns) {
      const index = indexesByColumns.get(`${column},snapshotId,id`)
      expect(index, `${column} should have a current lookup index`).toBeDefined()
      expect(
        index?.config.where,
        `${column} index should omit null memberships`,
      ).toBeDefined()
    }

    expect(indexesByColumns.get('divisionSnapshotId')?.config.name).toBe(
      'address2d_divisionSnapshotId_idx',
    )
  })

  test('retains division IDs in history without adding role lookup indexes', () => {
    const config = getTableConfig(historyAddress2d)
    const indexedColumns = config.indexes.flatMap(index =>
      index.config.columns.map(column => column.name),
    )

    for (const column of divisionIdColumns) {
      expect(config.columns.map(value => value.name)).toContain(column)
      expect(indexedColumns).not.toContain(column)
    }
  })
})
