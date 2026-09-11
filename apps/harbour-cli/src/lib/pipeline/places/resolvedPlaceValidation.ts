import type { Database } from 'bun:sqlite'
import { latLngToCell } from 'h3-js'
import { PLACE_H3_LEVELS } from './processLocalPlaceSqlUploadConfig.ts'
import { readStagedJsonLines } from './processLocalPlaceSqlUploadPreparation.ts'
import type { EnrichedPlace } from './processLocalPlaceSqlUploadTypes.ts'

/** Compare complete intended membership, rather than accepting equal row counts. */
export async function validateResolvedPlaces(
  db: Database,
  path: string,
  scopeId: string,
  totalRows: number,
) {
  db.exec(`CREATE TEMP TABLE expectedPlaces(id TEXT PRIMARY KEY);
    CREATE TEMP TABLE expectedPlaceLocales(placeId TEXT,locale TEXT,PRIMARY KEY(placeId,locale));
    CREATE TEMP TABLE expectedPlaceCells(id TEXT,h3Level INTEGER,h3Cell TEXT,PRIMARY KEY(id,h3Level,h3Cell));
    CREATE TEMP TABLE expectedPlaceDivisions(placeId TEXT,divisionId TEXT,PRIMARY KEY(placeId,divisionId));`)
  try {
    const place = db.query('INSERT INTO expectedPlaces VALUES (?)')
    const locale = db.query('INSERT INTO expectedPlaceLocales VALUES (?,?)')
    const cell = db.query('INSERT INTO expectedPlaceCells VALUES (?,?,?)')
    const division = db.query('INSERT INTO expectedPlaceDivisions VALUES (?,?)')
    let count = 0
    for await (const row of readStagedJsonLines<EnrichedPlace>(path)) {
      if (!row.place.id.trim()) throw new Error('Places require non-empty identities.')
      db.transaction(() => {
        place.run(row.place.id)
        for (const value of row.place.i18n) locale.run(row.place.id, value.locale)
        for (const value of row.projection?.cells ??
          PLACE_H3_LEVELS.map(h3Level => ({
            h3Level,
            h3Cell: latLngToCell(
              row.effectiveLat ?? row.place.lat,
              row.effectiveLng ?? row.place.lng,
              h3Level,
            ),
          })))
          cell.run(row.place.id, value.h3Level, value.h3Cell)
        for (const id of row.divisionIds) division.run(row.place.id, id)
      })()
      count++
    }
    if (count !== totalRows)
      throw new Error('Places staged membership differs from its declared row count.')
    for (const [table, expected, columns, scopeColumn] of [
      ['places', 'expectedPlaces', 'id', 'snapshotId'],
      ['placesI18n', 'expectedPlaceLocales', 'placeId,locale', 'snapshotId'],
      ['placesCells', 'expectedPlaceCells', 'id,h3Level,h3Cell', 'snapshotId'],
      [
        'placesDivision',
        'expectedPlaceDivisions',
        'placeId,divisionId',
        'placeSnapshotId',
      ],
    ]) {
      const actual = `SELECT ${columns} FROM ${table} WHERE ${scopeColumn}=?`
      const intended = `SELECT ${columns} FROM ${expected}`
      if (
        db.query(`SELECT 1 FROM (${actual} EXCEPT ${intended}) LIMIT 1`).get(scopeId) ||
        db.query(`SELECT 1 FROM (${intended} EXCEPT ${actual}) LIMIT 1`).get(scopeId)
      )
        throw new Error(`Places exact membership validation failed for ${table}.`)
    }
    if (db.query('PRAGMA foreign_key_check').all().length)
      throw new Error('Places preparation contains invalid foreign keys.')
  } finally {
    db.exec(
      'DROP TABLE expectedPlaces; DROP TABLE expectedPlaceLocales; DROP TABLE expectedPlaceCells; DROP TABLE expectedPlaceDivisions;',
    )
  }
}
