import { placeDivisionFieldNames } from '@repo/db'
import { Database, type SQLQueryBindings } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { countAddressRecordsCurrent, listAddressRecordsCurrent } from './addresses'
import { listReplayedDivisionRecords } from './divisions'
import { countPlaceRecordsCurrent, listPlaceRecordsCurrent } from './places'

function migratedDatabase(family: 'current' | 'history' | 'source') {
  const sqlite = new Database(':memory:')
  const root = resolve(import.meta.dir, '../../../../libs/db/migrations', family)
  for (const name of readdirSync(root).sort()) {
    sqlite.exec(readFileSync(resolve(root, name, 'migration.sql'), 'utf8'))
  }
  return sqlite
}

function plan(sqlite: Database, query: string, params: SQLQueryBindings[] = []) {
  return sqlite
    .query(`EXPLAIN QUERY PLAN ${query}`)
    .all(...params)
    .map(row => (row as { detail: string }).detail)
    .join('\n')
}

test('Address division UNION preserves scoped identity, filters and global pagination using role indexes', async () => {
  const sqlite = migratedDatabase('current')
  const roles = [
    'countryId',
    'islandId',
    'areaId',
    'districtId',
    'townId',
    'ruralAreaId',
    'macrohoodId',
    'neighbourhoodId',
    'microhoodId',
    'villageId',
    'hamletId',
  ]
  try {
    sqlite.exec(`
      PRAGMA foreign_keys = ON;
      INSERT INTO divisions(scopeId,id,class,hierarchies)
      VALUES ('divisions','target','district','{}'),('divisions','hk','country','{}');
      INSERT INTO addressPublicationState(scopeId,snapshotId,status,publicationToken,preparedAt)
      VALUES ('s1','p1','current','t1','ready'),('s2','p2','current','t2','ready'),
             ('outside','p3','current','t3','ready'),('pending','p4','publishing','t4','ready');
      INSERT INTO address2d(scopeId,divisionSnapshotId,id,granularity,countryId,districtId,townId)
      VALUES ('s1','divisions','same','building','hk','target','target'),
             ('s2','divisions','same','building','hk','target',NULL),
             ('s1','divisions','unmatched','building','hk',NULL,NULL),
             ('s2','divisions','unmatched','building','hk','target',NULL),
             ('outside','divisions','outside','building','hk','target',NULL),
             ('pending','divisions','pending','building','hk','target',NULL);
    `)
    for (const [i, role] of roles.entries()) {
      sqlite
        .query(`INSERT INTO address2d(scopeId,divisionSnapshotId,id,granularity,${role})
        VALUES ('s1','divisions',?,'building','target')`)
        .run(`r${i}`)
    }
    const plans: string[] = []
    const db = drizzle({
      client: sqlite,
      logger: {
        logQuery(query, params) {
          // Hundreds of logical snapshots still occupy fixed JSON parameters.
          expect(params.length).toBeLessThan(30)
          plans.push(plan(sqlite, query, params as SQLQueryBindings[]))
        },
      },
    })
    const lookup = {
      snapshotIds: [
        'p1',
        'p2',
        'p4',
        ...Array.from({ length: 150 }, (_, i) => `absent${i}`),
      ],
      divisionId: 'target',
    }
    const list = (
      extra: Partial<Parameters<typeof listAddressRecordsCurrent>[1]> = {},
    ) =>
      listAddressRecordsCurrent(db as never, {
        ...lookup,
        localeSelection: { mode: 'none', locales: [] },
        limit: 100,
        ...extra,
      })
    const keys = (rows: Awaited<ReturnType<typeof list>>) =>
      rows.map(row => [row.address.snapshotId, row.address.id])
    const expected = [
      ...roles
        .map((_, i) => `r${i}`)
        .sort()
        .map(id => ['p1', id]),
      ['p1', 'same'],
      ['p2', 'same'],
      ['p2', 'unmatched'],
    ]
    expect(await countAddressRecordsCurrent(db as never, lookup)).toBe(roles.length + 3)
    expect(keys(await list())).toEqual(expected)
    expect(keys(await list({ limit: 2, offset: 9 }))).toEqual(expected.slice(9, 11))
    expect(keys(await list({ limit: 2, offset: 11 }))).toEqual(expected.slice(11, 13))
    expect(keys(await list({ after: 'r8', limit: 2 }))).toEqual([
      ['p1', 'r9'],
      ['p1', 'same'],
    ])
    expect(keys(await list({ countryId: 'hk', districtId: 'target' }))).toEqual(
      expected.slice(roles.length),
    )
    expect(
      await countAddressRecordsCurrent(db as never, {
        ...lookup,
        countryId: 'hk',
        districtId: 'target',
      }),
    ).toBe(3)
    expect(await list({ snapshotIds: [] })).toEqual([])
    expect(
      await countAddressRecordsCurrent(db as never, { ...lookup, snapshotIds: [] }),
    ).toBe(0)
    expect(await list({ divisionId: 'missing' })).toEqual([])
    for (const queryPlan of plans) {
      for (const role of roles) {
        expect(queryPlan).toContain(
          `COVERING INDEX address2d_${role}_scope_id_idx (${role}=? AND scopeId=?)`,
        )
      }
      expect(queryPlan).not.toMatch(/SCAN address2d\b/)
    }
    // Foreign-key checks seek the Division scope, independently of Address roles.
    for (const role of roles) {
      expect(
        plan(
          sqlite,
          `SELECT rowid FROM address2d WHERE divisionSnapshotId=? AND ${role}=?`,
          ['divisions', 'target'],
        ),
      ).toContain('address2d_divisionSnapshotId_idx (divisionSnapshotId=?)')
    }
    expect(() => sqlite.exec("DELETE FROM divisions WHERE id='target'")).toThrow(
      'FOREIGN KEY',
    )
    expect(sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
  } finally {
    sqlite.close()
  }
})

test('CURRENT filter indexes also serve deterministic list ordering', () => {
  const sqlite = migratedDatabase('current')
  try {
    const divisionPlan = plan(
      sqlite,
      'SELECT id FROM divisions WHERE scopeId = ? AND level = ? ORDER BY level, class, id LIMIT 25',
      ['scope', 3],
    )
    expect(divisionPlan).toContain('COVERING INDEX divisions_scope_order_idx')
    expect(divisionPlan).not.toContain('TEMP B-TREE')
    for (const [column, index] of [
      ['basicCategory', 'places_category_id_nonnull_idx'],
      ['taxonomyPrimary', 'places_taxonomy_id_nonnull_idx'],
      ['operatingStatus', 'places_status_id_nonnull_idx'],
    ]) {
      const queryPlan = plan(
        sqlite,
        `SELECT id FROM places WHERE scopeId = ? AND ${column} = ? ORDER BY id LIMIT 25`,
        ['scope', 'value'],
      )
      expect(queryPlan).toContain(`COVERING INDEX ${index}`)
      expect(queryPlan).not.toContain('TEMP B-TREE')
    }
  } finally {
    sqlite.close()
  }
})

test('Place division filtering uses the reverse index and preserves scope, count and pagination', async () => {
  const sqlite = migratedDatabase('current')
  try {
    sqlite.exec(`
      INSERT INTO placePublicationState(scopeId,snapshotId,status,publicationToken,preparedAt)
      VALUES ('scope','publication','current','token','2026-09-23'),
             ('other','other-publication','current','other-token','2026-09-23');
      INSERT INTO places(scopeId,id,resourceReleaseId,geometry,firstSeenMonth,basicCategory)
      VALUES ('scope','a','release',json_object('type','Point','coordinates',json_array(114,22)),'2026-01','shop'),
             ('scope','b','release',json_object('type','Point','coordinates',json_array(114,22)),'2026-01','shop'),
             ('scope','c','release',json_object('type','Point','coordinates',json_array(114,22)),'2026-01','shop'),
             ('other','a','release',json_object('type','Point','coordinates',json_array(114,22)),'2026-01','shop');
      UPDATE places SET districtId=CASE WHEN id='b' THEN 'elsewhere' ELSE 'target' END;

    `)
    const plans: string[] = []
    const db = drizzle({
      client: sqlite,
      logger: {
        logQuery(query, params) {
          plans.push(plan(sqlite, query, params as SQLQueryBindings[]))
        },
      },
    })
    const lookup = {
      snapshotId: 'publication',
      divisionId: 'target',
      basicCategory: 'shop',
    }
    expect(await countPlaceRecordsCurrent(db as never, lookup)).toBe(2)
    const rows = await listPlaceRecordsCurrent(db as never, {
      ...lookup,
      localeSelection: { mode: 'none', locales: [] },
      limit: 1,
      offset: 1,
    })
    expect(rows.map(row => [row.place.snapshotId, row.place.id])).toEqual([
      ['publication', 'c'],
    ])
    expect(
      await countPlaceRecordsCurrent(db as never, { ...lookup, divisionId: 'missing' }),
    ).toBe(0)
    for (const queryPlan of plans) {
      for (const field of placeDivisionFieldNames)
        expect(queryPlan).toContain(`COVERING INDEX places_${field}_id_nonnull_idx`)
      expect(queryPlan).not.toContain('SCAN places')
    }
  } finally {
    sqlite.close()
  }
})

test('Division replay seeks exact identity/version/locale tuples across batches', async () => {
  const sqlite = migratedDatabase('history')
  try {
    const insert = sqlite.prepare(`INSERT INTO divisions
      (id,versionHash,class,hierarchies,snapshotId,isCurrent)
      VALUES (?,?,'district','{}',?2,0)`)
    const insertName = sqlite.prepare(`INSERT INTO divisionsI18n
      (divisionId,versionHash,locale,name,meta,snapshotId,isCurrent)
      VALUES (?,?,'en',?,json_object('isLocaleInferred',json(CASE 0 WHEN 1 THEN 'true' ELSE 'false' END)),?2,0)`)
    for (let i = 0; i < 300; i++) {
      insert.run(`d${i}`, 'selected')
      insert.run(`d${i}`, 'other')
      insertName.run(`d${i}`, 'selected', `Name ${i}`)
      insertName.run(`d${i}`, 'other', 'Wrong revision')
    }
    // A shared hash is not a globally unique record identifier.
    insert.run('unselected', 'selected')
    insertName.run('unselected', 'selected', 'Unselected')
    const plans: string[] = []
    const db = drizzle({
      client: sqlite,
      logger: {
        logQuery(query, params) {
          expect(params).toHaveLength(1)
          plans.push(plan(sqlite, query, params as SQLQueryBindings[]))
        },
      },
    })
    const versions = Array.from({ length: 300 }, (_, i) =>
      ['division', 'divisionI18n'].map(recordType => ({
        sourceReleaseId: 'release',
        recordType,
        recordId: `d${i}`,
        versionHash: 'selected',
        snapshotId: 'selected',
        locale: recordType === 'division' ? '' : 'en',
        shard: { bindingName: 'HISTORY', db: db as never },
      })),
    ).flat()
    const rows = await listReplayedDivisionRecords(versions, 'publication', {
      mode: 'all',
      locales: ['*'],
    })
    expect(rows).toHaveLength(300)
    for (const row of rows)
      expect(row.i18n.en?.name).toBe(`Name ${row.division.id.slice(1)}`)
    expect(plans).toHaveLength(4)
    for (const queryPlan of plans) {
      expect(queryPlan).toContain('USING INDEX sqlite_autoindex_divisions')
      expect(queryPlan).not.toMatch(/SCAN divisions/)
    }
    await expect(
      listReplayedDivisionRecords(
        [
          {
            ...versions[0]!,
            versionHash: 'missing',
          },
        ],
        'publication',
        { mode: 'all', locales: ['*'] },
      ),
    ).rejects.toThrow('history versions are unavailable')
  } finally {
    sqlite.close()
  }
})

test('SOURCE partial indexes support active scans, reconciliation and multiple open assertions', () => {
  const sqlite = migratedDatabase('source')
  try {
    sqlite.exec(`INSERT INTO hkgovAlsAddresses2d
      (sourceRecordId,versionHash,resourceReleaseId,validFromRelease,isCurrent)
      VALUES ('a','v1','r1','1',0),('a','v2','r2','2',1),('a','v3','r2','2',1)`)
    const scan = 'SELECT sourceRecordId FROM hkgovAlsAddresses2d WHERE isCurrent = ?'
    const lookup = `${scan} AND sourceRecordId = ?`
    expect(plan(sqlite, scan, [1])).toContain('hkgovAlsAddresses2d_open_records_idx')
    expect(plan(sqlite, lookup, [1, 'a'])).toContain(
      'hkgovAlsAddresses2d_open_records_idx',
    )
    expect(sqlite.query(lookup).all(1, 'a')).toHaveLength(2)
    sqlite
      .query(
        'UPDATE hkgovAlsAddresses2d SET isCurrent = 0, validToRelease = ? WHERE sourceRecordId = ? AND isCurrent = ?',
      )
      .run('3', 'a', 1)
    expect(sqlite.query(scan).all(1)).toHaveLength(0)
    expect(sqlite.query('SELECT * FROM hkgovAlsAddresses2d').all()).toHaveLength(3)
    expect(
      plan(sqlite, 'SELECT * FROM hkgovAlsAddresses2d WHERE sourceRecordId = ?', ['a']),
    ).toContain('sqlite_autoindex_hkgovAlsAddresses2d')
    expect(sqlite.query('PRAGMA integrity_check').get()).toEqual({
      integrity_check: 'ok',
    })
  } finally {
    sqlite.close()
  }
})

test('migrations retain sparse Place filters without redundant history or name indexes', () => {
  const current = migratedDatabase('current')
  const history = migratedDatabase('history')
  try {
    const filters = current.query('PRAGMA index_list(places)').all() as {
      name: string
      partial: number
    }[]
    const sparse = filters.filter(row => row.name.endsWith('_id_nonnull_idx'))
    expect(sparse).toHaveLength(placeDivisionFieldNames.length + 3)
    expect(sparse.every(row => row.partial === 1)).toBe(true)
    expect(
      current
        .query("SELECT name FROM sqlite_schema WHERE name='placesI18n_name_idx'")
        .all(),
    ).toHaveLength(0)
    const indexes = history
      .query(
        "SELECT name,tbl_name,sql FROM sqlite_schema WHERE type='index' AND sql IS NOT NULL",
      )
      .all() as { name: string; tbl_name: string; sql: string }[]
    expect(indexes.some(row => row.name.endsWith('_current_lookup_idx'))).toBe(false)
    for (const row of indexes.filter(row =>
      row.name.endsWith('_history_event_snapshot_idx'),
    )) {
      const siblings = indexes.filter(other => other.tbl_name === row.tbl_name)
      const sameKeys = siblings.filter(
        other =>
          JSON.stringify(history.query(`PRAGMA index_info("${other.name}")`).all()) ===
          JSON.stringify(history.query(`PRAGMA index_info("${row.name}")`).all()),
      )
      expect(sameKeys).toHaveLength(1)
    }
  } finally {
    current.close()
    history.close()
  }
})
