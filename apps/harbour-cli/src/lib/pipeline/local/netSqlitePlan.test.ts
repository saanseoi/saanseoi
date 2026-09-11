import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { captureNetSqlitePlan, type NetTablePolicy } from './netSqlitePlan.ts'
import type { NetStatement } from './netSqlitePlanTypes.ts'

async function fixture(
  work: (input: { db: Database; path: string; directory: string }) => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), 'net-plan-test-'))
  const path = join(directory, 'mirror.sqlite')
  const db = new Database(path)
  try {
    db.exec(
      'PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; PRAGMA foreign_keys=ON;',
    )
    await work({ db, path, directory })
  } finally {
    db.close()
    await rm(directory, { recursive: true, force: true })
  }
}

const standardSchema = `
  CREATE TABLE address(id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, updatedAt TEXT NOT NULL);
  CREATE TABLE locale(addressId TEXT NOT NULL REFERENCES address(id), lang TEXT NOT NULL, name TEXT, PRIMARY KEY(addressId,lang));
  INSERT INTO address VALUES('a','first','old'),('b','second','old');
  INSERT INTO locale VALUES('a','en','first'),('a','zh','一'),('b','en','second');`
const policies: NetTablePolicy[] = [
  { name: 'address', ignoredColumns: ['updatedAt'] },
  { name: 'locale' },
]

test('net plan coalesces intermediate work and normalises timestamp-only differences without touching a WAL mirror', async () => {
  await fixture(async ({ db, path }) => {
    db.exec(standardSchema)
    const payloads: Uint8Array[] = []
    const output = await captureNetSqlitePlan({
      targets: { CURRENT: { path, tables: policies } },
      append: async (_target, bytes) => {
        payloads.push(bytes)
      },
      generate: async candidates => {
        const copy = candidates.CURRENT?.db
        if (!copy) throw new Error('Missing copy')
        copy.exec(
          "DELETE FROM locale WHERE addressId='a' AND lang='en'; INSERT INTO locale VALUES('a','en','first'); UPDATE address SET updatedAt='new';",
        )
        return 'prepared'
      },
    })
    expect(output.result).toBe('prepared')
    expect(output.summary.statements).toBe(0)
    expect(output.summary.tables.CURRENT?.address).toEqual({
      before: 2,
      after: 2,
      inserted: 0,
      updated: 0,
      deleted: 0,
      unchanged: 2,
    })
    expect(payloads).toHaveLength(0)
    expect(db.query('SELECT DISTINCT updatedAt FROM address').all()).toEqual([
      { updatedAt: 'old' },
    ])
  })
})

test('one locale edit emits one keyed update containing only changed columns', async () => {
  await fixture(async ({ db, path }) => {
    db.exec(standardSchema)
    const statements: NetStatement[] = []
    const output = await captureNetSqlitePlan({
      targets: { CURRENT: { path, databaseId: 'remote-id', tables: policies } },
      append: async (target, bytes, kind) => {
        expect(target).toEqual({ bindingName: 'CURRENT', databaseId: 'remote-id' })
        expect(kind).toBe('bound')
        statements.push(...JSON.parse(Buffer.from(bytes).toString()))
      },
      generate: async candidates => {
        candidates.CURRENT?.db.exec(
          "UPDATE locale SET name='edited' WHERE addressId='a' AND lang='en'",
        )
      },
    })
    expect(output.summary.statements).toBe(1)
    expect(statements).toEqual([
      {
        sql: 'UPDATE "locale" SET "name"=? WHERE "addressId" IS ? AND "lang" IS ?',
        params: ['edited', 'a', 'en'],
      },
    ])
    expect(
      db.query("SELECT name FROM locale WHERE addressId='a' AND lang='en'").get(),
    ).toEqual({ name: 'first' })
  })
})

test('bootstrap delivers final contents once and respects parent insert and child delete order', async () => {
  await fixture(async ({ db, path }) => {
    db.exec(standardSchema)
    const statements: NetStatement[] = []
    const output = await captureNetSqlitePlan({
      targets: { CURRENT: { path, tables: [...policies].reverse() } },
      bootstrap: true,
      append: async (_target, bytes) => {
        statements.push(...JSON.parse(Buffer.from(bytes).toString()))
      },
      generate: async candidates => {
        candidates.CURRENT?.db.exec("UPDATE address SET name='final' WHERE id='a'")
      },
    })
    expect(output.summary.statements).toBe(5)
    expect(
      statements
        .slice(0, 2)
        .every(statement => statement.sql.startsWith('INSERT INTO "address"')),
    ).toBe(true)
    expect(output.summary.tables.CURRENT?.address?.before).toBe(0)
    const removed: NetStatement[] = []
    await captureNetSqlitePlan({
      targets: { CURRENT: { path, tables: policies } },
      append: async (_target, bytes) => {
        removed.push(...JSON.parse(Buffer.from(bytes).toString()))
      },
      generate: async candidates => {
        candidates.CURRENT?.db.exec(
          "DELETE FROM locale WHERE addressId='a'; DELETE FROM address WHERE id='a'",
        )
      },
    })
    expect(
      removed.map(statement => statement.sql.match(/FROM "([^"]+)"/)?.[1]),
    ).toEqual(['locale', 'locale', 'address'])
  })
})

test('large text rows use a bounded parameter and oversized logical rows fail before append', async () => {
  await fixture(async ({ db, path }) => {
    db.exec('CREATE TABLE data(id TEXT PRIMARY KEY, payload TEXT)')
    const payload = '中'.repeat(100_000)
    const statements: NetStatement[] = []
    await captureNetSqlitePlan({
      targets: { CURRENT: { path, tables: [{ name: 'data' }] } },
      append: async (_target, bytes) => {
        statements.push(...JSON.parse(Buffer.from(bytes).toString()))
      },
      generate: async candidates => {
        candidates.CURRENT?.db
          .query('INSERT INTO data VALUES(?,?)')
          .run('large', payload)
      },
    })
    expect(statements[0]?.params).toEqual(['large', payload])
    expect(statements[0]?.sql.length).toBeLessThan(100)
    let appended = false
    await expect(
      captureNetSqlitePlan({
        targets: { CURRENT: { path, tables: [{ name: 'data' }] } },
        append: async () => {
          appended = true
        },
        generate: async candidates => {
          candidates.CURRENT?.db
            .query('INSERT INTO data VALUES(?,?)')
            .run('large', 'x'.repeat(2_000_000))
        },
      }),
    ).rejects.toThrow('logical row budget')
    expect(appended).toBe(false)
  })
})

test('generation failure, invalid foreign keys and uniqueness transitions emit nothing', async () => {
  await fixture(async ({ db, path }) => {
    db.exec(standardSchema)
    db.exec('CREATE UNIQUE INDEX address_name ON address(name)')
    for (const generate of [
      async (copy: Database) => {
        copy.exec("UPDATE address SET name='edited' WHERE id='a'")
        throw new Error('generation failed')
      },
      async (copy: Database) => {
        copy.exec(
          "PRAGMA foreign_keys=OFF; INSERT INTO locale VALUES('missing','en','orphan')",
        )
      },
      async (copy: Database) => {
        copy.exec(
          "UPDATE address SET name='temporary' WHERE id='a'; UPDATE address SET name='first' WHERE id='b'; UPDATE address SET name='second' WHERE id='a'",
        )
      },
    ]) {
      let appended = false
      await expect(
        captureNetSqlitePlan({
          targets: { CURRENT: { path, tables: policies } },
          append: async () => {
            appended = true
          },
          generate: async candidates => {
            const copy = candidates.CURRENT?.db
            if (!copy) throw new Error('Missing candidate')
            await generate(copy)
          },
        }),
      ).rejects.toThrow()
      expect(appended).toBe(false)
    }
    expect(db.query('SELECT name FROM address ORDER BY id').all()).toEqual([
      { name: 'first' },
      { name: 'second' },
    ])
  })
})

test('collections stay atomic and an oversized collection prevents every append', async () => {
  await fixture(async ({ db, path }) => {
    db.exec(standardSchema)
    const collectionPolicies: NetTablePolicy[] = [
      { name: 'address', collection: { name: 'address', keyColumns: ['id'] } },
      { name: 'locale', collection: { name: 'address', keyColumns: ['addressId'] } },
    ]
    const payloads: NetStatement[][] = []
    await captureNetSqlitePlan({
      targets: { CURRENT: { path, tables: collectionPolicies } },
      limits: { maxStatements: 4 },
      append: async (_target, bytes) => {
        payloads.push(JSON.parse(Buffer.from(bytes).toString()))
      },
      generate: async candidates => {
        candidates.CURRENT?.db.exec(
          "UPDATE address SET name=name||'!'; UPDATE locale SET name=name||'!'",
        )
      },
    })
    expect(payloads).toHaveLength(2)
    expect(payloads.map(payload => payload.length)).toEqual([4, 3])
    expect(
      payloads.every(payload => payload[0]?.sql === 'PRAGMA defer_foreign_keys=ON'),
    ).toBe(true)
    let appended = false
    await expect(
      captureNetSqlitePlan({
        targets: { CURRENT: { path, tables: collectionPolicies } },
        limits: { maxStatements: 3 },
        append: async () => {
          appended = true
        },
        generate: async candidates => {
          candidates.CURRENT?.db.exec(
            "UPDATE address SET name=name||'!'; UPDATE locale SET name=name||'!'",
          )
        },
      }),
    ).rejects.toThrow('collection exceeds')
    expect(appended).toBe(false)
  })
})

test('all targets validate before the first payload is appended', async () => {
  await fixture(async ({ db, path }) => {
    db.exec(standardSchema)
    let appended = false
    await expect(
      captureNetSqlitePlan({
        targets: { ONE: { path, tables: policies }, TWO: { path, tables: policies } },
        append: async () => {
          appended = true
        },
        generate: async candidates => {
          candidates.ONE?.db.exec("UPDATE address SET name='edited' WHERE id='a'")
          candidates.TWO?.db.exec('ALTER TABLE address ADD COLUMN unsupported TEXT')
        },
      }),
    ).rejects.toThrow('Schema changed')
    expect(appended).toBe(false)
  })
})

test('parameter limits fail locally and exact integer/blob values survive JSON delivery', async () => {
  await fixture(async ({ db, path }) => {
    db.exec('CREATE TABLE exact(id INTEGER PRIMARY KEY, payload BLOB)')
    const statements: NetStatement[] = []
    await captureNetSqlitePlan({
      targets: { CURRENT: { path, tables: [{ name: 'exact' }] } },
      append: async (_target, bytes) => {
        statements.push(...JSON.parse(Buffer.from(bytes).toString()))
      },
      generate: async candidates => {
        candidates.CURRENT?.db.exec(
          "INSERT INTO exact VALUES(9223372036854775807,X'00ff1122')",
        )
      },
    })
    expect(statements).toEqual([
      {
        sql: 'INSERT INTO "exact" ("id","payload") VALUES (9223372036854775807,X\'00ff1122\')',
        params: [],
      },
    ])
    const columns = Array.from({ length: 101 }, (_, index) => `c${index}`)
    db.exec(
      `CREATE TABLE wide(${columns.map((column, index) => `${column} TEXT${index === 0 ? ' PRIMARY KEY' : ''}`).join(',')})`,
    )
    let appended = false
    await expect(
      captureNetSqlitePlan({
        targets: { CURRENT: { path, tables: [{ name: 'wide' }] } },
        append: async () => {
          appended = true
        },
        generate: async candidates => {
          candidates.CURRENT?.db
            .query(`INSERT INTO wide VALUES(${columns.map(() => '?').join(',')})`)
            .run(...columns)
        },
      }),
    ).rejects.toThrow('statement budget')
    expect(appended).toBe(false)
  })
})

test('case-insensitive schema collations cannot hide primary-key or content changes', async () => {
  await fixture(async ({ db, path }) => {
    db.exec(
      "CREATE TABLE names(id TEXT COLLATE NOCASE PRIMARY KEY, name TEXT COLLATE NOCASE); INSERT INTO names VALUES('a','first')",
    )
    const statements: NetStatement[] = []
    const output = await captureNetSqlitePlan({
      targets: { CURRENT: { path, tables: [{ name: 'names' }] } },
      append: async (_target, bytes) => {
        statements.push(...JSON.parse(Buffer.from(bytes).toString()))
      },
      generate: async candidates => {
        candidates.CURRENT?.db.exec("UPDATE names SET id='A',name='FIRST'")
      },
    })
    expect(output.summary.statements).toBe(2)
    expect(statements.map(statement => statement.sql.split(' ')[0])).toEqual([
      'DELETE',
      'INSERT',
    ])
    expect(statements[1]?.params).toEqual(['A', 'FIRST'])
  })
})

test('parent moves precede retired parent deletion with and without cascading foreign keys', async () => {
  for (const cascade of [false, true]) {
    await fixture(async ({ db, path }) => {
      db.exec(`CREATE TABLE parent(id TEXT PRIMARY KEY);
        CREATE TABLE child(id TEXT PRIMARY KEY, parentId TEXT REFERENCES parent(id) ${cascade ? 'ON DELETE CASCADE' : ''});
        INSERT INTO parent VALUES('old'); INSERT INTO child VALUES('child','old');`)
      const generate = async (candidates: Record<string, { db: Database }>) => {
        candidates.CURRENT?.db.exec(
          "INSERT INTO parent VALUES('new'); UPDATE child SET parentId='new'; DELETE FROM parent WHERE id='old'",
        )
      }
      let emitted = 0
      const input = {
        targets: { CURRENT: { path, tables: [{ name: 'parent' }, { name: 'child' }] } },
        generate,
        append: async () => {
          emitted++
        },
      }
      const prepared = await captureNetSqlitePlan(input)
      expect(prepared.summary.statements).toBe(3)
      expect(emitted).toBe(1)
      const grouped = {
        ...input,
        targets: {
          CURRENT: {
            path,
            tables: [
              { name: 'parent', atomicGroup: 'move' },
              { name: 'child', atomicGroup: 'move' },
            ],
          },
        },
      }
      const atomic = await captureNetSqlitePlan(grouped)
      expect(atomic.summary.statements).toBe(3)
      expect(emitted).toBe(2)
    })
  }
})

test('Address3D ownership moves preserve unchanged locales across bounded delivery transactions', async () => {
  await fixture(async ({ db, path }) => {
    db.exec(`CREATE TABLE address2d(snapshotId TEXT, id TEXT, PRIMARY KEY(snapshotId,id));
      CREATE TABLE address3d(snapshotId TEXT, id TEXT, address2dId TEXT,
        PRIMARY KEY(snapshotId,id), UNIQUE(snapshotId,address2dId),
        FOREIGN KEY(snapshotId,address2dId) REFERENCES address2d(snapshotId,id) ON DELETE CASCADE);
      CREATE TABLE address3dI18n(snapshotId TEXT, address3dId TEXT, locale TEXT, name TEXT,
        PRIMARY KEY(snapshotId,address3dId,locale),
        FOREIGN KEY(snapshotId,address3dId) REFERENCES address3d(snapshotId,id) ON DELETE CASCADE);
      INSERT INTO address2d VALUES('scope','old-owner');
      INSERT INTO address3d VALUES('scope','collection','old-owner');
      INSERT INTO address3dI18n VALUES('scope','collection','en','old'),('scope','collection','zh','unchanged'),('scope','collection','fr','removed');`)
    const policies: NetTablePolicy[] = [
      { name: 'address2d' },
      {
        name: 'address3d',
        collection: { name: 'collection', keyColumns: ['snapshotId', 'id'] },
      },
      {
        name: 'address3dI18n',
        collection: { name: 'collection', keyColumns: ['snapshotId', 'address3dId'] },
      },
    ]
    const payloads: NetStatement[][] = []
    const prepared = await captureNetSqlitePlan({
      targets: { CURRENT: { path, tables: policies } },
      limits: { maxStatements: 4 },
      generate: async candidates => {
        candidates.CURRENT?.db.exec(`INSERT INTO address2d VALUES('scope','new-owner');
          UPDATE address3d SET address2dId='new-owner';
          UPDATE address3dI18n SET name='edited' WHERE locale='en';
          DELETE FROM address3dI18n WHERE locale='fr';
          DELETE FROM address2d WHERE id='old-owner';`)
      },
      append: async (_target, bytes) => {
        payloads.push(JSON.parse(Buffer.from(bytes).toString()))
      },
    })
    expect(prepared.summary.statements).toBe(5)
    expect(payloads.map(payload => payload.length)).toEqual([1, 4, 1])
    expect(payloads[0]?.[0]?.sql).toStartWith('INSERT INTO "address2d"')
    expect(payloads[2]?.[0]?.sql).toStartWith('DELETE FROM "address2d"')
    expect(db.query('SELECT address2dId FROM address3d').get()).toEqual({
      address2dId: 'old-owner',
    })
    const before =
      db.query<{ n: number }, []>('SELECT total_changes() AS n').get()?.n ?? 0
    for (const payload of payloads)
      db.transaction(() => {
        for (const statement of payload)
          db.query(statement.sql).run(...statement.params)
      })()
    const after =
      db.query<{ n: number }, []>('SELECT total_changes() AS n').get()?.n ?? 0
    expect(after - before).toBe(5)
    expect(db.query('SELECT address2dId FROM address3d').get()).toEqual({
      address2dId: 'new-owner',
    })
    expect(
      db.query('SELECT locale,name FROM address3dI18n ORDER BY locale').all(),
    ).toEqual([
      { locale: 'en', name: 'edited' },
      { locale: 'zh', name: 'unchanged' },
    ])
  })
})

test('retirement ordering propagates through cascaded ancestors without deleting moved descendants', async () => {
  await fixture(async ({ db, path }) => {
    db.exec(`CREATE TABLE estate(id TEXT PRIMARY KEY);
      CREATE TABLE building(id TEXT PRIMARY KEY, estateId TEXT REFERENCES estate(id) ON DELETE CASCADE);
      CREATE TABLE unit(id TEXT PRIMARY KEY, buildingId TEXT REFERENCES building(id) ON DELETE CASCADE);
      INSERT INTO estate VALUES('old-estate'); INSERT INTO building VALUES('old-building','old-estate'); INSERT INTO unit VALUES('unit','old-building');`)
    const statements: NetStatement[] = []
    const result = await captureNetSqlitePlan({
      targets: {
        CURRENT: {
          path,
          tables: [{ name: 'estate' }, { name: 'building' }, { name: 'unit' }],
        },
      },
      limits: { maxStatements: 2 },
      generate: async candidates => {
        candidates.CURRENT?.db.exec(`INSERT INTO estate VALUES('new-estate'); INSERT INTO building VALUES('new-building','new-estate');
          UPDATE unit SET buildingId='new-building'; DELETE FROM building WHERE id='old-building'; DELETE FROM estate WHERE id='old-estate';`)
      },
      append: async (_target, bytes) => {
        statements.push(...JSON.parse(Buffer.from(bytes).toString()))
      },
    })
    expect(result.summary.statements).toBe(5)
    expect(
      statements.map(
        statement => statement.sql.match(/(?:INTO|UPDATE|FROM) "([^"]+)"/)?.[1],
      ),
    ).toEqual(['estate', 'building', 'unit', 'building', 'estate'])
  })
})

test('implicit referential updates cannot silently add duplicate remote writes', async () => {
  await fixture(async ({ db, path }) => {
    db.exec(`CREATE TABLE parent(id TEXT PRIMARY KEY, name TEXT UNIQUE);
      CREATE TABLE child(id TEXT PRIMARY KEY, parentName TEXT REFERENCES parent(name) ON UPDATE CASCADE);
      INSERT INTO parent VALUES('parent','old'); INSERT INTO child VALUES('child','old');`)
    let emitted = false
    await expect(
      captureNetSqlitePlan({
        targets: { CURRENT: { path, tables: [{ name: 'parent' }, { name: 'child' }] } },
        generate: async candidates => {
          candidates.CURRENT?.db.exec("UPDATE parent SET name='new'")
        },
        append: async () => {
          emitted = true
        },
      }),
    ).rejects.toThrow('referential updates')
    expect(emitted).toBe(false)
  })
})
