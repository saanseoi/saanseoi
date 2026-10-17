import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { defineRelations } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { resolve } from 'node:path'
import { historySchema } from '@repo/db'
import { loadMigrationSql } from '../../../testing/metaFixtures'
import { resolveStatisticEvents } from './statisticSnapshotRecords'

test('selected Address replay preserves parent deletions and locale changes across shards', async () => {
  const clients = [new Database(':memory:'), new Database(':memory:')]
  try {
    for (const client of clients)
      client.exec(
        loadMigrationSql(resolve(import.meta.dir, '../../../../../db/migrations'), [
          'history',
        ]),
      )
    const ids = Array.from({ length: 201 }, (_, i) => `address-${i}`)
    const insert = clients[0]!.query(
      "INSERT INTO address2d(id,snapshotId,versionHash) VALUES (?,'root','base')",
    )
    for (const id of [...ids, 'unrelated']) insert.run(id)
    clients[0]!.exec(`
      INSERT INTO address2dI18n(addressId,snapshotId,locale,versionHash,formattedAddress) VALUES
        ('address-0','root','en','old','Old address'), ('address-1','root','en','old','Old address');
    `)
    clients[1]!.exec(`
      INSERT INTO address2d(id,snapshotId,operation) VALUES ('address-0','child','delete');
      INSERT INTO address2dI18n(addressId,snapshotId,locale,versionHash,formattedAddress) VALUES ('address-1','child','en','new','New address');
      INSERT INTO address2d(id,snapshotId,versionHash) VALUES ('address-1','other-branch','wrong');
    `)
    const dbs = clients.map(
      client => drizzle({ client, relations: defineRelations(historySchema) }) as never,
    )
    const normalise = (groups: Awaited<ReturnType<typeof resolveStatisticEvents>>) =>
      [...groups.values()]
        .flat()
        .map(row => [row.recordType, row.recordId, row.locale, row.versionHash])
        .sort()
    const full = await resolveStatisticEvents(
      dbs,
      ['root', 'child'],
      ['address2d', 'address2dI18n'],
    )
    const selected = await resolveStatisticEvents(
      dbs,
      ['root', 'child'],
      ['address2d', 'address2dI18n'],
      ids,
    )
    expect(normalise(selected)).toEqual(
      normalise(full).filter(row => row[1] !== 'unrelated'),
    )
    expect(normalise(selected)).not.toContainEqual([
      'address2dI18n',
      'address-0',
      'en',
      'old',
    ])
    expect(normalise(selected)).toContainEqual([
      'address2dI18n',
      'address-1',
      'en',
      'new',
    ])
    expect(
      normalise(
        await resolveStatisticEvents(dbs, ['root', 'child'], ['address2d'], []),
      ),
    ).toEqual([])
  } finally {
    for (const client of clients) client.close()
  }
})
