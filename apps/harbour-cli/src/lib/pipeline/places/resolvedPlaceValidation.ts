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
  db.exec(`CREATE TEMP TABLE expectedPlaces(id TEXT PRIMARY KEY,address2dId TEXT,address3dId TEXT,address3dUnitId TEXT,addressDependencyHash TEXT);
    CREATE TEMP TABLE expectedPlaceLocales(placeId TEXT,locale TEXT,addressText TEXT,divisionText TEXT,streetText TEXT,PRIMARY KEY(placeId,locale));
    CREATE TEMP TABLE expectedPlaceCells(id TEXT,h3Level INTEGER,h3Cell TEXT,PRIMARY KEY(id,h3Level,h3Cell));
    CREATE TEMP TABLE expectedPlaceDivisions(placeId TEXT,divisionId TEXT,definition TEXT,PRIMARY KEY(placeId,divisionId));`)
  try {
    const place = db.query('INSERT INTO expectedPlaces VALUES (?,?,?,?,?)')
    const locale = db.query('INSERT INTO expectedPlaceLocales VALUES (?,?,?,?,?)')
    const cell = db.query('INSERT INTO expectedPlaceCells VALUES (?,?,?)')
    const division = db.query('INSERT INTO expectedPlaceDivisions VALUES (?,?,?)')
    let count = 0
    for await (const row of readStagedJsonLines<EnrichedPlace>(path)) {
      if (!row.place.id.trim()) throw new Error('Places require non-empty identities.')
      if (row.address2dId && (!row.addressDependencyHash || !row.addressSnapshotId))
        throw new Error(
          `Places require exact Address dependency evidence for ${row.place.id}.`,
        )
      db.transaction(() => {
        place.run(
          row.place.id,
          row.address2dId,
          row.address3dId,
          row.address3dUnitId ?? null,
          row.addressDependencyHash ?? null,
        )
        for (const value of row.place.i18n) {
          const text = row.searchDependencies?.[value.locale]
          if (row.address2dId && !text?.addressSnapshotId)
            throw new Error(
              `Places require exact search dependency text for ${row.place.id}/${value.locale}.`,
            )
          locale.run(
            row.place.id,
            value.locale,
            text?.addressText ?? '',
            text?.divisionText ?? '',
            text?.streetText ?? '',
          )
        }
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
        for (const id of row.divisionIds) {
          const definition = row.divisionDefinitions?.[id]
          if (!definition)
            throw new Error(
              `Places require exact Division definition ${row.place.id}/${id}.`,
            )
          division.run(
            row.place.id,
            id,
            JSON.stringify({
              level: definition.level,
              locales: [...definition.locales].sort((a, b) =>
                a.locale.localeCompare(b.locale),
              ),
            }),
          )
        }
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
    if (
      db
        .query(`SELECT 1 FROM places p JOIN expectedPlaces e ON p.id=e.id WHERE p.snapshotId=? AND (
      p.address2dId IS NOT e.address2dId OR p.address3dId IS NOT e.address3dId OR p.address3dUnitId IS NOT e.address3dUnitId
      OR p.addressDependencyHash IS NOT e.addressDependencyHash OR (p.address2dId IS NOT NULL AND p.addressSnapshotId IS NULL)) LIMIT 1`)
        .get(scopeId)
    )
      throw new Error(
        'Places exact Address references differ from the validated dependencies.',
      )
    if (
      db
        .query(`SELECT 1 FROM placesI18n l JOIN places p ON p.snapshotId=l.snapshotId AND p.id=l.placeId
      WHERE p.snapshotId=? AND p.address2dId IS NOT NULL
      AND (l.searchDependencyText IS NULL OR json_extract(l.searchDependencyText,'$.addressSnapshotId') IS NULL) LIMIT 1`)
        .get(scopeId)
    )
      throw new Error(
        'Linked Places are missing retained exact search dependency evidence.',
      )
    if (
      db
        .query(`SELECT 1 FROM placesI18n p JOIN expectedPlaceLocales e ON p.placeId=e.placeId AND p.locale=e.locale WHERE p.snapshotId=? AND (
      COALESCE(json_extract(p.searchDependencyText,'$.addressText'),'') IS NOT e.addressText OR
      COALESCE(json_extract(p.searchDependencyText,'$.divisionText'),'') IS NOT e.divisionText OR
      COALESCE(json_extract(p.searchDependencyText,'$.streetText'),'') IS NOT e.streetText) LIMIT 1`)
        .get(scopeId)
    )
      throw new Error(
        'Places exact search dependency text differs from the prepared document.',
      )
    if (
      db
        .query(`SELECT 1 FROM placesDivision p JOIN expectedPlaceDivisions e ON p.placeId=e.placeId AND p.divisionId=e.divisionId
      WHERE p.placeSnapshotId=? AND p.definition IS NOT e.definition LIMIT 1`)
        .get(scopeId)
    )
      throw new Error(
        'Places exact Division definitions differ from the prepared dependencies.',
      )
    if (db.query('PRAGMA foreign_key_check').all().length)
      throw new Error('Places preparation contains invalid foreign keys.')
  } finally {
    db.exec(
      'DROP TABLE expectedPlaces; DROP TABLE expectedPlaceLocales; DROP TABLE expectedPlaceCells; DROP TABLE expectedPlaceDivisions;',
    )
  }
}
