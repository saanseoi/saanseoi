import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { getTableColumns, getTableName } from 'drizzle-orm'
import { currentSchema } from '@repo/db'
import { createLocalHarbourDb } from '@repo/core/testing/localDb'
import { buildPlaceStatsRows } from './apiReleaseSetStats'

// Exercise the real CURRENT query shape with stable physical scopes and decoy rows.
test('Place API stats resolve the exact prepared scope and aggregate category, district and optional coverage', async () => {
  const sqlite = new Database(':memory:')
  try {
    for (const table of [
      currentSchema.places,
      currentSchema.placesI18n,
      currentSchema.placePublicationState,
    ]) {
      const columns = Object.values(getTableColumns(table)).map(
        column => `"${column.name}" ${column.getSQLType()}`,
      )
      sqlite.exec(`CREATE TABLE "${getTableName(table)}" (${columns.join(', ')})`)
    }
    sqlite.exec(`
      INSERT INTO placePublicationState (scopeId, snapshotId, preparedAt, publicationToken) VALUES ('stable-scope', 'logical-snapshot', '2026-10-15', 'receipt');
      INSERT INTO places (scopeId,id,basicCategory,taxonomyPrimary,operatingStatus,districtId,areaId,websites,phones,identifiers,address2dId) VALUES
        ('stable-scope','a','food_service','cafe','open','district-a','area-a','["https://example.com"]','["1234"]','{"wikidata":{"brandId":"Q1"}}','address-a'),
        ('stable-scope','b',NULL,NULL,NULL,NULL,NULL,'[]','[]',NULL,NULL),
        ('other-scope','decoy','shopping','shop','closed','district-b',NULL,'[]','[]',NULL,NULL);
      INSERT INTO placesI18n (scopeId,placeId,locale,name,meta) VALUES
        ('stable-scope','a','en','Cafe','{"isLocaleInferred":false}'),
        ('other-scope','decoy','en','Decoy','{"isLocaleInferred":false}');
    `)
    const rows = await buildPlaceStatsRows(
      createLocalHarbourDb(sqlite),
      'logical-snapshot',
    )
    expect(rows.find(row => row.category === 'records' && !row.dimension)?.value).toBe(
      2,
    )
    expect(
      rows
        .filter(row => row.dimension === 'basicCategory')
        .map(row => [row.dimensionValue, row.value]),
    ).toEqual([
      ['food_service', 1],
      ['unspecified', 1],
    ])
    expect(
      rows
        .filter(row => row.dimension === 'district')
        .map(row => [row.dimensionValue, row.value]),
    ).toEqual([['district-a', 1]])
    expect(
      rows.find(
        row =>
          row.dimension === 'placeField' &&
          row.dimensionValue === 'anyContact' &&
          row.measure === 'coverage',
      )?.value,
    ).toBe(50)
    expect(
      rows.find(row => row.category === 'localised_records' && !row.dimension)?.value,
    ).toBe(1)
    expect(rows.find(row => row.category === 'reference_name_count')?.value).toBe(1)
    sqlite.exec('UPDATE placePublicationState SET preparedAt = NULL')
    await expect(
      buildPlaceStatsRows(createLocalHarbourDb(sqlite), 'logical-snapshot'),
    ).rejects.toThrow('no complete placePublicationState receipt')
  } finally {
    sqlite.close()
  }
})
