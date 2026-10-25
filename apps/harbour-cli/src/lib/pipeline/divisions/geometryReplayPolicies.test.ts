import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { computeVersionHash } from '@repo/db/versioning'
import { loadMigrationSql } from '../../../../../../libs/core/src/testing/metaFixtures'
import { readGeometryReplayMetadata } from './processLocalDivisionGeometrySqlUploadReplay'

test('geometry replay retains exact assembly policies and rejects missing or corrupt evidence', () => {
  const directory = mkdtempSync(join(tmpdir(), 'geometry-policy-'))
  const source = new Database(join(directory, 'DB_META.sqlite'))
  const target = new Database(':memory:')
  try {
    const migrations = loadMigrationSql(
      resolve(import.meta.dir, '../../../../../../libs/db/migrations'),
      ['meta'],
    )
    for (const db of [source, target]) {
      db.exec(migrations)
      db.exec('PRAGMA foreign_keys = OFF')
    }
    const definition = {
      stage: 'assembly',
      rulesets: [
        { rules: [{ definition: { id: 'normalise-division-area-geometry' } }] },
      ],
    }
    const id = computeVersionHash(definition)
    source
      .query('INSERT INTO processingRuleDefinitions (id, definition) VALUES (?, ?)')
      .run(id, JSON.stringify(definition))
    source.exec(`
      INSERT INTO snapshotLineages (id, code, regionCode, resourceType, identityMode, versionHash)
      VALUES ('lineage', 'lineage', 'hk', 'divisionArea', 'source', 'hash');
      INSERT INTO snapshots (id, snapshotLineageId, code, cohortKey, status)
      VALUES ('snapshot', 'lineage', 'snapshot', '2026', 'draft');
      INSERT INTO snapshotRecipes (id, code, resourceType, version, versionHash, processingRules)
      VALUES ('recipe', 'recipe', 'divisionArea', 1, 'hash', '${id}');
      INSERT INTO snapshotAssemblies (id, snapshotId, snapshotRecipeId)
      VALUES ('assembly', 'snapshot', 'recipe');
    `)
    const sql = readGeometryReplayMetadata(directory, 'DB_META', 'release', 'snapshot')
    expect(sql.indexOf('INSERT INTO "processingRuleDefinitions"')).toBeLessThan(
      sql.indexOf('INSERT INTO "snapshotRecipes"'),
    )
    target.exec(sql)
    target.exec(sql)
    expect(
      target.query('SELECT definition FROM processingRuleDefinitions').all(),
    ).toEqual([{ definition: JSON.stringify(definition) }])
    expect(
      target
        .query(
          'SELECT count(*) AS count FROM snapshotRecipes r JOIN processingRuleDefinitions d ON d.id=r.processingRules',
        )
        .get(),
    ).toEqual({ count: 1 })
    source.query('UPDATE processingRuleDefinitions SET definition = ?').run('{}')
    expect(() =>
      readGeometryReplayMetadata(directory, 'DB_META', 'release', 'snapshot'),
    ).toThrow('missing or invalid')
    source.exec('DELETE FROM processingRuleDefinitions')
    expect(() =>
      readGeometryReplayMetadata(directory, 'DB_META', 'release', 'snapshot'),
    ).toThrow('missing or invalid')
  } finally {
    source.close()
    target.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
