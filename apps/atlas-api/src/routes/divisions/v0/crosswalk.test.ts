import { expect, test } from 'bun:test'
import worker from '../../../index'
import { fixtureEnv } from '../../statistics/v0/statisticsFixtures'

function fixture() {
  const f = fixtureEnv()
  const seed = (
    id: string,
    source: string,
    domain: string,
    cohort: string,
    target = 'geographic',
  ) => {
    f.current
      .query(`INSERT INTO divisionGeographicCrosswalks
      (id,geographicReleaseSet,geographicSnapshotId,geographicAreaSnapshotId,sourceReleaseSet,sourceSnapshotId,sourceAreaSnapshotId,sourceDomain,sourceCohort,policy,contentHash)
      VALUES (?,?, 'geo-snapshot','geo-areas',?,?, 'source-areas',?,?, 'policy', 'hash')`)
      .run(id, target, source, `${source}-snapshot`, domain, cohort)
    for (const [division, geographic, fraction] of [
      ['a', 'x', 0.01],
      ['a', 'y', 0.99],
      ['b', 'y', 1],
    ] as const)
      f.current
        .query(`INSERT INTO divisionGeographicMemberships
        (crosswalkId,divisionId,geographicDivisionId,sourceGeometryHash,geographicGeometryHash,overlapSquareMetres,sourceFraction,fullyContained)
        VALUES (?,?,?,'source-hash','geographic-hash',?,?,?)`)
        .run(
          id,
          division,
          geographic,
          fraction * 1000,
          fraction,
          Number(fraction === 1),
        )
  }
  const request = (query: string) =>
    worker.fetch(
      new Request(`http://localhost/divisions/v0.2/crosswalk?${query}`),
      f.env,
      { waitUntil() {}, passThroughOnException() {} } as never,
    )
  return { ...f, seed, request }
}

test.each([
  ['hma', 'hkgov-censtatd-hma', '2021'],
  ['nt-2006', 'hkgov-pland-new-town', '2006'],
  ['nt-2011', 'hkgov-pland-new-town', '2011'],
  ['nt-2016', 'hkgov-pland-new-town', '2016'],
  ['nt-2021', 'hkgov-pland-new-town', '2021'],
])(
  'crosswalk %s exposes pins and small overlaps with stable bidirectional filtering and pagination',
  async (source, domain, cohort) => {
    const f = fixture()
    try {
      f.seed('crosswalk', source, domain, cohort)
      f.seed('different-edition', source, domain, cohort, 'other-geographic')
      const query = `sourceReleaseSet=${source}&geographicReleaseSet=geographic`
      const response = await f.request(`${query}&page[limit]=1`)
      expect(response.status).toBe(200)
      const body = (await response.json()) as any
      expect(body.meta).toMatchObject({
        total: 3,
        offset: 0,
        limit: 1,
        crosswalk: {
          sourceReleaseSet: source,
          sourceDomain: domain,
          sourceCohort: cohort,
          sourceSnapshotId: `${source}-snapshot`,
          geographicReleaseSet: 'geographic',
        },
      })
      expect(body.data[0]).toMatchObject({
        divisionId: 'a',
        geographicDivisionId: 'x',
        sourceFraction: 0.01,
        fullyContained: false,
      })
      expect(body.data[0].crosswalkId).toBeUndefined()
      const page = await f.request(new URL(body.links.next).search.slice(1))
      expect(((await page.json()) as any).data[0].geographicDivisionId).toBe('y')
      const sourceRows = await f.request(`${query}&divisionId=a`)
      expect(((await sourceRows.json()) as any).meta.total).toBe(2)
      const targetRows = await f.request(`${query}&geographicDivisionId=y`)
      expect(((await targetRows.json()) as any).meta.total).toBe(2)
      const empty = await f.request(`${query}&divisionId=absent`)
      expect(empty.status).toBe(200)
      expect(((await empty.json()) as any).data).toEqual([])
    } finally {
      f.close()
    }
  },
)

test('crosswalk distinguishes unavailable pairs and invalid selectors', async () => {
  const f = fixture()
  try {
    expect(
      (await f.request('sourceReleaseSet=missing&geographicReleaseSet=geo')).status,
    ).toBe(503)
    expect((await f.request('sourceReleaseSet=missing')).status).toBe(422)
    expect(
      (await f.request('sourceReleaseSet=x&geographicReleaseSet=y&page[limit]=1001'))
        .status,
    ).toBe(422)
  } finally {
    f.close()
  }
})
