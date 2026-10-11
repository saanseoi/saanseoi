import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { sql } from 'drizzle-orm'
import { matchesDivisionDomain } from './uploadReadiness'

test('SaanSeoi geometry prerequisites select the SaanSeoi division inventory', () => {
  const sqlite = new Database(':memory:')
  try {
    sqlite.exec(
      "CREATE TABLE snapshotLineages (variant TEXT); CREATE TABLE datasets (code TEXT); INSERT INTO snapshotLineages VALUES ('saanseoi'), ('overture'); INSERT INTO datasets VALUES ('unrelated');",
    )
    const db = drizzle({ client: sqlite })
    const rows = db.all(
      sql`SELECT variant FROM snapshotLineages CROSS JOIN datasets WHERE ${matchesDivisionDomain('saanseoi', 'ds-hk-saanseoi-division-area')}`,
    )
    expect(rows).toEqual([{ variant: 'saanseoi' }])
    expect(
      db.all(
        sql`SELECT variant FROM snapshotLineages CROSS JOIN datasets WHERE ${matchesDivisionDomain('overture', 'ds-hk-overture-division-area')}`,
      ),
    ).toEqual([{ variant: 'overture' }])
  } finally {
    sqlite.close()
  }
})
