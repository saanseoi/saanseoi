import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { createLocalHarbourDb } from '@repo/core/testing/localDb'
import { buildCenstatdSourceRecordChurn } from './censtatdSourceRecordChurn'

function fixture() {
  const meta = new Database(':memory:')
  const sources = [new Database(':memory:'), new Database(':memory:')]
  meta.exec(`CREATE TABLE resourceReleaseDetails (id TEXT, datasetId TEXT, datasetCode TEXT, resourceType TEXT, sourceVersion TEXT, status TEXT, revokedAt TEXT);
    CREATE TABLE stats (resourceReleaseId TEXT, category TEXT, measure TEXT, dimension TEXT, value INTEGER);
    INSERT INTO resourceReleaseDetails VALUES ('new','dataset','dataset-code','divisionStatistic','2026-Q2','processing',NULL);`)
  for (const db of sources)
    db.exec(
      `CREATE TABLE hkgovCenstatdStatistics (datasetCode TEXT, resourceReleaseId TEXT, sourceRecordId TEXT, versionHash TEXT, properties TEXT, geometryId TEXT);`,
    )
  const insert = (
    shard: number,
    release: string,
    id: string,
    properties: unknown,
    geometry = 'geometry',
    hash = id,
  ) =>
    sources[shard]!.query(
      'INSERT INTO hkgovCenstatdStatistics VALUES (?,?,?,?,?,?)',
    ).run('dataset-code', release, id, hash, JSON.stringify(properties), geometry)
  const previous = (count: number) => {
    meta.exec(`INSERT INTO resourceReleaseDetails VALUES ('old','dataset','dataset-code','divisionStatistic','2024','archived',NULL);
      INSERT INTO stats VALUES ('old','records','count',NULL,${count});`)
  }
  const run = async (expectedRecords: number) => {
    const rows = await buildCenstatdSourceRecordChurn({
      metaDb: createLocalHarbourDb(meta),
      sourceDbs: sources.map(createLocalHarbourDb),
      resourceReleaseId: 'new',
      datasetCode: 'dataset-code',
      expectedRecords,
    })
    return Object.fromEntries(
      rows
        .filter(row => row.category === 'changes' && !row.dimension)
        .map(row => [row.measure, row.value]),
    )
  }
  return {
    meta,
    sources,
    insert,
    previous,
    run,
    close: () => {
      meta.close()
      for (const db of sources) db.close()
    },
  }
}

test('C&SD source churn counts retained records across shards and exact release ownership, including changed values and geometry', async () => {
  const f = fixture()
  try {
    f.previous(4)
    for (const id of ['same', 'value', 'geometry', 'removed'])
      f.insert(0, 'old', id, { year: '2023', value: '10' })
    f.insert(
      1,
      'new',
      'same',
      { value: '10', year: '2023' },
      'geometry',
      'new-storage-hash',
    )
    f.insert(1, 'new', 'value', { year: '2023', value: '11' })
    f.insert(1, 'new', 'geometry', { year: '2023', value: '10' }, 'different-geometry')
    f.insert(1, 'new', 'added', { year: '2025', value: '12' })
    f.sources[1]!.exec(
      `INSERT INTO hkgovCenstatdStatistics VALUES ('other-dataset','new','decoy','hash','{}','geometry')`,
    )
    f.meta.exec(
      `INSERT INTO resourceReleaseDetails VALUES ('future','dataset','dataset-code','divisionStatistic','2027','current',NULL),('revoked','dataset','dataset-code','divisionStatistic','2026-Q1','archived','revoked')`,
    )
    const expected = {
      count: 4,
      added_count: 1,
      changed_count: 2,
      removed_count: 1,
      unchanged_count: 1,
    }
    expect(await f.run(4)).toEqual(expected)
    expect(await f.run(4)).toEqual(expected)
  } finally {
    f.close()
  }
})

test('first C&SD release records all additions, and large inventories paginate without omissions', async () => {
  const f = fixture()
  try {
    for (let i = 0; i < 1005; i++)
      f.insert(1, 'new', `record-${String(i).padStart(4, '0')}`, { year: '2025' })
    expect(await f.run(1005)).toEqual({
      count: 1005,
      added_count: 1005,
      changed_count: 0,
      removed_count: 0,
      unchanged_count: 0,
    })
  } finally {
    f.close()
  }
})

test('missing or conflicting retained records fail instead of publishing invented change counts', async () => {
  const f = fixture()
  try {
    f.previous(2)
    f.insert(0, 'old', 'one', {})
    f.insert(1, 'new', 'one', {})
    await expect(f.run(1)).rejects.toThrow('Incomplete retained')
    f.insert(0, 'old', 'two', {})
    await expect(f.run(2)).rejects.toThrow('Expected 2 retained')
    f.insert(1, 'new', 'one', { changed: true }, 'geometry', 'other-hash')
    await expect(f.run(1)).rejects.toThrow('Ambiguous C&SD source identity')
  } finally {
    f.close()
  }
})
