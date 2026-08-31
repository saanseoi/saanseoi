import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('source baseline contains exact Statistics reference-period columns', () => {
  const migrationsRoot = resolve(import.meta.dir, '../migrations/source')
  const baselineDirectory = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
    .at(-1)

  expect(baselineDirectory).toBeDefined()
  const migration = readFileSync(
    resolve(migrationsRoot, baselineDirectory!, 'migration.sql'),
    'utf8',
  ).replaceAll('--> statement-breakpoint', '')
  const sqlite = new Database(':memory:')
  sqlite.exec(migration)

  for (const tableName of [
    'hkgovCenstatdDistrictLandAreaPopulationDensities',
    'hkgovCenstatdStatistics',
  ]) {
    const columns = sqlite
      .query(`PRAGMA table_info("${tableName}")`)
      .all()
      .map(column => (column as { name: string }).name)
    expect(columns).toContain('referencePeriodCode')
    expect(columns).toContain('referencePeriodStart')
    expect(columns).toContain('referencePeriodEnd')
    expect(columns).toContain('referencePeriodGranularity')
    expect(columns).toContain('referencePeriodEndYear')
  }

  sqlite.close()
})
