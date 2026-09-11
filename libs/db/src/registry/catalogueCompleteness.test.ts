import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { listApiFieldFixtures } from '../apiFieldFixtures'
import { computeVersionHash } from '../versioning'
import {
  buildMetaRegistrySyncStatements,
  initialApiVersions,
  initialApiEndpoints,
  initialDatasetI18n,
  initialUnitsI18n,
} from './meta'

const root = new URL('../../../../fixtures/meta/', import.meta.url).pathname
const catalogue = (directory: string) =>
  readdirSync(join(root, directory))
    .filter(name => name.endsWith('.json'))
    .map(name => JSON.parse(readFileSync(join(root, directory, name), 'utf8')))

test('every API mapping references a hashed schema and ruleset descriptor', () => {
  const schemas = catalogue('schemaVersions')
  const rulesets = catalogue('rulesetVersions')
  for (const descriptor of [...schemas, ...rulesets])
    expect(descriptor.versionHash).toBe(computeVersionHash(descriptor))
  for (const fixture of listApiFieldFixtures()) {
    expect(
      schemas.some(schema => schema.code === fixture.schemaVersion),
      fixture.schemaVersion,
    ).toBe(true)
    expect(
      rulesets.some(ruleset => ruleset.code === fixture.rulesetVersion),
      fixture.rulesetVersion,
    ).toBe(true)
  }
  expect(schemas.some(schema => schema.code === 'sv-street-v1')).toBe(true)
  expect(rulesets.some(ruleset => ruleset.code === 'rs-street-merge-v1')).toBe(true)
})

test('all current API versions have endpoint metadata', () => {
  for (const version of initialApiVersions.filter(
    version => version.status === 'current',
  ))
    expect(
      initialApiEndpoints.some(endpoint => endpoint.apiVersion === version.code),
      version.code,
    ).toBe(true)
})

test('Statistics dataset and unit metadata has complete canonical locale keys and text', () => {
  const statistics = initialDatasetI18n.filter(row =>
    row.datasetCode.startsWith('ds-hk-hkgov-censtatd-division-statistic-'),
  )
  expect(new Set(statistics.map(row => row.datasetCode)).size).toBe(8)
  for (const code of new Set(statistics.map(row => row.datasetCode))) {
    const rows = statistics.filter(row => row.datasetCode === code)
    expect(rows.map(row => row.locale).sort()).toEqual(['en', 'zh-hans', 'zh-hant'])
    for (const row of rows) {
      expect(row.name.trim().length).toBeGreaterThan(0)
      expect(row.description?.trim().length).toBeGreaterThan(0)
    }
  }
  for (const code of new Set(initialUnitsI18n.map(row => row.code)))
    expect(
      initialUnitsI18n
        .filter(row => row.code === code)
        .map(row => row.locale)
        .sort(),
    ).toEqual(['en', 'zh-hans', 'zh-hant'])
})

test('unit registry sync removes undeclared locale keys and remains idempotent', () => {
  const db = new Database(':memory:')
  try {
    db.exec(
      'CREATE TABLE units(id TEXT PRIMARY KEY, code TEXT UNIQUE, dimension TEXT, symbol TEXT, versionHash TEXT, createdAt INTEGER, updatedAt INTEGER); CREATE TABLE unitsI18n(unitId TEXT, locale TEXT, name TEXT, description TEXT, createdAt INTEGER, updatedAt INTEGER, PRIMARY KEY(unitId, locale));',
    )
    const statements = buildMetaRegistrySyncStatements('preview').filter(statement =>
      /^(INSERT INTO units(?:I18n)?\b|DELETE FROM unitsI18n\b)/.test(statement.trim()),
    )
    const sync = () => {
      for (const statement of statements) db.exec(statement)
    }
    sync()
    db.exec(
      "INSERT INTO unitsI18n(unitId, locale, name) SELECT id, 'zh-Hant', 'stale' FROM units WHERE code = 'person'",
    )
    sync()
    sync()
    expect(
      db
        .query(
          "SELECT locale FROM unitsI18n WHERE unitId = (SELECT id FROM units WHERE code = 'person') ORDER BY locale",
        )
        .all(),
    ).toEqual([{ locale: 'en' }, { locale: 'zh-hans' }, { locale: 'zh-hant' }])
  } finally {
    db.close()
  }
})
