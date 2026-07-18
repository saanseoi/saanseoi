import { expect, test } from 'bun:test'

import { buildHkgovAlsPremiseIdentity } from './hkgovAlsIdentity.ts'

test('distinct ALS premises at one GeoAddress receive distinct stable IDs', () => {
  const base = {
    blockDescriptor: null,
    blockNumber: null,
    buildingName: 'TOWER ONE',
    csuId: 'CSU-1',
    districtName: 'CENTRAL AND WESTERN',
    estateName: 'EXAMPLE ESTATE',
    geoAddress: 'GA-1',
    latitude: 22.281,
    longitude: 114.158,
    numberFrom: '1',
    numberTo: null,
    phaseName: null,
    phaseNumber: null,
    routeKind: 'street' as const,
    routeName: 'EXAMPLE ROAD',
    unitDescriptor: null,
    unitNumber: null,
  }
  const first = buildHkgovAlsPremiseIdentity(base)
  const second = buildHkgovAlsPremiseIdentity({
    ...base,
    buildingName: 'TOWER TWO',
  })

  expect(first.identityKey).not.toBe(second.identityKey)
  expect(first.continuityKey).toBe(second.continuityKey)
})
