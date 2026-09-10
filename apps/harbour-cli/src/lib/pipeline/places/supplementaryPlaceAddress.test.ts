import { describe, expect, test } from 'bun:test'
import policyFixture from './testFixtures/supplementaryAddressPolicy.json'
import {
  addressFingerprint,
  compactAddressResolution,
  createSupplementaryAddressAnalyser,
  emptySupplementaryEntryLedger,
  parseSupplementaryCuration,
  parseSupplementaryEntryLedger,
  supplementaryIdentity,
  type SupplementaryEntry,
} from './supplementaryPlaceAddress.ts'
import { buildSupplementaryAddressRows } from './supplementaryPlaceAddressRows.ts'
import type { PlaceAddressDefinition } from './placeAddressMatcher.ts'
import type { currentSchema } from '@repo/db'
import { resolveApiFieldFixture } from '@repo/db/apiFieldFixtures'
import fieldsFixture from '../../../../../../fixtures/meta/apiFields/api-places-v0.1@overture-1.12-to-1.18.json'

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
  const fixture = parseSupplementaryCuration(
    structuredClone(policyFixture),
    emptySupplementaryEntryLedger(),
  )
  const ids = new Set(definitions.map(row => row.addressId))
  const geometry = new Map(
    definitions.map(row => [row.addressId, { lng: 113.941, lat: 22.29 }]),
  )
  return {
    fixture,
    ids,
    geometry,
    analyse: createSupplementaryAddressAnalyser(definitions, ids, geometry, fixture),
  }
}

describe('supplementary Place Address policy', () => {
  test('indexed decisions retain first precedence and follow ledger replacement', () => {
    const { fixture, analyse } = setup()
    const source = observation('Citygate, 20 Tat Tung Road')
    const decision = {
      placeId: source.placeId,
      fingerprint: addressFingerprint(source.texts),
      sourceRelease: source.sourceRelease,
      resolution: 'link_existing' as const,
      previousAddressId: null,
      addressId: citygate.addressId,
      reason: 'Selected address',
    }
    const retired = {
      ...decision,
      resolution: 'leave_unlinked' as const,
      addressId: null,
    }
    fixture.decisions.push(decision, retired)
    expect(analyse(source, null).addressId).toBe(citygate.addressId)
    fixture.decisions = [retired, decision]
    expect(analyse(source, null).reason).toBe('explicit_retirement')
  })
  test('link_existing selects ALS and keep_existing requires the previous identity', () => {
    const source = observation('Citygate, 20 Tat Tung Road')
    for (const resolution of ['link_existing', 'keep_existing'] as const) {
      const { fixture, analyse } = setup()
      const decision = {
        placeId: source.placeId,
        fingerprint: addressFingerprint(source.texts),
        sourceRelease: source.sourceRelease,
        resolution,
        previousAddressId: resolution === 'keep_existing' ? citygate.addressId : null,
        addressId: citygate.addressId,
        reason: 'Selected address',
      }
      fixture.decisions.push(decision)
      const previous =
        resolution === 'keep_existing'
          ? {
              addressId: citygate.addressId,
              fingerprint: addressFingerprint(source.texts),
            }
          : null
      expect(analyse(source, previous)).toMatchObject({
        tier: 'direct',
        addressId: citygate.addressId,
      })
      if (resolution === 'keep_existing') {
        decision.addressId = 'another-address'
        expect(analyse(source, previous).reason).toBe('keep_decision_changes_identity')
      }
    }
  })
  test('decision codes enforce whether supplementary values are required', () => {
    const base = {
      placeId: 'p',
      fingerprint: 'f',
      sourceRelease: '2026-09-01',
      previousAddressId: null,
      addressId: citygate.addressId,
      reason: 'Reviewed',
    }
    const parse = (decision: unknown) =>
      parseSupplementaryCuration({
        ...structuredClone(policyFixture),
        decisions: [decision],
      })
    expect(() => parse({ ...base, resolution: 'create_supplementary' })).toThrow(
      'address values',
    )
    expect(() =>
      parse({
        ...base,
        resolution: 'link_existing',
        address: { baseAddressId: null, values: [] },
      }),
    ).toThrow('address values')
    expect(() => parse({ ...base, resolution: 'leave_unlinked' })).toThrow('Invalid')
    for (const resolution of ['replace', 'keep', 'retire'])
      expect(() => parse({ ...base, resolution })).toThrow('Invalid')
  })
  test('automatic canonical and supplementary links require known nearby geometry', () => {
    for (const source of [
      'Citygate, Tat Tung Road',
      'Citygate Outlets, Tat Tung Road',
    ]) {
      for (const point of [
        null,
        { lng: 114.041, lat: 22.29 },
        { lng: NaN, lat: 22.29 },
      ]) {
        const { analyse, geometry } = setup()
        geometry.clear()
        if (point) geometry.set(citygate.addressId, point)
        expect(analyse(observation(source), null)).toMatchObject({
          tier: 'review',
          reason: 'outside_proximity_allowance',
        })
      }
    }
  })
  test('canonical component matching requires a twenty-point lead', () => {
    const { analyse } = setup([citygate, { ...citygate, addressId: 'rival' }])
    expect(analyse(observation('Citygate, Tat Tung Road'), null)).toMatchObject({
      tier: 'review',
      reason: 'multiple_close_matches',
    })
  })
  test('a recognised block missing from a candidate prevents automatic acceptance', () => {
    const { analyse } = setup([
      citygate,
      {
        ...citygate,
        addressId: 'block-vocabulary',
        blockExpression: 'BLOCK 2',
        streetName: 'Other Road',
      },
    ])
    const result = analyse(observation('Citygate, Block 2, 20 Tat Tung Road'), null)
    expect(
      result.candidates.find(row => row.addressId === citygate.addressId)
        ?.contradictions,
    ).toContain('blockExpression')
    expect(['direct', 'supplementary']).not.toContain(result.tier)
  })
  test('rebuilds an edited number range from a checked-in decision and replays it', () => {
    const source = observation('Citygate, 20 Tat Tung Road')
    const { addressId: _id, ...seed } = citygate
    const values = [
      {
        ...seed,
        buildingNumberFrom: '20',
        buildingNumberTo: '24',
        buildingNumberExpression: '20–24',
        formattedAddress: 'Citygate, 20–24 Tat Tung Road',
      },
    ]
    const policy = {
      ...structuredClone(policyFixture),
      decisions: [
        {
          placeId: source.placeId,
          fingerprint: addressFingerprint(source.texts),
          sourceRelease: source.sourceRelease,
          previousAddressId: null,
          resolution: 'create_supplementary',
          addressId: supplementaryIdentity(values).addressId,
          reason: 'Reviewed building range',
          address: { baseAddressId: citygate.addressId, values },
        },
      ],
    }
    const fixture = parseSupplementaryCuration(policy, emptySupplementaryEntryLedger())
    const analyse = createSupplementaryAddressAnalyser(
      [citygate],
      new Set([citygate.addressId]),
      new Map(),
      fixture,
    )
    const first = analyse(source, null)
    expect(first.tier).toBe('supplementary')
    expect(first.entry?.values[0]?.buildingNumberTo).toBe('24')
    expect(first.entry?.acceptanceMode).toBe('curated')
    expect(analyse(source, null).addressId).toBe(first.addressId)
    expect(fixture.entries).toHaveLength(1)
    const rebuilt = parseSupplementaryCuration(policy, emptySupplementaryEntryLedger())
    expect(
      createSupplementaryAddressAnalyser(
        [citygate],
        new Set([citygate.addressId]),
        new Map(),
        rebuilt,
      )(source, null).addressId,
    ).toBe(first.addressId)
    expect(() =>
      parseSupplementaryCuration({
        ...policy,
        decisions: [{ ...policy.decisions[0], addressId: 'tampered' }],
      }),
    ).toThrow('Invalid edited')
  })
  test('keeps generated entries out of the version-controlled policy', () => {
    expect(() => parseSupplementaryCuration({ ...policyFixture, entries: [] })).toThrow(
      'must not contain generated entries',
    )

    expect(
      parseSupplementaryCuration(policyFixture, emptySupplementaryEntryLedger())
        .entries,
    ).toEqual([])
  })

  test('rejects generated ledgers from another generation format', () => {
    expect(() =>
      parseSupplementaryEntryLedger({
        ...emptySupplementaryEntryLedger(),
        generationVersion: 2,
      }),
    ).toThrow('Invalid generated Overture Place Address entry ledger')
  })

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
    expect(
      parseSupplementaryCuration(policyFixture, {
        ...emptySupplementaryEntryLedger(),
        entries: fixture.entries,
      }).entries,
    ).toHaveLength(1)
  })

  test('keeps only the premise-side building text', () => {
    const chinaFenHin: PlaceAddressDefinition = {
      ...citygate,
      addressId: 'als-china-fen-hin',
      buildingName: 'China Fen Hin Building',
      buildingNumberExpression: '5',
      buildingNumberFrom: '5',
      formattedAddress: 'China Fen Hin Building, 5 Cheung Yue Street',
      streetName: 'Cheung Yue Street',
    }
    const { analyse } = setup([chinaFenHin])

    const withTrailingLocality = analyse(
      observation(
        'China Fen Hin Building, 5 Cheung Yue St Cheung Sha Wan',
        'china-fen-hin-locality',
      ),
      null,
    )
    expect(withTrailingLocality.entry?.values[0]).toMatchObject({
      buildingName: 'CHINA FEN HIN BUILDING',
      buildingNumberExpression: '5',
      streetName: 'Cheung Yue Street',
    })
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
  test('street-only and number-conflicting street evidence remain delayed', () => {
    const { analyse } = setup()
    const streetOnly = analyse(observation('Tat Tung Road'), null)
    expect(streetOnly.tier).toBe('delayed')
    expect(streetOnly.reason).toBe('no_useful_partial_match')
    expect(streetOnly.candidates[0]?.breakdown).toEqual({ street: 30 })

    const wrongNumber = analyse(observation('99 Tat Tung Road'), null)
    expect(wrongNumber.tier).toBe('delayed')
    expect(wrongNumber.candidates[0]?.contradictions).toContain('number')
  })
  test('weak premise candidates are delayed instead of becoming curation work', () => {
    const citygateEstate: PlaceAddressDefinition = {
      ...citygate,
      buildingName: null,
      estateName: 'Citygate',
    }
    const { analyse, geometry } = setup([citygateEstate])
    geometry.clear()
    const result = analyse(observation('Citygate Outlets, Tat Tung Road'), null)

    expect(result.tier).toBe('delayed')
    expect(result.reason).toBe('below_automatic_threshold')
    expect(result.candidates[0]).toMatchObject({
      addressId: citygate.addressId,
      breakdown: { estateName: 45, street: 30 },
      score: 75,
    })
  })
  test('one matching component cannot suppress same-kind contradictions', () => {
    const alternateBuilding: PlaceAddressDefinition = {
      ...citygate,
      addressId: 'als-citygate-outlets',
      buildingName: 'Other Tower',
      formattedAddress: 'Citygate Outlets, 20 Tat Tung Road',
    }
    const { analyse } = setup([citygate, alternateBuilding])
    const result = analyse(observation('Other Tower, Citygate, Tat Tung Road'), null)
    const candidate = result.candidates.find(
      item => item.addressId === alternateBuilding.addressId,
    )

    expect(candidate?.contradictions).toContain('buildingName')
    expect(['direct', 'supplementary']).not.toContain(result.tier)
  })
  test('locality-shaped component matches do not turn street addresses into reviews', () => {
    const hongKong: PlaceAddressDefinition = {
      ...citygate,
      addressId: 'als-hong-kong',
      buildingName: 'Hong Kong',
      buildingNumberExpression: null,
      buildingNumberFrom: null,
      formattedAddress: 'Hong Kong',
      streetName: null,
    }
    const chiMaHang: PlaceAddressDefinition = {
      ...citygate,
      addressId: 'als-chi-ma-hang-39',
      buildingName: null,
      buildingNumberExpression: '39',
      buildingNumberFrom: '39',
      formattedAddress: '39 Chi Ma Hang Road',
      streetName: 'Chi Ma Hang Road',
    }
    const { analyse } = setup([hongKong, chiMaHang])

    const result = analyse(
      observation('39 Chi Ma Hang Road, Cheung Chau, Hong Kong'),
      null,
    )
    expect(result.tier).toBe('delayed')
    expect(result.reason).toBe('no_useful_partial_match')
    expect(
      result.candidates.find(candidate => candidate.addressId === hongKong.addressId),
    ).toBeUndefined()
  })
  test('compacts non-review resolutions but retains review evidence', () => {
    const { analyse } = setup([citygate, { ...citygate, addressId: 'other' }])
    const delayed = analyse(observation('Tat Tung Road'), null)
    expect(compactAddressResolution(delayed)).toMatchObject({
      candidates: [],
      parsed: [],
      tier: 'delayed',
    })
    const review = analyse(observation('Citygate Outlets, Tat Tung Road'), null)
    const compactReview = compactAddressResolution(review)
    expect(compactReview.candidates.length).toBeGreaterThan(0)
    expect(compactReview.candidates[0]).not.toHaveProperty('parsed')
  })
  test('geometry adds 25 points only to a nearby named candidate', () => {
    const { analyse, geometry } = setup([citygate, { ...citygate, addressId: 'other' }])
    geometry.set(citygate.addressId, { lng: 113.941, lat: 22.29 })
    geometry.set('other', { lng: 114.041, lat: 22.29 })
    const result = analyse(observation('Citygate Outlets, Tat Tung Road'), null)
    expect(result.addressId).toStartWith('opa-')
    expect(
      result.candidates.find(row => row.addressId === citygate.addressId)?.breakdown,
    ).toMatchObject({ geometry: 25 })
  })
  test('accepted curation wins over a new exact ALS match and changed scores', () => {
    const { fixture, analyse } = setup()
    const first = analyse(observation('Citygate Outlets, Tat Tung Road'), null)
    if (!first.addressId) throw new Error('Expected a supplementary Address ID.')
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
        addressId: first.addressId,
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
      resolution: 'leave_unlinked',
      addressId: null,
      reason: 'Premise identity cannot be reproduced.',
    })
    expect(analyse(changed, null).tier).toBe('delayed')
  })
  test('a unit change carries the curated 2D address forward', () => {
    const { analyse } = setup()
    const first = analyse(observation('Shop 12, Citygate Outlets, Tat Tung Road'), null)
    if (!first.addressId) throw new Error('Expected a supplementary Address ID.')
    expect(
      analyse(
        observation(
          'Shop 99, Citygate Outlets, Tat Tung Road',
          'place-1',
          '2026-09-23.0',
        ),
        {
          addressId: first.addressId,
          fingerprint: first.fingerprint,
        },
      ).addressId,
    ).toBe(first.addressId)
  })
  test('rejects tampered identity keys and invalid thresholds', () => {
    const { fixture, analyse } = setup()
    analyse(observation('Citygate Outlets, Tat Tung Road'), null)
    const [entry] = fixture.entries
    if (!entry) throw new Error('Expected a generated entry.')
    entry.addressId = 'arbitrary'
    expect(() =>
      parseSupplementaryCuration(policyFixture, {
        ...emptySupplementaryEntryLedger(),
        entries: fixture.entries,
      }),
    ).toThrow('identity mismatch')
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
      firstSeen: '2026-08-19.0',
    }
    fixture.entries.push(entry)
    const analyse = createSupplementaryAddressAnalyser(
      [],
      new Set(),
      new Map(),
      parseSupplementaryCuration(policyFixture, {
        ...emptySupplementaryEntryLedger(),
        entries: fixture.entries,
      }),
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
