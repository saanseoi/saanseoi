import { expect, test } from 'bun:test'
import {
  matchPlaceIdentities,
  placeIdentityEvidence,
} from '@repo/core/pipeline/services/places/placeIdentity'
import { reconcilePlaceAddressIdentityContinuity } from './placeAddressIdentityContinuity'
import type { PlaceHistoryState } from './processLocalPlaceSqlUploadTypes'
import {
  addressFingerprint,
  createSupplementaryAddressAnalyser,
  parseSupplementaryCuration,
  supplementaryIdentity,
  type SupplementaryDecision,
} from './supplementaryPlaceAddress'
import policy from './testFixtures/supplementaryAddressPolicy.json'

function setup() {
  const evidence = placeIdentityEvidence(
    {
      id: 'old',
      names: { primary: 'Cafe' },
      phones: ['23456789'],
      categories: { primary: 'cafe' },
    },
    114,
    22,
  )
  const prior = matchPlaceIdentities([evidence], [], 'hk', 'before')[0]!
  const identity = matchPlaceIdentities(
    [{ ...evidence, sourceId: 'new' }],
    [{ id: prior.id, evidence }],
    'hk',
    'now',
  )[0]!
  const fixture = parseSupplementaryCuration(structuredClone(policy))
  fixture.entries = [
    {
      placeId: 'old',
      ...supplementaryIdentity([
        {
          locale: 'en',
          formattedAddress: 'Cafe Building',
          buildingName: null,
          buildingNumberExpression: null,
          buildingNumberFrom: null,
          buildingNumberTo: null,
          estateName: null,
          blockExpression: null,
          phaseExpression: null,
          streetName: null,
        },
      ]),
      fingerprint: addressFingerprint(['Cafe Building']),
      normalisedPublisherAddress: ['CAFE BUILDING'],
      baseAddressId: null,
      values: [
        {
          locale: 'en',
          formattedAddress: 'Cafe Building',
          buildingName: null,
          buildingNumberExpression: null,
          buildingNumberFrom: null,
          buildingNumberTo: null,
          estateName: null,
          blockExpression: null,
          phaseExpression: null,
          streetName: null,
        },
      ],
      policyVersion: fixture.activePolicy,
      score: 100,
      evidence: [],
      acceptanceMode: 'curated',
      firstSeen: 'before',
    },
  ]
  const historyRows = [
    {
      row: {
        id: prior.id,
        sources: { placeIdentity: prior },
        address2dId: fixture.entries[0]!.addressId,
      },
    },
  ] as unknown as PlaceHistoryState[]
  const defaults: SupplementaryDecision[] = [
    {
      placeId: 'new',
      fingerprint: addressFingerprint(['Cafe Building']),
      sourceRelease: 'now',
      previousAddressId: null,
      resolution: 'leave_unlinked',
      addressId: null,
      reason: 'Disposable default',
    },
  ]
  return {
    fixture,
    defaults,
    identities: new Map([['new', identity]]),
    historyRows,
    sourceRelease: 'now',
    officialIds: new Set<string>(),
  }
}

test('confirmed canonical continuity carries supplementary evidence and discards stale defaults', () => {
  const input = setup()
  const reviewed = { ...input.defaults[0]!, reason: 'Human decision' }
  input.fixture.decisions = [reviewed]
  expect(reconcilePlaceAddressIdentityContinuity(input)).toEqual([])
  expect(input.fixture.entries[1]).toMatchObject({
    placeId: 'new',
    addressId: input.fixture.entries[0]!.addressId,
    acceptanceMode: 'automatic',
    firstSeen: 'now',
  })
  expect(input.fixture.decisions).toEqual([reviewed])
  expect(input.fixture.entries[0]!.placeId).toBe('old')
  input.fixture.decisions = []
  const analyse = createSupplementaryAddressAnalyser(
    [],
    new Set(),
    new Map(),
    input.fixture,
  )
  const previous = {
    addressId: input.fixture.entries[0]!.addressId,
    fingerprint: addressFingerprint(['Cafe Building']),
  }
  const observation = {
    placeId: 'new',
    sourceRelease: 'now',
    texts: ['Cafe Building'],
    lng: 114,
    lat: 22,
  }
  expect(analyse(observation, previous).addressId).toBe(previous.addressId)
  expect(
    analyse({ ...observation, texts: ['Different Building'] }, previous).reason,
  ).toBe('identity_drift')
})

test('a new canonical business does not inherit the rejected predecessor Address', () => {
  const input = setup()
  input.identities.get('new')!.id = 'different-business'
  expect(reconcilePlaceAddressIdentityContinuity(input)).toEqual(input.defaults)
  expect(input.fixture.entries).toHaveLength(1)
})
