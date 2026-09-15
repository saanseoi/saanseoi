import { expect, test } from 'bun:test'
import { canonicalIdentifiers } from './canonicalIdentifiers'

test('canonical identifiers retain publisher field spelling without changing source objects', () => {
  const source = {
    hkgovPland: { ppu: '2', spu: '26', tpu: '263', subunit: '9' },
    hkgovLandsd: { geoNameId: '001' },
    hkgovCsuId: '000123',
  }
  const expected = {
    'PLAND:PPU': '2',
    'PLAND:SPU': '26',
    'PLAND:TPU': '263',
    'PLAND:SUBUNIT': '9',
    'LANDSD:GEO_NAME_ID': '001',
    'ALS:CsuId': '000123',
  }
  expect(canonicalIdentifiers(source)).toEqual(expected)
  expect(canonicalIdentifiers(expected)).toEqual(expected)
  expect(source.hkgovPland.subunit).toBe('9')
})
