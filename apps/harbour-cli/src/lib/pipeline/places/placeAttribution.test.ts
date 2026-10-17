import { Database } from 'bun:sqlite'
import { createLocalHarbourDb } from '../../../../../../libs/core/src/testing/localDb'
import { expect, test } from 'bun:test'
import {
  placeAddressSources,
  placeSources,
  readPlaceSnapshotSource,
} from './placeAttribution'
import {
  hashPlaceMaterialisation,
  normaliseOverturePlace,
} from '@repo/core/pipeline/services/places/place'
import { placeLocaleHash } from './placeHistory'

const owner = { publisher: 'saanseoi', dataset: 'ds-hk-saanseoi-division' }
test('supporting references retain actual source IDs and scope only populated fields', () => {
  const address = {
    publisher: 'hkgov-dpo',
    dataset: 'ds-hk-hkgov-dpo-address',
    recordId: 'original-address',
    property: 'names',
    properties: ['name'],
  }
  const sources = placeSources(
    [{ dataset: 'openstreetmap', record_id: 'node/1' }],
    [
      ...placeAddressSources([address], ['address2dId']),
      ...placeAddressSources([address], ['address3dId', 'address3dUnitId']),
    ],
    owner,
    { districtId: 'division-1', areaId: 'division-1', countryId: null },
  )
  expect(sources).toHaveLength(3)
  expect(sources[1]).toEqual({
    publisher: 'hkgov-dpo',
    dataset: 'ds-hk-hkgov-dpo-address',
    recordId: 'original-address',
    properties: ['address2dId', 'address3dId', 'address3dUnitId'],
  })
  expect(sources[2]).toEqual({
    ...owner,
    recordId: 'division-1',
    properties: ['areaId', 'districtId'],
  })
  expect(placeSources([], placeAddressSources(undefined, []), owner, {})).toEqual([])
})
test('attribution is material content, observation dates are not; hints affect locale hashes', async () => {
  const place = normaliseOverturePlace(
    {
      id: 'p',
      geometry: { type: 'Point', coordinates: [114, 22] },
      names: { primary: 'Example' },
    },
    '2026-09',
  )
  if (!place) throw new Error('Missing test Place')
  const references = {
    addressSnapshotId: 'a',
    divisionSnapshotId: 'd',
    addressId: null,
    divisionIds: [],
  }
  const sources = placeSources([], [], owner, { districtId: 'd1' })
  const base = await hashPlaceMaterialisation(place, references)
  const attributed = await hashPlaceMaterialisation(place, { ...references, sources })
  expect(attributed).not.toBe(base)
  expect(
    await hashPlaceMaterialisation(place, {
      ...references,
      sources: sources.map(s => ({ ...s, updateTime: 'later', version: '2' })),
    }),
  ).toBe(attributed)
  const locale = place.i18n[0]!
  expect(await placeLocaleHash({ ...locale, accessHint: 'Side entrance' })).not.toBe(
    await placeLocaleHash(locale),
  )
})

test('derived Address links use the owning dataset record only when publisher references are absent', () => {
  const fallback = {
    publisher: 'hkgov-dpo',
    dataset: 'ds-hk-hkgov-dpo-address',
    recordId: 'canonical-complex',
  }
  expect(placeAddressSources([], ['address2dId'], fallback)).toEqual([
    { ...fallback, properties: ['address2dId'] },
  ])
  expect(
    placeAddressSources(
      [{ ...fallback, recordId: 'original-feature' }],
      ['address2dId'],
      fallback,
    )[0]?.recordId,
  ).toBe('original-feature')
  expect(placeAddressSources([], [], fallback)).toEqual([])
})

test('snapshot ownership follows the pinned lineage even when another publisher owns the latest snapshot', async () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE snapshots(id TEXT,snapshotLineageId TEXT);
    CREATE TABLE snapshotLineages(id TEXT,primaryDatasetId TEXT);
    CREATE TABLE datasets(id TEXT,code TEXT,publisherId TEXT);
    CREATE TABLE publishers(id TEXT,code TEXT);
    INSERT INTO publishers VALUES ('old','saanseoi'),('new','overture');
    INSERT INTO datasets VALUES ('d1','ds-hk-saanseoi-division','old'),('d2','ds-hk-overture-division','new');
    INSERT INTO snapshotLineages VALUES ('l1','d1'),('l2','d2');
    INSERT INTO snapshots VALUES ('pinned','l1'),('latest','l2');
  `)
  try {
    const db = createLocalHarbourDb(sqlite)
    expect(await readPlaceSnapshotSource(db, 'pinned')).toEqual(owner)
    await expect(readPlaceSnapshotSource(db, 'missing')).rejects.toThrow(
      'Missing Place dependency source owner',
    )
  } finally {
    sqlite.close()
  }
})
