import { expect, test } from 'bun:test'

import { createHash } from '../../utils'
import {
  buildAddressBaseHashInput,
  buildAddressBuildingNumberLookupRows,
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
    identifiers: null,
    macrohoodId: null,
    microhoodId: null,
    neighbourhoodId: null,
    sources,
    streetId: null,
    townId: null,
    villageId: null,
  }) as Parameters<typeof buildAddressBaseHashInput>[0]

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
