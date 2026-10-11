import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { backfillDivisionWikidata } from './backfill-division-wikidata'

test('ports Wikidata, repairs replay hashes, drops the column and is idempotent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'division-wikidata-test-'))
  const path = join(dir, 'history.sqlite')
  const db = new Database(path)
  try {
    db.exec(`CREATE TABLE divisions (id TEXT, identifiers TEXT, wikidata TEXT, hierarchies TEXT, class TEXT, versionHash TEXT, PRIMARY KEY(id,versionHash));
      CREATE TABLE snapshotVersionChanges (recordType TEXT,recordId TEXT,versionHash TEXT);
      CREATE TABLE ssDivision (sourceRecordId TEXT, properties TEXT, versionHash TEXT);
      CREATE TABLE sourceResolutions (sourceRecordId TEXT,sourceVersionHash TEXT);`)
    db.query('INSERT INTO divisions VALUES (?,?,?,?,?,?)').run(
      'village',
      '{"overture":{"divisionId":"native"}}',
      'Q123',
      '{"full":[]}',
      'village',
      'old',
    )
    db.exec("INSERT INTO snapshotVersionChanges VALUES ('division','village','old')")
    db.query('INSERT INTO ssDivision VALUES (?,?,?)').run(
      'village',
      '{"id":"village","wikidata":"Q123","identifiers":{"overture":{"divisionId":"native"}}}',
      'source-old',
    )
    db.exec("INSERT INTO sourceResolutions VALUES ('village','source-old')")
    const plan = await backfillDivisionWikidata([path], join(dir, 'dry'))
    expect(plan.applied).toBe(false)
    expect(
      (db.query('SELECT identifiers FROM divisions').get() as any).identifiers,
    ).not.toContain('wikidata')
    const result = await backfillDivisionWikidata([path], join(dir, 'apply'), true)
    expect(result.replayReferences).toBe(1)
    expect(result.sourceReferences).toBe(1)
    const row = db.query('SELECT * FROM divisions').get() as any
    expect(JSON.parse(row.identifiers)).toEqual({
      overture: { divisionId: 'native' },
      wikidata: { id: 'Q123' },
    })
    expect(
      (db.query('SELECT versionHash FROM snapshotVersionChanges').get() as any)
        .versionHash,
    ).toBe(row.versionHash)
    const source = db.query('SELECT * FROM ssDivision').get() as any
    expect(JSON.parse(source.properties)).not.toHaveProperty('wikidata')
    expect(JSON.parse(source.properties).identifiers.wikidata).toEqual({ id: 'Q123' })
    expect(
      (db.query('SELECT sourceVersionHash FROM sourceResolutions').get() as any)
        .sourceVersionHash,
    ).toBe(source.versionHash)
    db.exec(
      readFileSync(
        new URL(
          '../libs/db/migrations/history/20261011052313_little_nemesis/migration.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    expect(
      (db.query('PRAGMA table_info(divisions)').all() as any[]).some(
        r => r.name === 'wikidata',
      ),
    ).toBe(false)
    expect(
      (await backfillDivisionWikidata([path], join(dir, 'repeat'))).counts,
    ).toEqual({})
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('conflicting Wikidata identifiers abort without overwriting data', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'division-wikidata-conflict-'))
  const path = join(dir, 'current.sqlite')
  const db = new Database(path)
  try {
    db.exec(`CREATE TABLE divisions (id TEXT,identifiers TEXT,wikidata TEXT);`)
    db.query('INSERT INTO divisions VALUES (?,?,?)').run(
      'village',
      '{"wikidata":{"id":"Q1"}}',
      'Q2',
    )
    await expect(
      backfillDivisionWikidata([path], join(dir, 'apply'), true),
    ).rejects.toThrow('Conflicting')
    expect(
      (db.query('SELECT identifiers FROM divisions').get() as any).identifiers,
    ).toBe('{"wikidata":{"id":"Q1"}}')
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
