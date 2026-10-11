import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { readLandsdNamingEvidence } from './nativeIngredients'

test('assembly reads pinned terrain names without altering source rows', () => {
  const db = new Database(':memory:')
  db.exec(
    'CREATE TABLE hkgovLandsdPlaceNames(sourceRecordId, properties, sourceGeometry, validFromRelease, validToRelease)',
  )
  db.query('INSERT INTO hkgovLandsdPlaceNames VALUES (?,?,?,?,?)').run(
    'LANDSD:PLACE_NAME:42',
    JSON.stringify({
      geoNameId: '42',
      placeClass: 'Topographic',
      placeNames: [{ nameEn: 'Island', nameZhHant: '島', nameStatus: 'Official' }],
    }),
    JSON.stringify({ type: 'Point', coordinates: [836694.05, 819069.8] }),
    '2026-06-10.0',
    null,
  )
  try {
    const evidence = readLandsdNamingEvidence(db, '2026-09-01.0')
    expect(evidence.names.map(n => n.name)).toEqual(['Island', '島'])
    expect(evidence.divisions[0]?.geometry.coordinates[0]).toBeCloseTo(114.178, 2)
    expect(evidence.divisions[0]?.identifiers['hkgov-landsd']?.geoNameId).toBe('42')
    expect(db.query('SELECT sourceGeometry FROM hkgovLandsdPlaceNames').get()).toEqual({
      sourceGeometry: JSON.stringify({
        type: 'Point',
        coordinates: [836694.05, 819069.8],
      }),
    })
  } finally {
    db.close()
  }
})
