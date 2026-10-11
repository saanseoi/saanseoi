/** Atomic local delivery of a verified immutable crosswalk; no snapshot reset. */
import { Database } from 'bun:sqlite'
import {
  geographicCrosswalkStatements,
  verifyGeographicCrosswalk,
  type buildGeographicCrosswalk,
} from '../src/lib/pipeline/divisions/geographicCrosswalk'
const [databasePath, artefactPath] = process.argv.slice(2)
if (!databasePath || !artefactPath)
  throw Error(
    'Usage: bun applyGeographicCrosswalk.ts <CURRENT.sqlite> <crosswalk.json>',
  )
const artefact: ReturnType<typeof buildGeographicCrosswalk> =
  await Bun.file(artefactPath).json()
verifyGeographicCrosswalk(artefact)
const db = new Database(databasePath, { create: false })
try {
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;')
  // The caller supplies the selected CURRENT database; schema presence is required.
  db.query('SELECT id FROM divisionGeographicCrosswalks LIMIT 1').all()
  db.transaction(() => {
    for (const statement of geographicCrosswalkStatements(artefact)) db.run(statement)
    const count = db
      .query(
        'SELECT count(*) AS n FROM divisionGeographicMemberships WHERE crosswalkId=?',
      )
      .get(artefact.id) as { n: number }
    if (count.n !== artefact.memberships.length)
      throw Error('Crosswalk delivery count mismatch')
    if (db.query('PRAGMA foreign_key_check').all().length)
      throw Error('Crosswalk foreign-key check failed')
  }).immediate()
  console.log(
    JSON.stringify({
      id: artefact.id,
      memberships: artefact.memberships.length,
      status: 'complete',
    }),
  )
} finally {
  db.close()
}
