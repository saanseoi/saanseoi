/** Check sampled candidate indexes against full local inventories without modifying them. */
import { Database } from 'bun:sqlite'
import {
  COHORT_POINTS,
  searchCells,
  withinCohort,
} from '../../apps/building-benchmark/src/cells'
import { searchBounds } from '../../apps/building-benchmark/src/spatial'
const [database, sqlPath] = process.argv.slice(2)
if (!database || !sqlPath)
  throw Error('Usage: bun scripts/buildings/verify-cells.ts REVIEW_SQLITE CELLS_SQL')
const db = new Database(database, { readonly: true })
db.exec(
  (await Bun.file(sqlPath).text()).replaceAll('CREATE TABLE', 'CREATE TEMP TABLE'),
)
let cases = 0
for (const table of ['benchmarkLandsdBuilding', 'benchmarkOvertureBuilding']) {
  console.log(
    table,
    db
      .query(
        `SELECT COUNT(*) AS entries,COUNT(DISTINCT id) AS buildings FROM ${table}CellSample`,
      )
      .get(),
  )
  for (const p of COHORT_POINTS)
    for (const radius of [25, 50])
      for (const shift of [0, 0.00007]) {
        const b = searchBounds(p.lng + shift, p.lat + shift, radius)
        if (!withinCohort(b)) throw Error('Test query outside sampled coverage')
        const args = [b.maxX, b.minX, b.maxY, b.minY]
        const full = db
          .query(
            `SELECT id FROM ${table} WHERE minX<=? AND maxX>=? AND minY<=? AND maxY>=? ORDER BY id`,
          )
          .all(...args)
        const indexed = db
          .query(
            `SELECT id FROM ${table} WHERE id IN (SELECT id FROM ${table}CellSample WHERE cell IN (SELECT value FROM json_each(?))) AND minX<=? AND maxX>=? AND minY<=? AND maxY>=? ORDER BY id`,
          )
          .all(JSON.stringify(searchCells(b)), ...args)
        if (JSON.stringify(full) !== JSON.stringify(indexed))
          throw Error(`Candidate mismatch: ${table} ${p.name} ${radius} ${shift}`)
        cases++
      }
}
if (withinCohort(searchBounds(114.1, 22.3, 25))) throw Error('Unindexed area accepted')
console.log(
  `${cases} sampled searches agree with full inventories; unindexed area rejected.`,
)
db.close()
