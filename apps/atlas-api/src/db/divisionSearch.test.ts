import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { buildDivisionSearchSyncSql } from '@repo/core/pipeline/services/search/divisions'
import { DivisionSearchQuerySchema } from '../schema/divisionSearch'
import { searchDivisions } from './divisionSearch'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildSearchContentSql } from '@repo/core/pipeline/services/search/incrementalIndex'
import { divisionSearchIndex } from '@repo/core/pipeline/services/search/divisions'

function fixture(beforeQuery?: (sqlite: Database, sql: string) => void) {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE divisionPublicationState(scopeId TEXT PRIMARY KEY,snapshotId TEXT UNIQUE,status TEXT,publicationToken TEXT,preparedAt TEXT,updatedAt TEXT);
    INSERT INTO divisionPublicationState VALUES ('physical-geographic','latest','current','latest-token','prepared','updated'),('physical-planning','planning','current','planning-token','prepared','updated');
    CREATE TABLE divisionSearchScopes(scopeId TEXT PRIMARY KEY, snapshotId TEXT);
    CREATE TABLE divisions(snapshotId,id,divisionCode,class,category,level,hierarchies);
    CREATE TABLE divisionsI18n(snapshotId,divisionId,locale,name,nameAlts,nameRules);
  `)
  const add = (
    snapshot: string,
    id: string,
    name: string,
    options: {
      locale?: string
      alias?: string
      code?: string
      ancestor?: string
      rules?: string
    } = {},
  ) => {
    const scope =
      snapshot === 'latest'
        ? 'physical-geographic'
        : snapshot === 'planning'
          ? 'physical-planning'
          : snapshot
    sqlite.query('INSERT INTO divisions VALUES (?,?,?,?,?,?,?)').run(
      scope,
      id,
      options.code ?? null,
      'neighbourhood',
      'hood',
      5,
      JSON.stringify({
        full: [
          [
            {
              id: 'parent',
              name: options.ancestor ?? 'Hong Kong',
              class: 'district',
            },
          ],
        ],
      }),
    )
    sqlite
      .query('INSERT INTO divisionsI18n VALUES (?,?,?,?,?,?)')
      .run(
        scope,
        id,
        options.locale ?? 'en',
        name,
        options.alias ?? null,
        options.rules ?? null,
      )
  }
  const scopes = [
    { scopeId: 'hk:geographic:geo', snapshotId: 'latest' },
    { scopeId: 'hk:hkgov-pland-pu:pu', snapshotId: 'planning' },
  ]
  const sync = (selection = scopes) =>
    sqlite.transaction(() => {
      for (const sql of buildDivisionSearchSyncSql(selection)) sqlite.exec(sql)
    })()
  const db = {
    prepare(sql: string) {
      beforeQuery?.(sqlite, sql)
      return {
        bind(...values: (string | number)[]) {
          return {
            async first() {
              return sqlite.query(sql).get(...values)
            },
            async all() {
              return { results: sqlite.query(sql).all(...values) }
            },
          }
        },
      }
    },
  } as unknown as D1Database
  const search = (
    q: string,
    options: Record<string, unknown> = {},
    selection = scopes,
  ) =>
    searchDivisions(db, selection, DivisionSearchQuerySchema.parse({ q, ...options }))
  return { sqlite, add, scopes, sync, search }
}

test('all-domain typeahead finds names, aliases, codes and Chinese substrings; ancestors are opt-in', async () => {
  const f = fixture()
  try {
    f.add('latest', 'village', 'Harbour Village', {
      alias: 'Portside|Haven',
      code: 'HV-12',
      ancestor: 'Central District',
    })
    f.add('planning', 'cell', 'Planning Cell', { code: 'PU42' })
    f.add('latest', 'chinese', '深水埗區', { locale: 'zh-hant' })
    f.add('latest', 'rules', 'Other name', {
      rules: JSON.stringify([{ value: 'Victoria', variant: 'historical' }]),
    })
    f.add('historic', 'obsolete', 'Historical Harbour')
    f.add('draft', 'draft', 'Unpublished Harbour')
    f.sync()
    expect((await f.search('har')).map(r => r.divisionId)).toEqual(['village'])
    expect((await f.search('ORTS')).map(r => r.divisionId)).toEqual(['village'])
    expect((await f.search('HV-12')).map(r => r.divisionId)).toEqual(['village'])
    expect((await f.search('pu4')).map(r => r.domain)).toEqual(['hkgov-pland-pu'])
    expect((await f.search('vict')).map(r => r.divisionId)).toEqual(['rules'])
    expect((await f.search('水埗')).map(r => r.divisionId)).toEqual(['chinese'])
    expect((await f.search('埗')).map(r => r.divisionId)).toEqual(['chinese'])
    expect(await f.search('Central')).toEqual([])
    expect(
      (await f.search('Central', { ancestors: 'true' })).map(r => r.match),
    ).toEqual(['ancestor'])
    expect(
      (await f.search('Harbour Central', { ancestors: 'true' })).map(r => r.divisionId),
    ).toEqual(['village'])
    expect(await f.search('水埗', { locale: 'en' })).toEqual([])
    expect(await f.search('PU42', {}, [f.scopes[0]!])).toEqual([])
    expect(await f.search('Historical')).toEqual([])
    expect(await f.search('Unpublished')).toEqual([])
    expect(await f.search('Harbour OR Planning')).toEqual([])
    expect((await f.search('Harbour*')).map(r => r.divisionId)).toEqual(['village'])
  } finally {
    f.sqlite.close()
  }
})

test('direct matches rank before ancestors and repeated localisations produce one result per domain', async () => {
  const f = fixture()
  try {
    f.add('latest', 'child', 'AAA child', { ancestor: 'Central' })
    f.add('latest', 'central', 'Central')
    f.add('planning', 'central', 'Central')
    f.sqlite.exec(
      "INSERT INTO divisionsI18n VALUES ('physical-geographic','central','zh-hant','Central 中環',null,null)",
    )
    f.sync()
    const results = await f.search('Central', { ancestors: 'true' })
    expect(results.map(r => r.match)).toEqual(['self', 'self', 'ancestor'])
    expect(results.filter(r => r.divisionId === 'central')).toHaveLength(2)
    expect(await f.search('Central', { limit: '1', ancestors: 'true' })).toHaveLength(1)
  } finally {
    f.sqlite.close()
  }
})

test('identical snapshot promotion writes one mapping; repeat writes nothing; edits and scope removal reconcile atomically', async () => {
  const f = fixture()
  try {
    f.add('latest', 'one', 'Harbour', { ancestor: 'Central' })
    f.add('planning', 'two', 'Planning')
    f.sync()
    const rows = () =>
      f.sqlite.query('SELECT rowid,* FROM divisionSearchFts ORDER BY scopeId').all()
    const changes = () =>
      (f.sqlite.query('SELECT total_changes() AS n').get() as { n: number }).n
    const before = rows()
    f.sqlite.exec(
      "UPDATE divisionPublicationState SET snapshotId='next',publicationToken='next-token' WHERE scopeId='physical-geographic'",
    )
    const initialChanges = changes()
    const promoted = [{ ...f.scopes[0]!, snapshotId: 'next' }, f.scopes[1]!]
    f.sync(promoted)
    expect(rows()).toEqual(before)
    expect(changes() - initialChanges).toBe(1)
    const repeated = changes()
    f.sync(promoted)
    expect(changes()).toBe(repeated)
    await expect(f.search('Harbour')).rejects.toThrow('not ready')
    expect((await f.search('Harbour', {}, promoted))[0]?.snapshotId).toBe('next')
    f.sqlite.exec(
      "UPDATE divisionsI18n SET name='Changed' WHERE snapshotId='physical-geographic'",
    )
    expect(() =>
      f.sqlite.transaction(() => {
        f.sync(promoted)
        throw new Error('injected failure')
      })(),
    ).toThrow('injected failure')
    expect(rows()).toEqual(before)
    f.sync(promoted)
    expect((await f.search('Changed', {}, promoted)).map(r => r.divisionId)).toEqual([
      'one',
    ])
    f.sync([promoted[0]!])
    expect(f.sqlite.query('SELECT count(*) AS n FROM divisionSearchFts').get()).toEqual(
      { n: 1 },
    )
    f.sqlite.exec('DROP TABLE divisionSearchFts')
    await expect(f.search('Changed', {}, [promoted[0]!])).rejects.toThrow('not ready')
  } finally {
    f.sqlite.close()
  }
})

test('search rejects historical selectors, excessive terms and invalid options', () => {
  for (const query of [
    { q: 'Central', releaseSet: 'old' },
    { q: 'Central', ancestors: 'yes' },
    { q: 'Central', domain: 'unknown' },
    { q: 'Central', limit: 101 },
    { q: '%_*' },
    { q: 'one two three four five six seven eight nine' },
  ])
    expect(DivisionSearchQuerySchema.safeParse(query).success).toBe(false)
})

test('ancestor ordering causes no writes; changed ancestor text refreshes the affected document', async () => {
  const f = fixture()
  try {
    f.add('latest', 'one', 'Harbour')
    const writeHierarchy = (names: string[]) =>
      f.sqlite.query("UPDATE divisions SET hierarchies=? WHERE id='one'").run(
        JSON.stringify({
          full: [names.map(name => ({ id: name, name, class: 'district' }))],
        }),
      )
    writeHierarchy(['Central', 'Hong Kong'])
    f.sync()
    writeHierarchy(['Hong Kong', 'Central', 'Central'])
    const before = f.sqlite.query('SELECT total_changes() AS n').get()
    f.sync()
    expect(f.sqlite.query('SELECT total_changes() AS n').get()).toEqual(before)
    writeHierarchy(['Eastern', 'Hong Kong'])
    f.sync()
    expect(await f.search('Central', { ancestors: 'true' })).toEqual([])
    expect(
      (await f.search('Eastern', { ancestors: 'true' })).map(r => r.divisionId),
    ).toEqual(['one'])
    expect(await f.search('Eastern')).toEqual([])
    const repair = readFileSync(
      resolve(
        import.meta.dir,
        '../../../../libs/db/scripts/sql/rebuild-divisions-fts.sql',
      ),
      'utf8',
    )
    expect(repair.trim()).toBe(
      (buildSearchContentSql(divisionSearchIndex).join(';\n\n') + ';').trim(),
    )
  } finally {
    f.sqlite.close()
  }
})

test('codes remain searchable without localised names and bound scope lists do not grow the parameter count', async () => {
  const f = fixture()
  try {
    f.add('latest', 'code', 'Placeholder', { code: 'HK_ISLAND' })
    f.sqlite.exec("DELETE FROM divisionsI18n WHERE divisionId='code'")
    f.sync()
    expect((await f.search('hk_island')).map(r => [r.divisionId, r.locale])).toEqual([
      ['code', 'und'],
    ])
    const scopes = Array.from({ length: 120 }, (_, i) => ({
      scopeId: 'hk:geographic:lineage' + i,
      snapshotId: 'latest',
    }))
    f.sync(scopes)
    expect(await f.search('HK_ISLAND', {}, scopes)).toHaveLength(1)
  } finally {
    f.sqlite.close()
  }
})

test('Division search rejects an unready base publication even with an indexed scope', async () => {
  const f = fixture()
  try {
    f.add('latest', 'village', 'Harbour Village')
    f.sync()
    f.sqlite.exec(
      "UPDATE divisionPublicationState SET status='publishing' WHERE snapshotId='latest'",
    )
    await expect(f.search('Harbour')).rejects.toThrow('Division search is not ready')
  } finally {
    f.sqlite.close()
  }
})

test('Division search discards results when publication changes during the query', async () => {
  let interrupted = false
  const f = fixture((sqlite, sql) => {
    if (!interrupted && sql.includes('WITH selected AS')) {
      interrupted = true
      sqlite.exec("UPDATE divisionPublicationState SET publicationToken='replacement'")
    }
  })
  try {
    f.add('latest', 'village', 'Harbour Village')
    f.sync()
    await expect(f.search('Harbour')).rejects.toThrow('Division search is not ready')
    expect(interrupted).toBe(true)
  } finally {
    f.sqlite.close()
  }
})
