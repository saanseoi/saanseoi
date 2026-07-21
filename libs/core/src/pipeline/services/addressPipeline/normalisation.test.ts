import { expect, test } from 'bun:test'

import { createHash } from '../../utils'
import { buildAddressBaseHashInput } from './normalisation'

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
