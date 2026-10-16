import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { backfillStatisticIdentities } from './backfill-statistic-identities'
import { statisticContentHash } from '../apps/harbour-cli/src/lib/pipeline/statistics/planCanonicalStatistics'
import { canonicalStatisticId } from '../libs/db/src/canonicalIdentity'
const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'stats-identities-'))
  roots.push(root)
  const input = {
    datasetCode: 'dataset',
    referencePeriodCode: '2021',
    geography: { kind: 'district', code: 'NTH' },
  }
  const basis = {
    ...input,
    geography: { ...input.geography, class: null, namespace: null },
  }
  const oldId = `stats:${createHash('sha256').update(JSON.stringify(basis)).digest('hex')}`
  const content = {
    ...input,
    id: oldId,
    divisionId: null,
    referencePeriodStart: '2021-01-01',
    referencePeriodEnd: '2021-12-31',
    referencePeriodEndYear: '2021',
    referencePeriodGranularity: 'year',
    values: { population: 123 },
    fieldDefinitionHashes: { population: 'definition' },
  }
  const hash = statisticContentHash(content as any)
  const paths = ['current', 'history'].map(name => {
    const path = join(root, `${name}.sqlite`)
    const db = new Database(path)
    db.exec(`CREATE TABLE statsRecords(id TEXT, snapshotId TEXT, operation TEXT, versionHash TEXT, datasetCode TEXT, referencePeriodCode TEXT, geography TEXT, divisionId TEXT, referencePeriodStart TEXT, referencePeriodEnd TEXT, referencePeriodEndYear TEXT, referencePeriodGranularity TEXT, "values" TEXT, definitionSetId TEXT, PRIMARY KEY(id,snapshotId));
    CREATE TABLE statsDefinitionSets(id TEXT PRIMARY KEY, fieldDefinitionHashes TEXT);
    INSERT INTO statsDefinitionSets VALUES ('defs','{"population":"definition"}');
    CREATE VIEW historyEvents AS SELECT id recordId,versionHash,snapshotId,operation FROM statsRecords;`)
    db.query('INSERT INTO statsRecords VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
      oldId,
      'snapshot',
      'upsert',
      hash,
      input.datasetCode,
      input.referencePeriodCode,
      JSON.stringify(input.geography),
      null,
      content.referencePeriodStart,
      content.referencePeriodEnd,
      content.referencePeriodEndYear,
      content.referencePeriodGranularity,
      JSON.stringify(content.values),
      'defs',
    )
    if (name === 'history')
      db.query('INSERT INTO statsRecords(id,snapshotId,operation) VALUES (?,?,?)').run(
        oldId,
        'deleted',
        'delete',
      )
    db.close()
    return path
  })
  return { root, paths, oldId, hash, content, id: canonicalStatisticId(input) }
}
test('backfill repairs identities, content hashes and inline events; reruns are empty and rollback restores rows', () => {
  const f = fixture()
  expect(backfillStatisticIdentities(f.paths, join(f.root, 'dry')).rows).toBe(3)
  const result = backfillStatisticIdentities(f.paths, join(f.root, 'apply'), true)
  expect(result.identities).toBe(1)
  for (const path of f.paths) {
    const db = new Database(path)
    expect(
      db
        .query(
          "SELECT recordId,versionHash FROM historyEvents WHERE operation='upsert'",
        )
        .get(),
    ).toEqual({
      recordId: f.id,
      versionHash: statisticContentHash({ ...f.content, id: f.id } as any),
    })
    db.close()
  }
  expect(backfillStatisticIdentities(f.paths, join(f.root, 'again'), true).rows).toBe(0)
  const db = new Database(':memory:')
  db.exec(readFileSync(join(f.root, 'apply/rollback.sql'), 'utf8'))
  expect(db.query('SELECT DISTINCT id FROM d1.statsRecords').all()).toEqual([
    { id: f.oldId },
  ])
  expect(
    db.query("SELECT versionHash FROM d1.statsRecords WHERE operation='delete'").get(),
  ).toEqual({ versionHash: null })
  db.close()
})
test('hash mismatches abort before modifying any database', () => {
  const f = fixture()
  const db = new Database(f.paths[1])
  db.exec("UPDATE statsRecords SET versionHash='incorrect' WHERE operation='upsert'")
  db.close()
  expect(() => backfillStatisticIdentities(f.paths, join(f.root, 'bad'), true)).toThrow(
    'Existing content hash mismatch',
  )
  const current = new Database(f.paths[0])
  expect(current.query('SELECT id,versionHash FROM statsRecords').get()).toEqual({
    id: f.oldId,
    versionHash: f.hash,
  })
  current.close()
})
