import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { backfillDivisionPoints } from './backfill-division-points'

test('repairs each snapshot event independently and is idempotent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'division-points-'))
  const path = join(dir, 'history.sqlite')
  const db = new Database(path)
  try {
    db.exec(`CREATE TABLE divisions (id TEXT, geometry TEXT, bbox TEXT, versionHash TEXT, isCurrent INTEGER, snapshotId TEXT, PRIMARY KEY(id,snapshotId));
      CREATE VIEW historyEvents AS SELECT 'division' AS recordType,id AS recordId,versionHash,snapshotId FROM divisions;
      CREATE TABLE divisionAreas(id TEXT,geometry TEXT);`)
    for (const [index, n] of [1, 2].entries()) {
      const polygon = JSON.stringify({
        type: 'Polygon',
        coordinates: [
          [
            [-n, -n],
            [n, -n],
            [n, n],
            [-n, n],
            [-n, -n],
          ],
        ],
      })
      db.query('INSERT INTO divisions VALUES (?,?,?,?,?,?)').run(
        'division',
        polygon,
        JSON.stringify([-n, -n, n, n]),
        `old-${index}`,
        index,
        `snapshot-${index}`,
      )
      db.query('INSERT INTO divisionAreas VALUES (?,?)').run(`area-${index}`, polygon)
    }
    const original = db.query('SELECT * FROM divisions ORDER BY versionHash').all()
    const areas = db.query('SELECT * FROM divisionAreas').all()
    const plan = await backfillDivisionPoints([path], join(dir, 'plan'))
    expect(plan.changed).toBe(2)
    expect(db.query('SELECT count(*) AS n FROM divisions').get()).toEqual({ n: 2 })
    const receipt = await backfillDivisionPoints([path], join(dir, 'apply'), true)
    expect(receipt).toMatchObject({
      applied: true,
      changed: 2,
      mergedVersions: 0,
      replayReferences: 0,
    })
    const rows = db.query('SELECT * FROM divisions').all() as any[]
    expect(rows).toHaveLength(2)
    expect(JSON.parse(rows[0].geometry)).toEqual({ type: 'Point', coordinates: [0, 0] })
    expect(rows.map(row => row.isCurrent).sort()).toEqual([0, 1])
    expect(db.query('SELECT DISTINCT versionHash FROM historyEvents').all()).toEqual([
      { versionHash: rows[0].versionHash },
    ])
    expect(db.query('SELECT * FROM divisionAreas').all()).toEqual(areas)
    expect((await backfillDivisionPoints([path], join(dir, 'repeat'))).changed).toBe(0)
    const restore = new Database(':memory:')
    restore.exec(readFileSync(join(dir, 'apply', 'rollback.sql'), 'utf8'))
    restore.close()
    expect(db.query('SELECT * FROM divisions ORDER BY versionHash').all()).toEqual(
      original,
    )
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
