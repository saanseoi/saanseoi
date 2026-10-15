import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { loadMigrationSql } from '../../testing/metaFixtures'
import { readHistoryDictionaryVersions } from './historyDictionaries'

test('dictionary references reuse an ancestor while excluding sibling metadata and repeated lookup references', async () => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(
      loadMigrationSql(resolve(import.meta.dir, '../../../../db/migrations'), [
        'history',
      ]),
    )
    sqlite.exec(
      `INSERT INTO statsFieldsI18n(datasetCode,fieldName,locale,snapshotId,versionHash,name) VALUES('dataset','field','en','root','hash','Field'),('dataset','field','en','sibling','hash','Field');`,
    )
    const refs = Array.from({ length: 300 }, () => ({
      datasetCode: 'dataset',
      identity: 'field',
      versionHash: 'hash',
    }))
    const rows = await readHistoryDictionaryVersions(
      [drizzle({ client: sqlite }) as never],
      ['root', 'child'],
      'statsFieldsI18n',
      refs,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ snapshotId: 'root' })
  } finally {
    sqlite.close()
  }
})
