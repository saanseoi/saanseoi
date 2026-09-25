import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migrations = {
  meta: '20260925084655_happy_preak',
  current: '20260925084655_neat_mikhail_rasputin',
  history: '20260925084721_gifted_shooting_star',
  source: '20260925084710_unknown_taskmaster',
}

function beforeRename(family: keyof typeof migrations) {
  const db = new Database(':memory:')
  const root = resolve(import.meta.dir, '../migrations', family)
  for (const name of readdirSync(root).sort()) {
    if (name >= migrations[family]) break
    db.exec(readFileSync(resolve(root, name, 'migration.sql'), 'utf8'))
  }
  return {
    db,
    migrate: () =>
      db.exec(readFileSync(resolve(root, migrations[family], 'migration.sql'), 'utf8')),
  }
}

test('resource release rename preserves parent identity, siblings and dependent metadata', () => {
  const { db, migrate } = beforeRename('meta')
  try {
    db.exec(`PRAGMA foreign_keys=ON;
      INSERT INTO publishers(id,code,versionHash) VALUES ('publisher','publisher','hash');
      INSERT INTO datasets(id,publisherId,code,regionCode,releaseType,releaseFrequency,theme,versionHash)
        VALUES ('dataset','publisher','dataset','hk','snapshot','monthly','geographic','hash');
      INSERT INTO sourceReleases(id,datasetId,code,sourceVersion,status)
        VALUES ('source','dataset','source','2026','published');
      INSERT INTO releases(id,sourceReleaseId,datasetId,code,resourceType,sourceVersion,status)
        VALUES ('division','source','dataset','division','division','2026','published'),
               ('area','source','dataset','area','divisionArea','2026','published');
      INSERT INTO processingRuns(runId,releaseId,phase,status,startedAt)
        VALUES ('run','division','process','completed','2026-01-01');
      INSERT INTO stats(id,releaseId,dimension,metric,metricUnit,value)
        VALUES ('stat','area','rows','processing','count',7);
      INSERT INTO releaseProvenance(releaseId,manifestHash,byteLength,applicationCount)
        VALUES ('division','manifest',123,4);
      INSERT INTO releaseProcessingActions(id,releaseId,action,mode,generation,decisionCount,affectedRecordCount)
        VALUES ('action','division','accept','automatic','generation',2,2);
    `)
    migrate()
    expect(
      db.query('SELECT id, sourceReleaseId FROM resourceReleases ORDER BY id').all(),
    ).toEqual([
      { id: 'area', sourceReleaseId: 'source' },
      { id: 'division', sourceReleaseId: 'source' },
    ])
    expect(db.query('SELECT id FROM sourceReleases').all()).toEqual([{ id: 'source' }])
    expect(db.query('SELECT resourceReleaseId FROM processingRuns').get()).toEqual({
      resourceReleaseId: 'division',
    })
    expect(db.query('SELECT resourceReleaseId, value FROM stats').get()).toEqual({
      resourceReleaseId: 'area',
      value: 7,
    })
    expect(
      db.query('SELECT resourceReleaseId, manifestHash FROM releaseProvenance').get(),
    ).toEqual({ resourceReleaseId: 'division', manifestHash: 'manifest' })
    expect(
      db
        .query('SELECT resourceReleaseId, decisionCount FROM releaseProcessingActions')
        .get(),
    ).toEqual({ resourceReleaseId: 'division', decisionCount: 2 })
    expect(
      db.query("SELECT name FROM sqlite_master WHERE name='releases'").all(),
    ).toEqual([])
    expect(db.query('PRAGMA foreign_key_check').all()).toEqual([])
    expect(() => db.exec("DELETE FROM sourceReleases WHERE id='source'")).toThrow()
  } finally {
    db.close()
  }
})

for (const family of ['current', 'history', 'source'] as const) {
  test(`${family} resource release columns preserve retained row contents`, () => {
    const { db, migrate } = beforeRename(family)
    try {
      const tables = db
        .query("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as { name: string }[]
      const retained = new Map<string, Record<string, unknown>[]>()
      for (const { name } of tables) {
        const columns = db.query(`PRAGMA table_info("${name}")`).all() as {
          name: string
          type: string
          notnull: number
          dflt_value: unknown
          pk: number
        }[]
        if (!columns.some(column => column.name === 'releaseId')) continue
        const required = columns.filter(
          column =>
            column.name === 'releaseId' ||
            ((column.notnull || column.pk) && column.dflt_value === null),
        )
        db.query(
          `INSERT INTO "${name}" (${required.map(column => `"${column.name}"`).join(',')}) VALUES (${required.map(() => '?').join(',')})`,
        ).run(
          ...required.map(column =>
            column.name === 'releaseId'
              ? 'resource'
              : /INT|REAL/i.test(column.type)
                ? 1
                : 'retained',
          ),
        )
        retained.set(
          name,
          db.query(`SELECT * FROM "${name}"`).all() as Record<string, unknown>[],
        )
      }
      expect(retained.size).toBeGreaterThan(0)
      migrate()
      for (const [name, rows] of retained) {
        expect(db.prepare(`SELECT * FROM "${name}"`).all()).toEqual(
          rows.map(({ releaseId, ...row }) => ({
            ...row,
            resourceReleaseId: releaseId,
          })),
        )
      }
      expect(db.query('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      db.close()
    }
  })
}
