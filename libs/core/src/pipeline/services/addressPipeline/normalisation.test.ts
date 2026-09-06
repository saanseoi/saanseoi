import { expect, test } from 'bun:test'

import { createHash } from '../../utils'
import {
  buildAddressBaseHashInput,
  buildAddressBuildingNumberLookupRows,
  buildHkgovAlsSourceHashInput,
  isUnchangedHkgovAlsSourcePayload,
  normaliseAddressRowForPipeline,
} from './normalisation'

const buildBase = (sources: unknown) =>
  ({
    areaId: null,
    bbox: null,
    countryId: null,
    districtId: null,
    geometry: null,
    hamletId: null,
    id: 'address-1',
    parentAddressId: null,
    identifiers: null,
    macrohoodId: null,
    microhoodId: null,
    neighbourhoodId: null,
    sources,
    streetId: null,
    townId: null,
    villageId: null,
  }) as Parameters<typeof buildAddressBaseHashInput>[0]

test('versions explicit parent changes independently of localisation', async () => {
  const base = buildBase(null)
  expect(await createHash(buildAddressBaseHashInput(base))).not.toBe(
    await createHash(
      buildAddressBaseHashInput({ ...base, parentAddressId: 'complex-1' }),
    ),
  )
})

test('excludes release-specific source provenance from the address content hash', async () => {
  const firstRelease = buildAddressBaseHashInput(
    buildBase({
      hkgovAls: {
        cohortKey: '2025-12-16.0',
        geoAddress: 'ABC123',
        sourceFile: '2025-12-16/district.geojson',
      },
    }),
  )
  const nextRelease = buildAddressBaseHashInput(
    buildBase({
      hkgovAls: {
        cohortKey: '2026-02-04.0',
        geoAddress: 'ABC123',
        sourceFile: '2026-02-04/district.geojson',
      },
    }),
  )

  expect(firstRelease.sources).toEqual({
    hkgovAls: { geoAddress: 'ABC123' },
  })
  expect(await createHash(firstRelease)).toBe(await createHash(nextRelease))
})

test('excludes ALS release and ingestion bookkeeping from source record hashes', async () => {
  const sourceAssertion = {
    easting: 836_000,
    enFormattedAddress: '1 Example Road, Hong Kong',
    engPremisesAddressJson: '{"BuildingName":"Example House"}',
    geoAddress: 'ABC123',
    geometry: '{"coordinates":[114.1,22.3],"type":"Point"}',
    hkgovCsuId: 'CSU-1',
    northing: 819_000,
    zhHantFormattedAddress: '香港示例道1號',
  }
  const firstRelease = {
    ...sourceAssertion,
    areaId: 'area-hk',
    canonicalId: 'address-1',
    cohortKey: '2026-06',
    divisionSnapshotId: 'division-snapshot-2026-06',
    id: 'address-1',
    identityKey: 'first-identity-key',
    sourceFeatureIndexOneBased: 17,
    sourceFile: 'als_addresses_(central_district).geojson',
    sourceVersion: '2026-06-01.0',
    sources: '{"hkgovAls":{"cohortKey":"2026-06"}}',
  }
  const nextRelease = {
    ...firstRelease,
    cohortKey: '2026-07',
    divisionSnapshotId: 'division-snapshot-2026-07',
    identityKey: 'second-identity-key',
    sourceFeatureIndexOneBased: 91,
    sourceFile: 'als_addresses_(central-and-western_district).geojson',
    sourceVersion: '2026-07-01.0',
    sources: '{"hkgovAls":{"cohortKey":"2026-07"}}',
  }

  expect(await createHash(buildHkgovAlsSourceHashInput(firstRelease))).toBe(
    await createHash(buildHkgovAlsSourceHashInput(nextRelease)),
  )

  expect(
    await createHash(
      buildHkgovAlsSourceHashInput({
        ...nextRelease,
        enFormattedAddress: '2 Example Road, Hong Kong',
      }),
    ),
  ).not.toBe(await createHash(buildHkgovAlsSourceHashInput(nextRelease)))

  expect(
    await isUnchangedHkgovAlsSourcePayload(
      {
        rawProperties: firstRelease,
        sourcePayloadHash: await createHash(firstRelease),
      },
      await createHash(buildHkgovAlsSourceHashInput(nextRelease)),
    ),
  ).toBe(true)
})

test('derives only justified members of explicit building-number ranges', () => {
  const rows = buildAddressBuildingNumberLookupRows([
    {
      addressId: 'suffix-range',
      buildingNumberFrom: '5C',
      buildingNumberTo: '5E',
      buildingNumberConnector: '-',
    },
    {
      addressId: 'alternating-range',
      buildingNumberFrom: '56',
      buildingNumberTo: '60',
      buildingNumberConnector: '-',
    },
  ])

  expect(rows).toEqual([
    {
      addressId: 'suffix-range',
      buildingNumber: '5C',
      numericStem: '5',
      evidence: 'source_endpoint',
      derivation: null,
    },
    {
      addressId: 'suffix-range',
      buildingNumber: '5E',
      numericStem: '5',
      evidence: 'source_endpoint',
      derivation: null,
    },
    {
      addressId: 'suffix-range',
      buildingNumber: '5D',
      numericStem: '5',
      evidence: 'derived_member',
      derivation: 'latin_suffix_consecutive',
    },
    {
      addressId: 'alternating-range',
      buildingNumber: '56',
      numericStem: '56',
      evidence: 'source_endpoint',
      derivation: null,
    },
    {
      addressId: 'alternating-range',
      buildingNumber: '60',
      numericStem: '60',
      evidence: 'source_endpoint',
      derivation: null,
    },
    {
      addressId: 'alternating-range',
      buildingNumber: '58',
      numericStem: '58',
      evidence: 'derived_member',
      derivation: 'integer_alternating',
    },
  ])
})

test('canonicalises English block descriptors and uses locale-appropriate block order', () => {
  const cases = [
    { descriptor: 'BLOCK', expression: 'BLK A', ref: 'A', type: 'block' },
    { descriptor: 'BLKS', expression: 'BLK B', ref: 'B', type: 'block' },
    { descriptor: 'TOWER', expression: 'TWR 1', ref: '1', type: 'tower' },
    { descriptor: 'TOWERS', expression: 'TWR 1&2', ref: '1&2', type: 'tower' },
    { descriptor: 'HSES', expression: 'HSE 2', ref: '2', type: 'house' },
    { descriptor: 'APARTMENT', expression: 'APT D1', ref: 'D1', type: 'apartment' },
    { descriptor: 'BLDG', expression: 'BLDG E', ref: 'E', type: 'building' },
  ] as const

  for (const block of cases) {
    const result = normaliseAddressRowForPipeline({
      canonicalId: 'address-1',
      divisionSnapshotId: 'division-1',
      enBlockDescriptor: block.descriptor,
      enBlockNumber: block.ref,
      enFormattedAddress: '1 Example Road, Hong Kong',
      id: 'address-1',
    })
    expect(result.i18n.find(row => row.locale === 'en')).toMatchObject({
      blockExpression: block.expression,
      blockRef: block.ref,
      blockType: block.type,
      blockTypeBeforeNumber: true,
    })
  }

  const chinese = normaliseAddressRowForPipeline({
    canonicalId: 'address-1',
    divisionSnapshotId: 'division-1',
    id: 'address-1',
    zhHantBlockDescriptor: '座',
    zhHantBlockNumber: 'A',
    zhHantFormattedAddress: '香港示例道1號',
  })
  expect(chinese.i18n.find(row => row.locale === 'zh-hant')).toMatchObject({
    blockExpression: 'A座',
    blockRef: 'A',
    blockType: 'block',
    blockTypeBeforeNumber: false,
  })
})

test('splits phase references from phase names without duplicating the reference', () => {
  const cases = [
    { name: 'PHASE 2', ref: '2', phaseName: 'PHASE', phaseRef: '2' },
    { name: 'PHASE II', ref: null, phaseName: 'PHASE', phaseRef: 'II' },
    { name: 'VALAIS II', ref: null, phaseName: 'VALAIS', phaseRef: 'II' },
    { name: 'PHASE IIIB', ref: 'IIIB', phaseName: 'PHASE', phaseRef: 'IIIB' },
    { name: 'PHASE C', ref: null, phaseName: 'PHASE C', phaseRef: null },
    { name: 'PHASE C', ref: 'C', phaseName: 'PHASE', phaseRef: 'C' },
  ]

  for (const phase of cases) {
    const result = normaliseAddressRowForPipeline({
      canonicalId: 'address-1',
      divisionSnapshotId: 'division-1',
      enFormattedAddress: '1 Example Road, Hong Kong',
      enPhaseName: phase.name,
      enPhaseRef: phase.ref,
      id: 'address-1',
    })
    const english = result.i18n.find(row => row.locale === 'en')

    expect(english).toMatchObject({
      phaseExpression:
        phase.phaseRef == null
          ? phase.phaseName
          : `${phase.phaseName} ${phase.phaseRef}`,
      phaseName: phase.phaseName,
      phaseRef: phase.phaseRef,
    })
  }
})

test('reads phase fields from retained ALS JSON when older prepared rows lack columns', () => {
  const result = normaliseAddressRowForPipeline({
    canonicalId: 'address-1',
    chiPremisesAddressJson: JSON.stringify({
      ChiEstate: { ChiPhase: { PhaseName: '第二期', PhaseNo: 2 } },
    }),
    divisionSnapshotId: 'division-1',
    enFormattedAddress: '1 Example Road, Hong Kong',
    engPremisesAddressJson: JSON.stringify({
      EngEstate: { EngPhase: { PhaseName: 'PHASE II', PhaseNo: null } },
    }),
    id: 'address-1',
    zhHantFormattedAddress: '香港示例道1號',
  })

  expect(result.i18n).toMatchObject([
    {
      locale: 'en',
      phaseExpression: 'PHASE II',
      phaseName: 'PHASE',
      phaseRef: 'II',
    },
    {
      locale: 'zh-hant',
      phaseExpression: '第二期 2',
      phaseName: '第二期',
      phaseRef: '2',
    },
  ])
})
