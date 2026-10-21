/** Generate only the six localised preview cell indexes; never a full-inventory index. */
import { Database } from 'bun:sqlite'
import { COHORT_POINTS, COHORT_PADDING } from '../../apps/building-benchmark/src/cells'
const [database, output] = process.argv.slice(2)
if (!database || !output)
  throw Error('Usage: bun scripts/buildings/prepare-cells.ts REVIEW_SQLITE OUTPUT_SQL')
const db = new Database(database, { readonly: true })
const where = COHORT_POINTS.map(
  p =>
    `(minX<=${p.lng + COHORT_PADDING} AND maxX>=${p.lng - COHORT_PADDING} AND minY<=${p.lat + COHORT_PADDING} AND maxY>=${p.lat - COHORT_PADDING})`,
).join(' OR ')
let sql =
  '-- Additive preview-only sampled indexes. Fail if already present. Refs #68.\n'
for (const table of ['benchmarkLandsdBuilding', 'benchmarkOvertureBuilding']) {
  const count = db
    .query(
      `SELECT COUNT(*) AS buildings,SUM((CAST(maxX*1000 AS INT)-CAST(minX*1000 AS INT)+1)*(CAST(maxY*1000 AS INT)-CAST(minY*1000 AS INT)+1)) AS entries FROM ${table} WHERE ${where}`,
    )
    .get() as { buildings: number; entries: number }
  if (count.entries > 2500) throw Error(`Sample exceeds write budget: ${table}`)
  console.log(table, count)
  sql += `CREATE TABLE ${table}CellSample (cell INTEGER NOT NULL, id TEXT NOT NULL, PRIMARY KEY(cell,id)) WITHOUT ROWID;
INSERT INTO ${table}CellSample
WITH RECURSIVE cells(id,x,y,x0,x1,y1) AS (
 SELECT id,CAST(minX*1000 AS INT),CAST(minY*1000 AS INT),CAST(minX*1000 AS INT),CAST(maxX*1000 AS INT),CAST(maxY*1000 AS INT) FROM ${table} WHERE ${where}
 UNION ALL
 SELECT id,CASE WHEN x<x1 THEN x+1 ELSE x0 END,CASE WHEN x<x1 THEN y ELSE y+1 END,x0,x1,y1 FROM cells WHERE x<x1 OR y<y1
) SELECT x*100000+y,id FROM cells;\n`
}
await Bun.write(output, sql)
db.close()
