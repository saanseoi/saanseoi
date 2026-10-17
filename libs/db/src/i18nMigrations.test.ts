import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { loadMigrationSql } from '../../core/src/testing/metaFixtures'

const tables = [
  'address2dI18n',
  'address3dI18n',
  'divisionsI18n',
  'placesI18n',
  'streetsI18n',
  'statsFieldsI18n',
  'statsMeasuresI18n',
  'statsValuesI18n',
]

test.each(['current', 'history'])(
  '%s migrations expose metadata across every locale table',
  family => {
    const db = new Database(':memory:')
    try {
      db.exec(loadMigrationSql(resolve(import.meta.dir, '../migrations'), [family]))
      for (const table of tables) {
        const columns = db.query(`PRAGMA table_info(${table})`).all() as Array<{
          name: string
          notnull: number
        }>
        expect(columns.find(column => column.name === 'meta')?.notnull).toBe(0)
        for (const removed of [
          'nameProvenance',
          'isLocaleInferred',
          'provenance',
          'isTranslationVerified',
        ])
          expect(columns.some(column => column.name === removed)).toBe(false)
      }
      if (family === 'history') {
        expect(() =>
          db.exec(
            "INSERT INTO divisionsI18n(divisionId,locale,snapshotId,operation,versionHash,meta) VALUES('a','en','bad','upsert','v',NULL)",
          ),
        ).not.toThrow()
        db.exec(
          "INSERT INTO divisionsI18n(divisionId,locale,snapshotId,operation,meta) VALUES('a','en','deleted','delete',NULL)",
        )
        expect(
          db
            .query("SELECT operation FROM historyEvents WHERE snapshotId='deleted'")
            .get(),
        ).toEqual({ operation: 'delete' })
      }
    } finally {
      db.close()
    }
  },
)

test('Drizzle writes SQL NULL for default metadata and retains inferred locale provenance', async () => {
  const { drizzle } = await import('drizzle-orm/bun-sqlite')
  const { currentSchema } = await import('./index')
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(
      loadMigrationSql(resolve(import.meta.dir, '../migrations'), ['current']),
    )
    sqlite.exec('PRAGMA foreign_keys=OFF')
    const db = drizzle({ client: sqlite })
    for (const [id, meta] of [
      ['default', { isLocaleInferred: false }],
      ['empty', {}],
      [
        'inferred',
        {
          isLocaleInferred: true,
          fields: { formattedAddress: { origin: 'provided' } },
        },
      ],
    ] as const) {
      db.insert(currentSchema.address2dI18n)
        .values({
          scopeId: 'scope',
          addressId: id,
          locale: 'en',
          formattedAddress: 'Address',
          meta: meta as import('./i18nMeta').I18nMeta,
        })
        .run()
    }
    expect(
      sqlite.query('SELECT addressId,meta FROM address2dI18n ORDER BY addressId').all(),
    ).toEqual([
      { addressId: 'default', meta: null },
      { addressId: 'empty', meta: null },
      {
        addressId: 'inferred',
        meta: '{"isLocaleInferred":true,"fields":{"formattedAddress":{"origin":"provided"}}}',
      },
    ])
  } finally {
    sqlite.close()
  }
})
