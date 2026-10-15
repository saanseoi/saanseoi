import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { sql, type CurrentDatabase } from '@repo/db'
import { resolveGeographicMembershipGroups } from './geographicCodeFilters'
import {
  withGeographicFilters,
  geographicMembershipSql,
  matchesGeographicMembership,
} from '../lib/geographicFilterContext'

const row = (id: string, klass: string, code: string, parents: string[] = []) => ({
  id,
  attributes: {
    class: klass,
    divisionCode: code,
    hierarchies: { full: [parents.map(id => ({ id }))] },
  },
})
const rows = [
  row('hk', 'sar', 'HKSAR'),
  row('district', 'district', 'CW', ['hk']),
  row('hood', 'macrohood', 'CW', ['hk', 'district']),
  row('village', 'village', 'VV', ['hk']),
  row('hamlet', 'hamlet', 'HV', ['hk']),
]

test('code selectors disambiguate namespaces and include self and descendants', () => {
  expect([
    ...resolveGeographicMembershipGroups(rows, { 'filter[adminCode]': 'CW' })[0]!,
  ]).toEqual(['district', 'hood'])
  expect([
    ...resolveGeographicMembershipGroups(rows, { 'filter[hoodCode]': 'CW' })[0]!,
  ]).toEqual(['hood'])
  expect([
    ...resolveGeographicMembershipGroups(rows, { 'filter[localityCode]': 'HV' })[0]!,
  ]).toEqual(['hamlet'])
  expect(() =>
    resolveGeographicMembershipGroups(rows, { 'filter[hoodCode]': 'VV' }),
  ).toThrow('Unknown')
  expect(
    resolveGeographicMembershipGroups(rows, { 'filter[adminCode]': 'HKSAR' }),
  ).toEqual([])
})

test('SQL filters apply AND membership before pagination and counts without unbounded parameters', async () => {
  const sqlite = new Database(':memory:')
  const db = drizzle({ client: sqlite }) as unknown as CurrentDatabase
  sqlite.exec(`CREATE TABLE resources(id TEXT, memberships TEXT);
    INSERT INTO resources VALUES ('a','["other"]'), ('b','["district","hood"]'), ('c','["district"]')`)
  try {
    await withGeographicFilters(
      {
        releaseSet: 'geo',
        groups: [
          new Set(['district', ...Array.from({ length: 200 }, (_, i) => `id-${i}`)]),
          new Set(['hood']),
        ],
      },
      async () => {
        const condition = geographicMembershipSql(sql`memberships`)!
        expect(
          await db.all(
            sql`select id from resources where ${condition} order by id limit 1`,
          ),
        ).toEqual([{ id: 'b' }])
        expect(
          await db.get<{ n: number }>(
            sql`select count(*) as n from resources where ${condition}`,
          ),
        ).toEqual({ n: 1 })
      },
    )
  } finally {
    sqlite.close()
  }
})

test('simultaneous request contexts remain isolated and expire after the request', async () => {
  await Promise.all(
    ['a', 'b'].map(id =>
      withGeographicFilters({ releaseSet: id, groups: [new Set([id])] }, async () => {
        await Promise.resolve()
        expect(matchesGeographicMembership([id])).toBe(true)
        expect(matchesGeographicMembership([id === 'a' ? 'b' : 'a'])).toBe(false)
      }),
    ),
  )
  expect(matchesGeographicMembership([])).toBe(true)
})

test('crosswalk membership is scoped to the source snapshot', async () => {
  const sqlite = new Database(':memory:')
  const db = drizzle({ client: sqlite }) as unknown as CurrentDatabase
  sqlite.exec(
    `CREATE TABLE resources(id TEXT,snapshot TEXT); INSERT INTO resources VALUES ('tpu','old'),('tpu','new')`,
  )
  try {
    await withGeographicFilters(
      {
        releaseSet: 'geo',
        groups: [new Set(['district'])],
        crosswalkGroups: [
          [{ id: 'tpu', snapshotId: 'old', domain: 'hkgov-pland-pu', cohort: '2001' }],
        ],
      },
      async () => {
        expect(matchesGeographicMembership(['tpu'], { snapshotId: 'old' })).toBe(true)
        expect(matchesGeographicMembership(['tpu'], { snapshotId: 'new' })).toBe(false)
        const condition = geographicMembershipSql(sql`json_array(resources.id)`, {
          snapshotId: sql`resources.snapshot`,
        })!
        expect(
          await db.all(sql`SELECT snapshot FROM resources WHERE ${condition}`),
        ).toEqual([{ snapshot: 'old' }])
      },
    )
  } finally {
    sqlite.close()
  }
})

test('explicit district membership takes precedence over a shared hood', () => {
  withGeographicFilters(
    {
      releaseSet: 'geo',
      groups: [new Set(['west', 'shared'])],
      targetClasses: ['district'],
      divisionClasses: new Map([
        ['east', 'district'],
        ['west', 'district'],
        ['shared', 'macrohood'],
      ]),
    },
    () => {
      expect(matchesGeographicMembership(['east', 'shared'])).toBe(false)
      expect(matchesGeographicMembership(['west', 'shared'])).toBe(true)
      expect(matchesGeographicMembership(['shared'])).toBe(true)
    },
  )
})

test('spatial filters use the selected district polygon rather than a cross-boundary descendant', async () => {
  const { Hono } = await import('hono')
  const { fixtureEnv } = await import('../routes/statistics/v0/statisticsFixtures')
  const { createGeographicCodeFilterMiddleware } = await import(
    './geographicCodeFilters'
  )
  const f = fixtureEnv()
  try {
    f.current.exec(`INSERT INTO divisionGeographicCrosswalks
      (id,geographicReleaseSet,geographicSnapshotId,geographicAreaSnapshotId,sourceReleaseSet,sourceSnapshotId,sourceAreaSnapshotId,sourceDomain,sourceCohort,policy,contentHash)
      VALUES ('crosswalk','geo','geo-snapshot','geo-areas','hma','hma-snapshot','hma-areas','hkgov-censtatd-hma','2021','policy','hash');
      INSERT INTO divisionGeographicMemberships
      (crosswalkId,divisionId,geographicDivisionId,sourceGeometryHash,geographicGeometryHash,overlapSquareMetres,sourceFraction,fullyContained)
      VALUES ('crosswalk','hood-only','hood','hash','hash',100,1,0),('crosswalk','district-link','district','hash','hash',100,1,0);`)
    const app = new Hono<import('../types').AppEnv>()
    app.use('*', async (c, next) => {
      c.set(
        'currentDb',
        drizzle({
          client: f.current,
        }) as unknown as import('../types').AppEnv['Variables']['currentDb'],
      )
      await next()
    })
    app.use(
      '*',
      createGeographicCodeFilterMiddleware((async () => ({
        status: 200,
        body: { data: rows, meta: { apiReleaseSet: 'geo' } },
      })) as never),
    )
    app.get('/places/v0', c =>
      c.json({
        hood: matchesGeographicMembership(['hood-only'], {
          snapshotId: 'hma-snapshot',
        }),
        district: matchesGeographicMembership(['district-link'], {
          snapshotId: 'hma-snapshot',
        }),
      }),
    )
    const response = await app.request(
      'http://localhost/places/v0?filter[adminCode]=CW',
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ hood: false, district: true })
  } finally {
    f.close()
  }
})
