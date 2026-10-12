import { expect, test } from 'bun:test'
import {
  matchPlaceIdentities,
  placeIdentityEvidence,
  scorePlaceIdentity,
} from './placeIdentity'
const evidence = (id: string, values: Record<string, unknown> = {}) =>
  placeIdentityEvidence(
    {
      id,
      names: { primary: 'Example Cafe' },
      phones: ['+852 2345 6789'],
      socials: ['https://facebook.com/examplecafe'],
      categories: { primary: 'cafe' },
      sources: [{ dataset: 'meta', record_id: '123' }],
      ...values,
    },
    114.1,
    22.3,
  )
const old = { id: 'canonical', evidence: evidence('old') }
const match = (value = evidence('new'), previous = [old]) =>
  matchPlaceIdentities([value], previous, 'hk', '2026-01')[0]!
test('publisher ID churn retains canonical identity with independent evidence', () => {
  expect(match().id).toBe('canonical')
  expect(match().outcome).toBe('matched')
})
test('names, proximity and chain website alone cannot identify a business', () => {
  const value = evidence('new', {
    phones: [],
    socials: [],
    sources: [],
    websites: ['https://chain.hk'],
  })
  expect(match(value).outcome).toBe('new')
})
test('rebrand requires phone, category and another continuity signal', () => {
  expect(match(evidence('new', { names: { primary: 'New Brand' } })).reason).toBe(
    'rebrand',
  )
  for (const change of [
    { phones: ['+852 9876 5432'] },
    { categories: { primary: 'bar' } },
    { phones: [] },
    { categories: null },
    { socials: ['https://facebook.com/newbusiness'] },
  ])
    expect(
      match(evidence('new', { names: { primary: 'New Brand' }, ...change })).outcome,
    ).toBe('new')
})
test('opening hours contradiction blocks a rebrand; absence is not agreement', () => {
  const previous = [
    { ...old, evidence: evidence('old', { opening_hours: 'Mo-Fr 09:00-17:00' }) },
  ]
  expect(
    match(
      evidence('new', {
        names: { primary: 'New Brand' },
        opening_hours: 'Mo-Su 18:00-02:00',
      }),
      previous,
    ).outcome,
  ).toBe('new')
  expect(scorePlaceIdentity(evidence('new'), old).agreements).not.toContain('hours')
})
test('stable upstream ID does not override replacement business evidence', () => {
  expect(
    match(
      evidence('old', {
        names: { primary: 'New Business' },
        phones: ['+852 9876 5432'],
      }),
    ).outcome,
  ).toBe('new')
})
test('co-located candidates and duplicate incoming claimants abstain', () => {
  expect(match(evidence('new'), [old, { ...old, id: 'other' }]).reason).toBe(
    'ambiguous',
  )
  const values = [evidence('new-a'), evidence('new-b')]
  const result = matchPlaceIdentities(values, [old], 'hk', '2026-01')
  expect(result.every(x => x.reason === 'ambiguous')).toBe(true)
  expect(new Set(result.map(x => x.id)).size).toBe(2)
  expect(
    matchPlaceIdentities(values.toReversed(), [old], 'hk', '2026-01').map(x => x.id),
  ).toEqual(result.map(x => x.id).toReversed())
})
test('new identities are deterministic, source-scoped and birth-release-scoped', () => {
  const a = matchPlaceIdentities([evidence('new')], [], 'hk', '2026-01')[0]!
  expect(a.id).toMatch(/^ss-/)
  expect(matchPlaceIdentities([evidence('new')], [], 'hk', '2026-01')[0]?.id).toBe(a.id)
  expect(matchPlaceIdentities([evidence('new')], [], 'hk', '2026-02')[0]?.id).not.toBe(
    a.id,
  )
  expect(matchPlaceIdentities([evidence('new')], [], 'mo', '2026-01')[0]?.id).not.toBe(
    a.id,
  )
})
test('distant matching contacts cannot conflate chain branches', () => {
  expect(match({ ...evidence('new'), lng: 114.2 }).outcome).toBe('new')
})
test('duplicate source and canonical membership fails closed', () => {
  expect(() =>
    matchPlaceIdentities([evidence('a'), evidence('a')], [], 'hk', '1'),
  ).toThrow('Duplicate publisher')
  expect(() => matchPlaceIdentities([], [old, old], 'hk', '1')).toThrow(
    'Duplicate canonical',
  )
})
test('Hong Kong phone formatting and URL transport are normalised', () => {
  expect(evidence('a', { phones: ['2345-6789'] }).phones).toEqual(evidence('b').phones)
  expect(
    evidence('a', { socials: ['http://www.facebook.com/examplecafe/'] }).socials,
  ).toEqual(evidence('b').socials)
})

test('known different shop units and floors block even an unchanged source ID', () => {
  const prior = [
    {
      ...old,
      evidence: evidence('old', {
        addresses: [{ freeform: 'Shop 101, 1/F, Building' }],
      }),
    },
  ]
  expect(
    match(
      evidence('old', { addresses: [{ freeform: 'Shop 102, 1/F, Building' }] }),
      prior,
    ).outcome,
  ).toBe('new')
  expect(
    match(
      evidence('old', { addresses: [{ freeform: 'Shop 101, 2/F, Building' }] }),
      prior,
    ).outcome,
  ).toBe('new')
})
test('a partial phone overlap is insufficient for a rebrand', () => {
  expect(
    match(
      evidence('new', {
        names: { primary: 'New Brand' },
        phones: ['23456789', '98765432'],
      }),
    ).outcome,
  ).toBe('new')
})
test('direct publisher continuity outranks a nearby branch sharing contacts', () => {
  const result = match(evidence('old'), [
    old,
    { ...old, id: 'other', evidence: evidence('other-source') },
  ])
  expect(result.id).toBe('canonical')
})

test('retained explanation always includes the accepted candidate despite higher-scoring vetoes', () => {
  const incoming = evidence('new', { addresses: [{ freeform: 'Shop 1, Building' }] })
  const accepted = {
    id: 'accepted',
    evidence: evidence('acceptable', {
      sources: [],
      socials: [],
      addresses: [{ freeform: 'Shop 1, Building' }],
    }),
  }
  const vetoed = Array.from({ length: 6 }, (_, i) => ({
    id: `vetoed-${i}`,
    evidence: evidence(`old-${i}`, { addresses: [{ freeform: 'Shop 2, Building' }] }),
  }))
  const result = match(incoming, [...vetoed, accepted])
  expect(result.id).toBe('accepted')
  expect(result.candidates[0]?.id).toBe('accepted')
  expect(result.candidates).toHaveLength(5)
})

test('premise evidence does not read a business word ending in shop as a unit label', () => {
  expect(
    evidence('a', { addresses: [{ freeform: 'Workshop 123, Building' }] }).units,
  ).toEqual([])
})

test('audit freezes previous values, releases and both ambiguity margins', () => {
  const prior = { ...old, release: 'previous-release' }
  const decision = match(evidence('new'), [prior])
  expect(decision.sourceRelease).toBe('2026-01')
  expect(decision.candidates[0]?.evidence.sourceId).toBe('old')
  expect(decision.candidates[0]?.release).toBe('previous-release')
  expect(decision.threshold).toBe(85)
  expect(decision.alternativeMargin).toBeNull()
  const ambiguous = matchPlaceIdentities(
    [evidence('new'), evidence('rival')],
    [prior],
    'hk',
    '2026-01',
  )[0]!
  expect(ambiguous.rivalMargin).toBe(0)
  expect(ambiguous.rivals[0]?.sourceId).toBe('rival')
})
