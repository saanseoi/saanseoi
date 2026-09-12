import { expect, test } from 'bun:test'
import { addressGranularities } from '@repo/db'
import {
  addressGranularityFingerprint,
  establishAddressGranularity,
  type AddressGranularityCuration,
} from './granularity'
import {
  buildAddressBaseHashInput,
  normaliseAddressRowForPipeline,
} from './normalisation'
import { createHash } from '../../utils'

const value = {
  locale: 'en',
  formattedAddress: '134 Example Road',
  buildingNumberFrom: '134',
  streetName: 'Example Road',
}
const values = [value]
const input = { addressId: 'address-134', values, sourceVersion: '2026-09-06.0' }
const override = {
  id: 'review-134',
  revision: 1,
  addressId: input.addressId,
  inputFingerprint: addressGranularityFingerprint(values),
  granularity: 'unit' as const,
  reason: 'Reviewed ground-floor shop entrance.',
  evidence: ['Reviewed entrance plan identifies this as Shop 134.'],
}

test('number-only addresses and number ranges cannot establish scope', () => {
  for (const buildingNumberFrom of ['134', '136', '138', '60', '62']) {
    expect(
      establishAddressGranularity({
        ...input,
        values: [{ ...value, buildingNumberFrom }],
      }).granularity,
    ).toBe('unknown')
  }
  expect(
    establishAddressGranularity({
      ...input,
      values: [{ ...value, buildingNumberTo: '138' }],
    }).granularity,
  ).toBe('unknown')
})

test('classifies corrected structured components, retaining heuristic evidence', () => {
  for (const [components, expected] of [
    [{ estateName: 'Example Estate' }, 'complex'],
    [{ estateName: 'Example Estate', phaseExpression: 'Phase 2' }, 'phase'],
    [{ estateName: 'Example Estate', buildingName: 'Example House' }, 'building'],
    [
      {
        estateName: 'Example Estate',
        blockType: 'tower',
        blockRef: '1',
        blockExpression: 'TWR 1',
      },
      'building',
    ],
    [{ blockExpression: 'BLK A' }, 'building'],
    [{ blockExpression: 'A座' }, 'building'],
  ] as const) {
    const result = establishAddressGranularity({
      ...input,
      values: [{ ...value, ...components }],
    })
    expect(result.granularity).toBe(expected)
    expect(result.review.method).toBe('heuristic')
    expect(result.review.evidence.length).toBeGreaterThan(0)
  }
})

test('a school range can contain separate buildings, without labelling its numbers as units', () => {
  const campus = establishAddressGranularity({
    ...input,
    values: [
      {
        locale: 'en',
        buildingName: 'Example School',
        buildingNumberFrom: '60',
        buildingNumberTo: '62',
      },
    ],
  })
  expect(campus.granularity).toBe('unknown')
  expect(campus.review.reviewReason).toBe('ambiguous_facility_name')
  for (const number of ['60', '62']) {
    const building = establishAddressGranularity({
      ...input,
      values: [
        {
          locale: 'en',
          buildingName: 'Example School',
          blockType: 'building',
          blockRef: number,
          blockExpression: `BLDG ${number}`,
          buildingNumberFrom: number,
        },
      ],
    })
    expect(building.granularity).toBe('building')
  }
})

test('conflicting locales and ambiguous blocks remain unknown for review', () => {
  expect(
    establishAddressGranularity({
      ...input,
      values: [
        { locale: 'en', buildingName: 'Example House' },
        { locale: 'zh-hant', estateName: '示例苑' },
      ],
    }).review.reviewReason,
  ).toBe('conflicting_locales')
  expect(
    establishAddressGranularity({
      ...input,
      values: [
        {
          locale: 'en',
          blockType: 'unit',
          blockRef: '1',
          blockExpression: 'UNIT 1',
          buildingName: 'Example House',
        },
      ],
    }).review.reviewReason,
  ).toBe('ambiguous_block')
})

test('guarded curation can explicitly select every enum, including site and unknown', () => {
  for (const granularity of addressGranularities) {
    const result = establishAddressGranularity(input, {
      version: 1,
      overrides: [{ ...override, granularity }],
    })
    expect(result.granularity).toBe(granularity)
    expect(result.review).toMatchObject({
      method: 'curated',
      curation: { id: override.id, revision: 1 },
      reviewReason: null,
    })
  }
})

test('curation reopens for changed address text or components and rejects invalid decisions', () => {
  const fixture: AddressGranularityCuration = { version: 1, overrides: [override] }
  for (const changes of [
    { buildingNumberFrom: '136' },
    { formattedAddress: '136 Example Road' },
    { buildingName: 'A different building' },
  ])
    expect(() =>
      establishAddressGranularity(
        { ...input, values: [{ ...value, ...changes }] },
        fixture,
      ),
    ).toThrow('requires review: address components changed')
  for (const changes of [
    { granularity: 'invalid' },
    { reason: '' },
    { evidence: [] },
    { revision: 0 },
  ])
    expect(() =>
      establishAddressGranularity(input, {
        version: 1,
        overrides: [{ ...override, ...changes }],
      } as AddressGranularityCuration),
    ).toThrow('requires review')
  expect(() =>
    establishAddressGranularity(input, { version: 1, overrides: [override, override] }),
  ).toThrow('duplicate overrides')
})

test('curation version bounds preserve earlier classifications and include numeric revisions', () => {
  const fixture: AddressGranularityCuration = {
    version: 1,
    overrides: [
      {
        ...override,
        sourceVersionFrom: '2026-09-06.2',
        sourceVersionTo: '2026-09-06.10',
      },
    ],
  }
  expect(establishAddressGranularity(input, fixture).granularity).toBe('unknown')
  expect(
    establishAddressGranularity({ ...input, sourceVersion: '2026-09-06.10' }, fixture)
      .granularity,
  ).toBe('unit')
  expect(
    establishAddressGranularity({ ...input, sourceVersion: '2026-09-06.11' }, fixture)
      .granularity,
  ).toBe('unknown')
  expect(() =>
    establishAddressGranularity({ ...input, sourceVersion: undefined }, fixture),
  ).toThrow('missing source version')
})

test('fingerprints ignore locale row order but retain changed evidence', () => {
  const bilingual = [...values, { locale: 'zh-hant', formattedAddress: '示例道134號' }]
  expect(addressGranularityFingerprint(bilingual)).toBe(
    addressGranularityFingerprint([...bilingual].reverse()),
  )
  expect(addressGranularityFingerprint(bilingual)).not.toBe(
    addressGranularityFingerprint(values),
  )
})

test('only classification changes participate in canonical versioning', async () => {
  const normalised = normaliseAddressRowForPipeline({
    id: 'source',
    canonicalId: 'canonical',
    divisionSnapshotId: 'division',
    enFormattedAddress: 'Example Estate',
    enEstateName: 'Example Estate',
  })
  const base = { ...normalised.base, id: 'canonical' }
  expect(base.granularity).toBe('complex')
  const hash = await createHash(buildAddressBaseHashInput(base))
  expect(
    await createHash(buildAddressBaseHashInput({ ...base, granularity: 'site' })),
  ).not.toBe(hash)
  expect(
    await createHash(
      buildAddressBaseHashInput(
        Object.assign({}, base, { review: { policyVersion: 2 } }),
      ),
    ),
  ).toBe(hash)
  expect(base).not.toHaveProperty('review')
  expect(base).not.toHaveProperty('granularityProvenance')
})
