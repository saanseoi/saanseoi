import { Database } from 'bun:sqlite'
import { readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { brotliDecompressSync } from 'node:zlib'

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`

/** Structural signatures retain every array alternative, not just the first item. */
export function sourceShape(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value))
    return `[${[...new Set(value.map(sourceShape))].sort().join('|')}]`
  if (typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${key}:${sourceShape(child)}`)
      .join(',')}}`
  return typeof value
}

function decode(value: unknown): unknown {
  if (value instanceof Uint8Array)
    return JSON.parse(brotliDecompressSync(value).toString())
  return typeof value === 'string' ? JSON.parse(value) : value
}

type Group = {
  scope: string | null
  rows: number
  shapes: Record<string, { count: number; example: unknown }>
}

/** Read-only census. Physical scopes and publication pointers are deliberately separate. */
export function auditSourceAttributions(directory: string) {
  const databases: Array<Record<string, unknown>> = []
  for (const file of readdirSync(directory)
    .filter(file => file.endsWith('.sqlite'))
    .sort()) {
    const path = join(directory, file)
    if (!statSync(path).size) continue
    const db = new Database(path, { readonly: true })
    try {
      db.exec('BEGIN')
      const tables = db
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        )
        .all()
      const names = new Set(tables.map(table => table.name))
      const scans: Array<Record<string, unknown>> = []
      const publications: Array<Record<string, unknown>> = []
      for (const { name } of tables) {
        if (name.endsWith('PublicationState'))
          publications.push({
            table: name,
            rows: db.query(`SELECT * FROM ${quote(name)}`).all(),
          })
        const columns = db
          .query<{ name: string }, []>(`PRAGMA table_info(${quote(name)})`)
          .all()
          .map(column => column.name)
        const fields = ['sources', 'properties'].filter(field =>
          columns.includes(field),
        )
        if (!fields.length) continue
        const scopeColumn = [
          'scopeId',
          'snapshotId',
          'sourceReleaseId',
          'releaseId',
        ].find(column => columns.includes(column))
        for (const field of fields) {
          const groups = new Map<string | null, Group>()
          let scanned = 0
          let withSources = 0
          const scope = scopeColumn ? quote(scopeColumn) : 'NULL'
          for (const row of db
            .query<{ scope: string | null; payload: unknown }, []>(
              `SELECT ${scope} AS scope, ${quote(field)} AS payload FROM ${quote(name)}`,
            )
            .iterate()) {
            scanned++
            let value: unknown
            try {
              value = decode(row.payload)
            } catch (error) {
              throw new Error(`${file}/${name}/${field}/${row.scope}: ${error}`)
            }
            if (field === 'properties') {
              if (
                !value ||
                typeof value !== 'object' ||
                !Object.hasOwn(value, 'sources')
              )
                continue
              value = (value as Record<string, unknown>).sources
            }
            withSources++
            const group = groups.get(row.scope) ?? {
              scope: row.scope,
              rows: 0,
              shapes: {},
            }
            group.rows++
            const signature =
              row.payload === null && field === 'sources'
                ? 'SQL NULL'
                : sourceShape(value)
            const shape = group.shapes[signature] ?? { count: 0, example: value }
            shape.count++
            group.shapes[signature] = shape
            groups.set(row.scope, group)
          }
          // Empty source columns remain explicit coverage entries.
          if (field === 'sources' || withSources)
            scans.push({
              table: name,
              field: field === 'properties' ? 'properties.sources' : field,
              scopeColumn: scopeColumn ?? null,
              scanned,
              withSources,
              groups: [...groups.values()],
            })
        }
      }
      const snapshots =
        names.has('snapshots') && names.has('snapshotLineages')
          ? db
              .query(
                'SELECT s.id, s.code, s.status, l.resourceType, s.cohortKey, s.snapshotLineageId, s.parentSnapshotId, l.primaryDatasetId FROM snapshots s INNER JOIN snapshotLineages l ON l.id=s.snapshotLineageId ORDER BY s.id',
              )
              .all()
          : []
      const historyChanges = names.has('historyEvents')
        ? db
            .query(
              'SELECT snapshotId, recordType, count(*) AS changes FROM historyEvents GROUP BY snapshotId, recordType',
            )
            .all()
        : []
      databases.push({ file, scans, publications, snapshots, historyChanges })
      db.exec('ROLLBACK')
    } finally {
      db.close()
    }
  }
  const snapshotCoverage = databases.flatMap(database =>
    (database.snapshots as Array<{ id: string }>).map(snapshot => {
      const current: unknown[] = []
      const stored: unknown[] = []
      const journal: unknown[] = []
      for (const db of databases) {
        const publications = (
          db.publications as Array<{
            table: string
            rows: Array<{ snapshotId: string; scopeId?: string; status: string }>
          }>
        ).flatMap(table =>
          table.rows
            .filter(row => row.snapshotId === snapshot.id)
            .map(row => ({ ...row, publicationTable: table.table })),
        )
        for (const scan of db.scans as Array<{
          table: string
          field: string
          scopeColumn: string
          groups: Group[]
        }>) {
          if (!['scopeId', 'snapshotId'].includes(scan.scopeColumn)) continue
          for (const group of scan.groups) {
            const entry = {
              file: db.file,
              table: scan.table,
              field: scan.field,
              scope: group.scope,
              rows: group.rows,
              shapes: Object.keys(group.shapes),
            }
            if (scan.scopeColumn === 'snapshotId' && group.scope === snapshot.id)
              stored.push(entry)
            for (const pointer of publications)
              if (scan.scopeColumn === 'scopeId' && group.scope === pointer.scopeId)
                current.push({ ...entry, publicationStatus: pointer.status })
          }
        }
        for (const change of db.historyChanges as Array<{ snapshotId: string }>)
          if (change.snapshotId === snapshot.id)
            journal.push({ file: db.file, ...change })
      }
      return { ...snapshot, current, stored, journal, replayVerified: false }
    }),
  )
  return {
    createdAt: new Date().toISOString(),
    directory: resolve(directory),
    coverage:
      'Each database is read in its own consistent transaction. Every metadata snapshot has a coverage entry, including empty/unmaterialised snapshots. Stored history rows and journal deltas are not a reconstructed snapshot census.',
    snapshotCoverage,
    databases,
  }
}

if (import.meta.main) {
  const [directory, output] = process.argv.slice(2)
  if (!directory || !output)
    throw new Error(
      'Usage: bun scripts/audit-source-attributions.ts <sqlite-directory> <report.json>',
    )
  const report = auditSourceAttributions(directory)
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`Audited ${report.databases.length} databases; report: ${output}`)
}
