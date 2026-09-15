import { Database } from 'bun:sqlite'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, resolve, join } from 'node:path'
import { canonicalAddressId, address3dCollectionId } from '@repo/db'
import {
  planAddressIdReconciliation,
  reconcileAddressIdCopy,
} from '../src/lib/pipeline/addresses/addressIdReconciliation'

// bun apps/harbour-cli/scripts/reconcile-address-id-copies.ts OUTPUT_DIRECTORY DB_FILES...
// Outputs are review candidates, not publishable replacements for immutable history.
const [directory, ...paths] = process.argv.slice(2)
if (!directory || !paths.length)
  throw new Error('Supply a new output directory and all current/history SQLite files.')
if (new Set(paths.map(path => basename(path))).size !== paths.length)
  throw new Error('Database filenames must be unique.')
await mkdir(resolve(directory), { recursive: false })
const sources = paths.map(path => new Database(resolve(path), { readonly: true }))
const copies: Database[] = []
const dataVersion = (db: Database) =>
  (db.query('PRAGMA data_version').get() as { data_version: number }).data_version
const versions = sources.map(dataVersion)
try {
  const mapping = planAddressIdReconciliation(sources)
  for (const source of sources) {
    for (const row of source
      .query<{ id: string; address2dId: string }, []>(
        'SELECT DISTINCT id,address2dId FROM address3d',
      )
      .all()) {
      if (canonicalAddressId(row.id) !== address3dCollectionId(row.address2dId))
        throw new Error(
          `Collection ${row.id} does not match its deterministic parent seed; review its identity before reconciliation.`,
        )
    }
  }
  const results = []
  for (const [index, source] of sources.entries()) {
    const destination = join(resolve(directory), basename(paths[index]!))
    source.exec(`VACUUM INTO '${destination.replaceAll("'", "''")}'`)
    const copy = new Database(destination)
    copies.push(copy)
    results.push({
      database: destination,
      changes: reconcileAddressIdCopy(copy, mapping),
    })
  }
  if (sources.some((source, index) => dataVersion(source) !== versions[index]))
    throw new Error(
      'Source databases changed during reconciliation; discard these candidates and retry with ingestion stopped.',
    )
  const residual = planAddressIdReconciliation(copies)
  if (residual.address2d.size || residual.address3d.size)
    throw new Error('Reconciliation left unprefixed canonical IDs.')
  const report = {
    requiresRepublication: true,
    limitation:
      'Original version hashes are retained for review. Regenerate canonical content versions and dependent publications before publishing these identities; do not replace live database files with these candidates.',
    address2d: Object.fromEntries(mapping.address2d),
    address3d: Object.fromEntries(mapping.address3d),
    results,
  }
  await writeFile(
    join(resolve(directory), 'report.json'),
    JSON.stringify(report, null, 2),
  )
  process.stdout.write(
    JSON.stringify({
      address2d: mapping.address2d.size,
      address3d: mapping.address3d.size,
      report: join(resolve(directory), 'report.json'),
    }) + '\n',
  )
} finally {
  for (const db of [...sources, ...copies]) db.close()
}
