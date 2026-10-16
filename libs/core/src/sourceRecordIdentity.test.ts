import { describe, expect, test } from 'bun:test'
import {
  assertSourceRecordIdentity,
  composeSourceRecordId,
  composeSourceRecordIds,
} from './sourceRecordIdentity'
import { datasetSourceRecordIdentity } from './pipeline/services/sources/datasetSourceRecordIdentity'

const had = datasetSourceRecordIdentity('ds-hk-hkgov-had-division-area-district')
const density = datasetSourceRecordIdentity(
  'ds-hk-hkgov-censtatd-land-area-population-density-district',
)
const hma = datasetSourceRecordIdentity(
  'ds-hk-hkgov-censtatd-housing-market-areas-building-groups',
)
const planning = datasetSourceRecordIdentity('ds-hk-hkgov-pland-division-pu')

describe('dataset source-record identity contracts', () => {
  test('retains publisher keys without adding publisher or dataset namespaces', () => {
    expect(composeSourceRecordId(had, { OBJECTID: 0 })).toBe('0')
    expect(composeSourceRecordId(had, { OBJECTID: '001' })).toBe('001')
    expect(
      composeSourceRecordId(density, { layerName: 'Density_2024', gmlId: '003' }),
    ).toBe('003')
    expect(() => composeSourceRecordId(had, { OBJECTID: '' })).toThrow('OBJECTID')
    expect(() =>
      composeSourceRecordIds(had, [{ OBJECTID: 1 }, { OBJECTID: '1' }]),
    ).toThrow('Duplicate')
  })
  test('distinguishes multilayer keys and escapes composite components', () => {
    expect(
      composeSourceRecordIds(hma, [
        { layerName: 'BG_21C', gmlId: '001' },
        { layerName: 'HMA_21C', gmlId: '001' },
      ]),
    ).toEqual(['BG_21C:001', 'HMA_21C:001'])
    expect(
      composeSourceRecordIds(hma, [
        { layerName: 'A:B', gmlId: 'C' },
        { layerName: 'A', gmlId: 'B:C' },
      ]),
    ).toEqual(['A%3AB:C', 'A:B%3AC'])
  })
  test('uses ordered native ID alternatives with an explicit ordinal fallback', () => {
    expect(
      composeSourceRecordIds(density, [
        { gmlId: 'native', id: 'other', fid: 'third' },
        { id: 'id' },
        { fid: 'fid' },
        {},
      ]),
    ).toEqual(['native', 'id', 'fid', '4'])
    expect(
      composeSourceRecordIds(density, [{ fid: 'x' }, { fid: 'x' }, { fid: 'y' }]),
    ).toEqual(['x:1', 'x:2', 'y'])
    expect(() =>
      composeSourceRecordIds(density, [{ fid: 'x' }, { fid: 'x' }, { fid: 'x:1' }]),
    ).toThrow('conflicts')
  })
  test('declares Planning IDs as release-local delivery ordinals', () => {
    expect(planning.stability).toBe('release')
    expect(composeSourceRecordIds(planning, [{ TPU: '111' }, { TPU: '111' }])).toEqual([
      '1',
      '2',
    ])
    expect(() => composeSourceRecordId(planning, {})).toThrow('ordinal')
    expect(() => composeSourceRecordId(planning, {}, 1.5)).toThrow('ordinal')
  })
  test('New Town keys follow the declared publisher-name normalisation', () => {
    const policy = datasetSourceRecordIdentity('ds-hk-hkgov-pland-division-new-town')
    expect(composeSourceRecordId(policy, { NewTown_en: 'Tseung Kwan O' })).toBe(
      'tseung-kwan-o',
    )
    expect(() =>
      composeSourceRecordIds(policy, [
        { NewTown_en: 'Tseung Kwan O' },
        { NewTown_en: 'Tseung-Kwan-O' },
      ]),
    ).toThrow('Duplicate')
  })
  test('rejects malformed policies and false claims of publisher stability', () => {
    for (const policy of [
      null,
      {},
      { ...planning, stability: 'publisher' },
      { ...had, components: [] },
      { ...had, components: [{ paths: [''] }] },
    ])
      expect(() => assertSourceRecordIdentity(policy)).toThrow()
  })
})
