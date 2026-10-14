import { expect, test } from 'bun:test'
import {
  DivisionChangesQuerySchema,
  DivisionChangesResponseSchema,
  DivisionChangeDefinitionQuerySchema,
} from '../schema/divisionChanges'
import { DivisionChangesError } from '../db/divisionChanges'
import { PublicationReadUnavailableError } from '../db/publicationState'
import {
  getDivisionChangeDefinition,
  listDivisionChanges,
  type DivisionChangesDependencies,
} from './divisionChanges'
import type { GeocodingDatabases, GeocodingRelease } from './geocodingData'
import { area, division, entry } from './geocoding.fixtures'
import { createDivisionResolver } from './divisionGeocoding'

type Definitions = Awaited<ReturnType<DivisionChangesDependencies['loadDefinitions']>>
function release(code: string): GeocodingRelease {
  return {
    id: `id-${code}`,
    code,
    cohortKey: code,
    domainCode: 'geographic',
    schemaVersion: '1',
    rulesetVersion: '1',
    snapshots: [
      {
        snapshotId: `${code}-snapshot`,
        snapshotResourceType: 'division',
        role: 'primary',
        variant: 'overture',
      },
    ],
  }
}
function fixture(before: Definitions, after: Definitions) {
  let latest = 'new'
  const calls: Array<string | undefined> = []
  const dependencies: DivisionChangesDependencies = {
    resolveRelease: async (_, pin) => {
      calls.push(pin)
      return release((pin ?? latest).replace(/^id-/, ''))
    },
    loadDefinitions: async (_, release) => (release.code === 'old' ? before : after),
  }
  async function run(
    query: Record<string, unknown> = {},
    overrides: Partial<DivisionChangesDependencies> = {},
  ) {
    return listDivisionChanges({
      ...({} as GeocodingDatabases),
      requestUrl: 'https://api.example/divisions/v1/changes?access_token=secret',
      query: DivisionChangesQuerySchema.parse({
        fromReleaseSet: 'old',
        include: 'geometry',
        ...query,
      }),
      dependencies: { ...dependencies, ...overrides },
    })
  }
  return {
    run,
    calls,
    dependencies,
    publish: () => {
      latest = 'newer'
    },
  }
}
function successful(result: Awaited<ReturnType<typeof listDivisionChanges>>) {
  expect(result.status).toBe(200)
  if (result.status !== 200) throw new Error(JSON.stringify(result.body))
  expect(DivisionChangesResponseSchema.safeParse(result.body).success).toBe(true)
  return result.body
}

test.each([
  ['expansion', 0, 15, [12, 5], false, true],
  ['contraction', 0, 5, [7, 5], true, false],
  ['movement', 20, 30, [5, 5], true, false],
] as const)(
  '%s changes membership and retains both authoritative geometries',
  async (_, west, east, point, wasMember, isMember) => {
    const before = { records: [division('a')], areas: [area('a')] }
    const after = { records: [division('a')], areas: [area('a', west, east)] }
    expect(
      createDivisionResolver(before.records, before.areas)
        .resolve([...point])
        .matchedDivisionIds.includes('a'),
    ).toBe(wasMember)
    expect(
      createDivisionResolver(after.records, after.areas)
        .resolve([...point])
        .matchedDivisionIds.includes('a'),
    ).toBe(isMember)
    const body = successful(await fixture(before, after).run())
    expect(body.data).toHaveLength(1)
    expect(body.data[0]).toMatchObject({
      type: 'revision',
      changedFields: ['membershipGeometry'],
      canAffectGeocodingMembership: true,
      before: { membershipGeometry: [{ geometry: before.areas[0]!.geometry }] },
      after: { membershipGeometry: [{ geometry: after.areas[0]!.geometry }] },
    })
    expect(body.data[0]!.before!.definitionHash).not.toBe(
      body.data[0]!.after!.definitionHash,
    )
  },
)

test('release, row timestamps, geometry IDs and object/alternative ordering alone do not revise divisions', async () => {
  const old = division('a', 'administrative', { full: [[entry('x')], [entry('y')]] })
  const next = structuredClone(old)
  Object.assign(next.division, {
    snapshotId: 'new-snapshot',
    createdAt: 'new-created',
    updatedAt: 'new-updated',
  })
  next.division.hierarchies.full.reverse()
  const body = successful(
    await fixture(
      { records: [old], areas: [area('a')] },
      { records: [next], areas: [{ ...area('a'), id: 'new-area-id' }] },
    ).run(),
  )
  expect(body.data).toEqual([])
})

test('hierarchy changes without geometry expose transitive descendants before and after, including projections', async () => {
  const root = division('root')
  const parent = division('parent', 'administrative', { full: [[entry('root')]] })
  const child = division('child', 'administrative', { locality: [[entry('parent')]] })
  const grandchild = division('grandchild', 'administrative', {
    full: [[entry('child')]],
  })
  const nextParent = structuredClone(parent)
  nextParent.division.hierarchies.full = [[entry('other')]]
  const records = [root, parent, child, grandchild]
  const body = successful(
    await fixture(
      { records, areas: [] },
      { records: [root, nextParent, child, grandchild], areas: [] },
    ).run(),
  )
  expect(body.data).toHaveLength(1)
  expect(body.data[0]).toMatchObject({
    divisionId: 'parent',
    type: 'revision',
    canAffectGeocodingMembership: true,
    affectedDescendantIds: {
      before: ['child', 'grandchild'],
      after: ['child', 'grandchild'],
    },
  })
  expect(body.data[0]!.changedFields).toContain('hierarchies')
})

test('ancestor geometry changes trace unchanged descendants; missing ancestors and cycles terminate', async () => {
  const a = division('a', 'administrative', { full: [[entry('b')]] })
  const b = division('b', 'administrative', { full: [[entry('a')]] })
  const c = division('c', 'administrative', {
    landform: [[entry('b'), entry('missing')]],
  })
  const f = fixture(
    { records: [a, b, c], areas: [area('a')] },
    { records: [a, b, c], areas: [area('a', 0, 20)] },
  )
  const body = successful(await f.run())
  expect(body.data[0]!.affectedDescendantIds).toEqual({
    before: ['b', 'c'],
    after: ['b', 'c'],
  })
})

test('additions and deletions retain identity, old/new geometry and descendant dependencies', async () => {
  const child = division('child', 'administrative', { full: [[entry('deleted')]] })
  const nextChild = structuredClone(child)
  nextChild.division.hierarchies.full = [[entry('added')]]
  const body = successful(
    await fixture(
      { records: [division('deleted'), child], areas: [area('deleted')] },
      { records: [division('added'), nextChild], areas: [area('added')] },
    ).run(),
  )
  expect(body.data.map(change => [change.divisionId, change.type])).toEqual([
    ['added', 'addition'],
    ['child', 'revision'],
    ['deleted', 'deletion'],
  ])
  expect(body.data[0]).toMatchObject({
    before: null,
    after: { divisionId: 'added' },
    affectedDescendantIds: { before: [], after: ['child'] },
  })
  expect(body.data[2]).toMatchObject({
    after: null,
    before: {
      divisionId: 'deleted',
      membershipGeometry: [{ geometry: area('deleted').geometry }],
    },
    affectedDescendantIds: { before: ['child'], after: [] },
  })
  expect(body.data[2]!.before!.record).toContain('releaseSet=id-old')
})

test.each(['category', 'class', 'level'] as const)(
  '%s changes can affect membership',
  async field => {
    const old = division('a')
    const next = structuredClone(old)
    Object.assign(next.division, {
      [field]: field === 'category' ? 'locality' : field === 'class' ? 'town' : 5,
    })
    const body = successful(
      await fixture(
        { records: [old], areas: [] },
        { records: [next], areas: [] },
      ).run(),
    )
    expect(body.data[0]).toMatchObject({
      changedFields: [field],
      canAffectGeocodingMembership: true,
    })
  },
)

test('metadata-only names and hierarchy labels refresh without geocoding', async () => {
  const old = division('a', 'administrative', { full: [[entry('root')]] })
  const next = structuredClone(old)
  next.i18n.en!.name = 'New label'
  next.division.hierarchies.full[0]![0]!.name = 'Renamed root'
  const body = successful(
    await fixture({ records: [old], areas: [] }, { records: [next], areas: [] }).run(),
  )
  expect(body.data[0]).toMatchObject({
    changedFields: ['hierarchyNames', 'names'],
    canAffectGeocodingMembership: false,
    after: {
      attributes: {
        names: {
          en: {
            meta: { isLocaleInferred: false },
            name: 'New label',
          },
        },
      },
    },
    affectedDescendantIds: { before: [], after: [] },
  })
})

test('label points, descriptive metadata and non-authoritative polygons do not imply membership changes', async () => {
  const old = division('a')
  const next = structuredClone(old)
  next.division.geometry = { type: 'Point', coordinates: [1, 2] }
  next.division.identifiers = { wikidata: { id: 'Q1' } }
  const body = successful(
    await fixture(
      { records: [old], areas: [] },
      { records: [next], areas: [{ ...area('a'), variant: 'hkgov-censtatd' }] },
    ).run(),
  )
  expect(body.data[0]).toMatchObject({
    changedFields: ['geometry', 'identifiers'],
    canAffectGeocodingMembership: false,
  })
  expect(body.meta.coverage.after.withMembershipGeometry).toBe(0)
})

test('pagination pins latest once even after publication; replay and change identity are stable', async () => {
  const f = fixture(
    { records: [], areas: [] },
    { records: [division('c'), division('a'), division('b')], areas: [] },
  )
  const first = successful(await f.run({ 'page[limit]': '1' }))
  f.publish()
  const second = successful(
    await f.run({ 'page[limit]': '1', 'page[cursor]': first.meta.nextCursor! }),
  )
  const third = successful(
    await f.run({ 'page[limit]': '1', 'page[cursor]': second.meta.nextCursor! }),
  )
  expect([
    first.data[0]!.divisionId,
    second.data[0]!.divisionId,
    third.data[0]!.divisionId,
  ]).toEqual(['a', 'b', 'c'])
  expect(second.meta.toApiReleaseSet.id).toBe('id-new')
  expect(f.calls.filter(pin => pin === undefined)).toHaveLength(1)
  expect(third.meta.nextCursor).toBeNull()
  const replay = successful(
    await f.run(Object.fromEntries(new URL(first.links.self).searchParams)),
  )
  expect(replay).toEqual(first)
  expect(first.links.next).not.toContain('secret')
  const whole = successful(await f.run({ toReleaseSet: 'new' }))
  expect(whole.data.map(change => change.id)).toEqual([
    first.data[0]!.id,
    second.data[0]!.id,
    third.data[0]!.id,
  ])
})

test('rejects malformed, mismatched and unavailable cursor definitions explicitly', async () => {
  const after = { records: [division('a'), division('b')], areas: [] }
  const f = fixture({ records: [], areas: [] }, after)
  const first = successful(await f.run({ 'page[limit]': 1 }))
  expect(await f.run({ 'page[cursor]': 'garbage!' })).toMatchObject({
    status: 422,
    body: { error: 'invalid_cursor' },
  })
  expect(
    await f.run({ 'page[cursor]': first.meta.nextCursor!, toReleaseSet: 'another' }),
  ).toMatchObject({ status: 422, body: { error: 'cursor_release_mismatch' } })
  after.records[0]!.i18n.en!.name = 'Changed outside publication'
  expect(await f.run({ 'page[cursor]': first.meta.nextCursor! })).toMatchObject({
    status: 503,
    body: { error: 'comparison_unavailable' },
  })
})

test('unavailable releases/history and incompatible schema or rulesets fail explicitly', async () => {
  const f = fixture({ records: [], areas: [] }, { records: [], areas: [] })
  expect(
    await f.run(
      {},
      {
        resolveRelease: async () => {
          throw new DivisionChangesError(503, 'release_set_unavailable', 'unpublished')
        },
      },
    ),
  ).toMatchObject({ status: 503 })
  expect(
    await f.run(
      {},
      {
        loadDefinitions: async () => {
          throw new PublicationReadUnavailableError('missing history')
        },
      },
    ),
  ).toMatchObject({ status: 503 })
  for (const key of ['schemaVersion', 'rulesetVersion', 'domainCode'] as const)
    expect(
      await f.run(
        {},
        {
          resolveRelease: async (_, pin) => ({
            ...release(pin ?? 'new'),
            [key]: pin === 'old' ? 'one' : 'two',
          }),
        },
      ),
    ).toMatchObject({ status: 409, body: { error: 'incompatible_release_sets' } })
})

test('fromReleaseSet is required and old spellings/invalid limits are rejected', () => {
  for (const query of [
    {},
    { fromApiReleaseSet: 'old' },
    { fromReleaseSet: 'old', toApiReleaseSet: 'new' },
    { fromReleaseSet: '' },
    { fromReleaseSet: 'old', 'page[limit]': 0 },
    { fromReleaseSet: 'old', 'page[limit]': 101 },
  ])
    expect(DivisionChangesQuerySchema.safeParse(query).success).toBe(false)
})

test('exact definitions require the canonical releaseSet selector', () => {
  const definitionHash = 'a'.repeat(64)
  expect(
    DivisionChangeDefinitionQuerySchema.safeParse({ releaseSet: 'old', definitionHash })
      .success,
  ).toBe(true)
  expect(
    DivisionChangeDefinitionQuerySchema.safeParse({
      apiReleaseSet: 'old',
      definitionHash,
    }).success,
  ).toBe(false)
})

test('before/after links retrieve exact definitions and reject content drift rather than returning replacements', async () => {
  const before = { records: [division('gone')], areas: [area('gone')] }
  const f = fixture(before, { records: [], areas: [] })
  const body = successful(await f.run())
  const expected = body.data[0]!.before!
  const url = new URL(expected.record)
  const args = {
    ...({} as GeocodingDatabases),
    id: 'gone',
    requestUrl: url.toString(),
    releaseSet: url.searchParams.get('releaseSet')!,
    definitionHash: url.searchParams.get('definitionHash')!,
    dependencies: f.dependencies,
  }
  expect((await getDivisionChangeDefinition(args)) as unknown).toEqual({
    status: 200,
    body: expected,
  })
  before.areas[0] = area('gone', 0, 30)
  expect(await getDivisionChangeDefinition(args)).toMatchObject({
    status: 503,
    body: { error: 'definition_unavailable' },
  })
})

test('default feed omits polygons and supplies immutable geometry links', async () => {
  const f = fixture(
    { records: [], areas: [] },
    { records: [division('a')], areas: [area('a')] },
  )
  const body = successful(await f.run({ include: undefined }))
  expect(body.data[0]!.after!.membershipGeometry).toBeUndefined()
  expect(body.data[0]!.after!.geometry).toContain('definitionHash=')
  expect(body.data[0]!.after!.attributes.names).toEqual({
    en: {
      meta: { isLocaleInferred: false },
      name: 'a',
    },
  })
})

test('Overture inventory geometry changes remain visible in the change feed', async () => {
  const before = {
    records: [division('a')],
    areas: [{ ...area('a'), variant: 'overture' as const }],
  }
  const after = {
    records: [division('a')],
    areas: [{ ...area('a', 0, 15), variant: 'overture' as const }],
  }
  const body = successful(await fixture(before, after).run())
  expect(body.data).toHaveLength(1)
  expect(body.data[0]).toMatchObject({
    type: 'revision',
    changedFields: ['membershipGeometry'],
  })
})
