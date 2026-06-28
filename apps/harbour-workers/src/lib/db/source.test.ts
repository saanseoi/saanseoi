import { describe, expect, test } from 'bun:test'

import { Database as SQLiteDatabase } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'

import { sourceSchema } from '@repo/db'

import { replaceSourceHkgovAlsAddress2dI18nRows } from './source'

function createSourceDb() {
  const sqlite = new SQLiteDatabase(':memory:')

  sqlite.exec(`
    CREATE TABLE sourceHkgovAlsAddress2dI18n (
      sourceRecordId TEXT NOT NULL,
      locale TEXT NOT NULL,
      formattedAddress TEXT,
      buildingName TEXT,
      buildingNumberFrom TEXT,
      buildingNumberTo TEXT,
      blockType TEXT,
      blockNumber TEXT,
      blockTypeBeforeNumber INTEGER,
      phaseName TEXT,
      phaseNumber TEXT,
      estateName TEXT,
      streetNumber TEXT,
      streetName TEXT,
      villageName TEXT,
      districtName TEXT,
      PRIMARY KEY (sourceRecordId, locale)
    );
  `)

  return {
    sqlite,
    db: drizzle({
      client: sqlite,
      schema: sourceSchema,
    }),
  }
}

describe('replaceSourceHkgovAlsAddress2dI18nRows', () => {
  test('updates mutable columns even when they are absent from the first input row', async () => {
    const { sqlite, db } = createSourceDb()

    sqlite.exec(`
      INSERT INTO sourceHkgovAlsAddress2dI18n (
        sourceRecordId, locale, formattedAddress, buildingName, districtName
      ) VALUES (
        'source-2', 'en', 'Old address', 'Old tower', 'Old district'
      );
    `)

    await replaceSourceHkgovAlsAddress2dI18nRows(
      db as never,
      ['source-1', 'source-2'],
      [
        {
          sourceRecordId: 'source-1',
          locale: 'en',
          formattedAddress: 'One Example Street',
        },
        {
          sourceRecordId: 'source-2',
          locale: 'en',
          formattedAddress: 'Two Example Street',
          buildingName: 'New tower',
          districtName: 'New district',
        },
      ],
    )

    const rows = sqlite
      .query(
        `
          SELECT sourceRecordId, locale, formattedAddress, buildingName, districtName
          FROM sourceHkgovAlsAddress2dI18n
          ORDER BY sourceRecordId
        `,
      )
      .all() as Array<{
      buildingName: string | null
      districtName: string | null
      formattedAddress: string | null
      locale: string
      sourceRecordId: string
    }>

    sqlite.close()

    expect(rows).toEqual([
      {
        sourceRecordId: 'source-1',
        locale: 'en',
        formattedAddress: 'One Example Street',
        buildingName: null,
        districtName: null,
      },
      {
        sourceRecordId: 'source-2',
        locale: 'en',
        formattedAddress: 'Two Example Street',
        buildingName: 'New tower',
        districtName: 'New district',
      },
    ])
  })
})
