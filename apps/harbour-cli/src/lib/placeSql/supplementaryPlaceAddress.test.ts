import { describe, expect, test } from 'bun:test'
import policyFixture from '../../../../../fixtures/meta/curations/overture-place-address.json'
import {
  addressFingerprint,
  createSupplementaryAddressAnalyser,
  parseSupplementaryCuration,
  supplementaryIdentity,
  type SupplementaryEntry,
} from './supplementaryPlaceAddress.ts'
import { buildSupplementaryAddressRows } from './supplementaryPlaceAddressRows.ts'
import type { PlaceAddressDefinition } from './placeAddressMatcher.ts'
import type { currentSchema } from '@repo/db'
import { resolveApiFieldFixture } from '@repo/db/apiFieldFixtures'
import fieldsFixture from '../../../../../fixtures/meta/apiFields/api-places-v0.1@overture-1.12-to-1.18.json'

const citygate: PlaceAddressDefinition = {
  addressId: 'als-citygate',
  locale: 'en',
  formattedAddress: 'Citygate, 20 Tat Tung Road',
  buildingName: 'Citygate',
  streetName: 'Tat Tung Road',
  buildingNumberExpression: '20',
  buildingNumberFrom: '20',
  buildingNumberTo: null,
  estateName: null,
  blockExpression: null,
  phaseExpression: null,
}
const observation = (
  text: string,
  placeId = 'place-1',
  sourceRelease = '2026-08-19.0',
) => ({
  placeId,
  sourceRelease,
  texts: [text],
  lng: 113.941,
  lat: 22.29,
})
function setup(definitions = [citygate]) {
  const fixture = parseSupplementaryCuration(structuredClone(policyFixture))
  const ids = new Set(definitions.map(row => row.addressId))
  const geometry = new Map<string, { lng: number; lat: number }>()
  return {
    fixture,
    ids,
    geometry,
    analyse: createSupplementaryAddressAnalyser(definitions, ids, geometry, fixture),
  }
}

describe('supplementary Place Address policy', () => {
  test('every Places cohort has a provenance signature for the supplementary source', () => {
    for (const anchor of fieldsFixture.lineageAnchors) {
      expect(anchor.sourceSchemas['ds-hk-overture-place']).toBeDefined()
      expect(
        resolveApiFieldFixture({
          apiVersion: fieldsFixture.apiVersion,
          domainCode: fieldsFixture.domainCode,
          schemaVersion: fieldsFixture.schemaVersion,
          rulesetVersion: fieldsFixture.rulesetVersion,
          lineageSnapshotVersions: [anchor.snapshotVersion],
          sourceSchemas: anchor.sourceSchemas,
        })?.fields,
      ).toContainEqual(
        expect.objectContaining({
          apiField: 'place.relationships.address',
          sourceDatasetCode: 'ds-hk-overture-place',
        }),
      )
    }
  })
  test('direct exact canonical match does not create a supplementary identity', () => {
    const { fixture, analyse } = setup()
    expect(analyse(observation('Citygate, 20 Tat Tung Road'), null).tier).toBe('direct')
    expect(fixture.entries).toHaveLength(0)
  })
  test('Citygate Outlets retains its building name, with ALS as derivation evidence', () => {
    const { fixture, analyse } = setup()
    const result = analyse(observation('Citygate Outlets, Tat Tung Road'), null)
    expect(result.tier).toBe('supplementary')
    expect(result.entry?.values[0]).toMatchObject({
      buildingName: 'CITYGATE OUTLETS',
      streetName: 'Tat Tung Road',
      buildingNumberExpression: null,
    })
    expect(result.entry?.baseAddressId).toBe('als-citygate')
    expect(parseSupplementaryCuration(fixture).entries).toHaveLength(1)
  })
  test('shares 2D identities across Places with distinct shops and floors', () => {
    const { analyse } = setup()
    const a = analyse(
      observation('Shop 12, G/F, Citygate Outlets, Tat Tung Road', 'shop-1'),
      null,
    )
    const b = analyse(
      observation('Shop 99, 2/F, Citygate Outlets, Tat Tung Road', 'shop-2'),
      null,
    )
    expect(a.tier).toBe('supplementary')
    expect(b.addressId).toBe(a.addressId)
    expect(a.entry?.placeId).not.toBe(b.entry?.placeId)
    expect(a.entry?.values[0]?.formattedAddress).not.toContain('Shop')
  })
  test('ties and contradictions stop; bare numbers never create geometry candidates', () => {
    const { analyse, geometry } = setup([citygate, { ...citygate, addressId: 'other' }])
    expect(analyse(observation('Citygate Outlets, Tat Tung Road'), null).tier).toBe(
      'review',
    )
    expect(analyse(observation('Citygate Outlets, 99 Tat Tung Road'), null).tier).toBe(
      'review',
    )
    geometry.set(citygate.addressId, { lng: 113.941, lat: 22.29 })
    const bare = analyse(observation('20'), null)
    expect(bare.tier).toBe('delayed')
    expect(bare.candidates).toHaveLength(0)
  })
  test('geometry only disambiguates named candidates with the configured margin', () => {
    const { analyse, geometry } = setup([citygate, { ...citygate, addressId: 'other' }])
    geometry.set(citygate.addressId, { lng: 113.941, lat: 22.29 })
    geometry.set('other', { lng: 114.041, lat: 22.29 })
    expect(
      analyse(observation('Citygate Outlets, Tat Tung Road'), null).addressId,
    ).toStartWith('opa-')
  })
  test('accepted curation wins over a new exact ALS match and changed scores', () => {
    const { fixture, analyse } = setup()
    const first = analyse(observation('Citygate Outlets, Tat Tung Road'), null)
    const later = createSupplementaryAddressAnalyser(
      [
        citygate,
        {
          ...citygate,
          addressId: 'new-exact',
          formattedAddress: 'Citygate Outlets, Tat Tung Road',
        },
      ],
      new Set(['als-citygate', 'new-exact']),
      new Map(),
      fixture,
    )
    expect(
      later(observation('Citygate Outlets, Tat Tung Road', 'place-1', '2026-09-23.0'), {
        addressId: first.addressId!,
        fingerprint: first.fingerprint,
      }).addressId,
    ).toBe(first.addressId)
  })
  test('last direct relationship precedes scoring, and missing bases require drift review', () => {
    const { fixture, analyse } = setup()
    const text = 'Citygate Outlets, Tat Tung Road'
    expect(
      analyse(observation(text), {
        addressId: citygate.addressId,
        fingerprint: addressFingerprint([text]),
      }).tier,
    ).toBe('direct')
    const first = analyse(observation(text), null)
    const missing = createSupplementaryAddressAnalyser(
      [],
      new Set(),
      new Map(),
      fixture,
    )
    const review = missing(observation(text, 'place-1', '2026-09-23.0'), null)
    expect(review.reason).toBe('identity_drift')
    expect(review.previous).toMatchObject({ addressId: first.addressId })
  })
  test('publisher changes require an explicit retirement or replacement decision', () => {
    const { fixture, analyse } = setup()
    const first = analyse(observation('Citygate Outlets, Tat Tung Road'), null)
    const changed = observation(
      'Citygate Annex, Tat Tung Road',
      'place-1',
      '2026-09-23.0',
    )
    expect(analyse(changed, null).reason).toBe('identity_drift')
    fixture.decisions.push({
      placeId: changed.placeId,
      fingerprint: addressFingerprint(changed.texts),
      sourceRelease: changed.sourceRelease,
      previousAddressId: first.addressId,
      resolution: 'retire',
      addressId: null,
      reason: 'Premise identity cannot be reproduced.',
    })
    expect(analyse(changed, null).tier).toBe('delayed')
  })
  test('a unit change carries the curated 2D address forward', () => {
    const { analyse } = setup()
    const first = analyse(observation('Shop 12, Citygate Outlets, Tat Tung Road'), null)
    expect(
      analyse(
        observation(
          'Shop 99, Citygate Outlets, Tat Tung Road',
          'place-1',
          '2026-09-23.0',
        ),
        {
          addressId: first.addressId!,
          fingerprint: first.fingerprint,
        },
      ).addressId,
    ).toBe(first.addressId)
  })
  test('rejects tampered identity keys and invalid thresholds', () => {
    const { fixture, analyse } = setup()
    analyse(observation('Citygate Outlets, Tat Tung Road'), null)
    fixture.entries[0]!.addressId = 'arbitrary'
    expect(() => parseSupplementaryCuration(fixture)).toThrow('identity mismatch')
    const invalid = structuredClone(policyFixture)
    invalid.policies['supplementary-v1'].automaticThreshold = -1
    expect(() => parseSupplementaryCuration(invalid)).toThrow('policy')
  })
  test('materialises one shared row with both source Place IDs and only recorded ALS divisions', async () => {
    const { analyse } = setup()
    const resolutions = [
      analyse(observation('Citygate Outlets, Tat Tung Road', 'p1'), null),
      analyse(observation('Citygate Outlets, Tat Tung Road', 'p2'), null),
    ]
    const rows = await buildSupplementaryAddressRows({
      resolutions,
      officialAddresses: new Map([
        [
          citygate.addressId,
          {
            id: citygate.addressId,
            snapshotId: 'als-snapshot',
            divisionSnapshotId: 'division',
            countryId: 'hk',
            districtId: 'islands',
          } as typeof currentSchema.address2d.$inferSelect,
        ],
      ]),
      snapshotId: 'supplementary',
      divisionSnapshotId: 'division',
      sourceReleaseId: 'supp-release',
      placeSourceReleaseId: 'place-release',
      sourceVersion: '2026-08-19.0',
      datasetId: 'supp-dataset',
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.current).toMatchObject({
      countryId: 'hk',
      districtId: 'islands',
      geometry: null,
      streetId: null,
    })
    expect(rows[0]?.canonical.sources.map(source => source.sourceRecordId)).toEqual([
      'p1',
      'p2',
    ])
  })
  test('a curated Address without an ALS base has no division IDs', async () => {
    const { fixture } = setup()
    const values = [
      {
        ...citygate,
        addressId: undefined,
        formattedAddress: 'Remote Pavilion',
        buildingName: 'Remote Pavilion',
        streetName: null,
      },
    ]
    const entry: SupplementaryEntry = {
      placeId: 'remote',
      ...supplementaryIdentity(values),
      fingerprint: addressFingerprint(['Remote Pavilion']),
      normalisedPublisherAddress: ['REMOTE PAVILION'],
      baseAddressId: null,
      values,
      score: 0,
      evidence: [],
      policyVersion: fixture.activePolicy,
      acceptanceMode: 'curated',
      firstAcceptedSourceRelease: '2026-08-19.0',
    }
    fixture.entries.push(entry)
    const analyse = createSupplementaryAddressAnalyser(
      [],
      new Set(),
      new Map(),
      parseSupplementaryCuration(fixture),
    )
    const rows = await buildSupplementaryAddressRows({
      resolutions: [analyse(observation('Remote Pavilion', 'remote'), null)],
      officialAddresses: new Map(),
      snapshotId: 'supplementary',
      divisionSnapshotId: 'division',
      sourceReleaseId: 'supp-release',
      placeSourceReleaseId: 'place-release',
      sourceVersion: '2026-08-19.0',
      datasetId: 'supp-dataset',
    })
    expect(rows[0]?.current).toMatchObject({
      countryId: null,
      districtId: null,
      geometry: null,
    })
  })
})
