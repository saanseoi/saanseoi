import { expect, test } from 'bun:test'
import { addressScopes } from '@repo/db'
import {
  addressScopeFingerprint,
  establishAddressScope,
  type AddressScopeCuration,
} from './scope'
import {
  buildAddressBaseHashInput,
  normaliseAddressRowForPipeline,
} from './normalisation'
import { createHash } from '../../utils'

const value = {
  meta: null,
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
  inputFingerprint: addressScopeFingerprint(values),
  scope: 'unit' as const,
  reason: 'Reviewed ground-floor shop entrance.',
  evidence: ['Reviewed entrance plan identifies this as Shop 134.'],
}

test('number-only addresses and number ranges cannot establish scope', () => {
  for (const buildingNumberFrom of ['134', '136', '138', '60', '62']) {
    expect(
      establishAddressScope({
        ...input,
        values: [{ ...value, buildingNumberFrom }],
      }).scope,
    ).toBe('unknown')
  }
  expect(
    establishAddressScope({
      ...input,
      values: [{ ...value, buildingNumberTo: '138' }],
    }).scope,
  ).toBe('unknown')
})

test('premises type describes named premises independently of address scope', () => {
  expect(
    establishAddressScope({
      ...input,
      values: [{ ...value, premisesName: 'Example Grounds' }],
    }),
  ).toMatchObject({ scope: 'premises', premisesType: null })
  for (const premisesType of ['site', 'complex'] as const) {
    expect(
      establishAddressScope(input, {
        version: 1,
        overrides: [{ ...override, scope: 'premises', premisesType }],
      }),
    ).toMatchObject({ scope: 'premises', premisesType })
    expect(
      establishAddressScope(input, {
        version: 1,
        overrides: [{ ...override, scope: 'building', premisesType }],
      }),
    ).toMatchObject({ scope: 'building', premisesType })
  }
})

test('classifies corrected structured components, retaining heuristic evidence', () => {
  for (const [components, expected] of [
    [{ premisesName: 'Example Estate' }, 'premises'],
    [{ premisesName: 'Example Estate', phaseExpression: 'Phase 2' }, 'phase'],
    [{ premisesName: 'Example Estate', buildingName: 'Example House' }, 'building'],
    [
      {
        premisesName: 'Example Estate',
        blockType: 'tower',
        blockRef: '1',
        blockExpression: 'TWR 1',
      },
      'building',
    ],
    [{ blockExpression: 'BLK A' }, 'building'],
    [{ blockExpression: 'A座' }, 'building'],
  ] as const) {
    const result = establishAddressScope({
      ...input,
      values: [{ ...value, ...components }],
    })
    expect(result.scope).toBe(expected)
    expect(result.review.method).toBe('heuristic')
    expect(result.review.evidence.length).toBeGreaterThan(0)
  }
})

test('a school range can contain separate buildings, without labelling its numbers as units', () => {
  const campus = establishAddressScope({
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
  expect(campus.scope).toBe('unknown')
  expect(campus.review.reviewReason).toBe('ambiguous_facility_name')
  for (const number of ['60', '62']) {
    const building = establishAddressScope({
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
    expect(building.scope).toBe('building')
  }
})

test('conflicting locales and ambiguous blocks remain unknown for review', () => {
  expect(
    establishAddressScope({
      ...input,
      values: [
        { locale: 'en', buildingName: 'Example House' },
        { locale: 'zh-hant', premisesName: '示例苑' },
      ],
    }).review.reviewReason,
  ).toBe('conflicting_locales')
  expect(
    establishAddressScope({
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

test('guarded curation can explicitly select every enum, including premises and unknown', () => {
  for (const scope of addressScopes) {
    const result = establishAddressScope(input, {
      version: 1,
      overrides: [{ ...override, scope }],
    })
    expect(result.scope).toBe(scope)
    expect(result.review).toMatchObject({
      method: 'curated',
      curation: { id: override.id, revision: 1 },
      reviewReason: null,
    })
  }
})

test('curation reopens for changed address text or components and rejects invalid decisions', () => {
  const fixture: AddressScopeCuration = { version: 1, overrides: [override] }
  for (const changes of [
    { buildingNumberFrom: '136' },
    { formattedAddress: '136 Example Road' },
    { buildingName: 'A different building' },
  ])
    expect(() =>
      establishAddressScope({ ...input, values: [{ ...value, ...changes }] }, fixture),
    ).toThrow('requires review: address components changed')
  for (const changes of [
    { scope: 'invalid' },
    { reason: '' },
    { evidence: [] },
    { revision: 0 },
  ])
    expect(() =>
      establishAddressScope(input, {
        version: 1,
        overrides: [{ ...override, ...changes }],
      } as AddressScopeCuration),
    ).toThrow('requires review')
  expect(() =>
    establishAddressScope(input, { version: 1, overrides: [override, override] }),
  ).toThrow('duplicate overrides')
})

test('curation version bounds preserve earlier classifications and include numeric revisions', () => {
  const fixture: AddressScopeCuration = {
    version: 1,
    overrides: [
      {
        ...override,
        sourceVersionFrom: '2026-09-06.2',
        sourceVersionTo: '2026-09-06.10',
      },
    ],
  }
  expect(establishAddressScope(input, fixture).scope).toBe('unknown')
  expect(
    establishAddressScope({ ...input, sourceVersion: '2026-09-06.10' }, fixture).scope,
  ).toBe('unit')
  expect(
    establishAddressScope({ ...input, sourceVersion: '2026-09-06.11' }, fixture).scope,
  ).toBe('unknown')
  expect(() =>
    establishAddressScope({ ...input, sourceVersion: undefined }, fixture),
  ).toThrow('missing source version')
})

test('fingerprints ignore locale row order but retain changed evidence', () => {
  const bilingual = [
    ...values,
    {
      meta: null,
      locale: 'zh-hant',
      formattedAddress: '示例道134號',
    },
  ]
  expect(addressScopeFingerprint(bilingual)).toBe(
    addressScopeFingerprint([...bilingual].reverse()),
  )
  expect(addressScopeFingerprint(bilingual)).not.toBe(addressScopeFingerprint(values))
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
  expect(base.scope).toBe('premises')
  const hash = await createHash(buildAddressBaseHashInput(base))
  expect(
    await createHash(
      buildAddressBaseHashInput(Object.assign({}, base, { premisesType: 'site' })),
    ),
  ).toBe(hash)
  expect(
    await createHash(
      buildAddressBaseHashInput(
        Object.assign({}, base, { review: { policyVersion: 2 } }),
      ),
    ),
  ).toBe(hash)
  expect(base).not.toHaveProperty('review')
  expect(base).not.toHaveProperty('scopeProvenance')
})

test('premises purpose curation is retained as evidence outside the canonical hash', async () => {
  expect(
    establishAddressScope({
      ...input,
      values: [{ ...value, premisesName: 'Example School' }],
    }).premisesKind,
  ).toBeNull()
  expect(
    establishAddressScope(input, {
      version: 1,
      overrides: [{ ...override, premisesKind: 'school' }],
    }).premisesKind,
  ).toBe('school')
  expect(() =>
    establishAddressScope(input, {
      version: 1,
      overrides: [{ ...override, premisesKind: 'invalid' as never }],
    }),
  ).toThrow('invalid premises kind')
  const base = {
    ...normaliseAddressRowForPipeline({
      id: 'example',
      canonicalId: 'example',
      divisionSnapshotId: 'division',
    }).base,
    id: 'example',
  }
  expect(await createHash(buildAddressBaseHashInput(base))).toBe(
    await createHash(
      buildAddressBaseHashInput(Object.assign({}, base, { premisesKind: 'school' })),
    ),
  )
})
