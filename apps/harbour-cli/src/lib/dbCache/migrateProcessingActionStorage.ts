import type { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { metaSchema } from '@repo/db'
import { createHash } from '@repo/core/pipeline/utils'
import {
  encodeAuditGroup,
  normaliseAuditActions,
  type AuditSummary,
  type ReleaseProcessingAction,
} from '@repo/core/pipeline/db/processingActionCodec'

type OriginalDecision = ReleaseProcessingAction & {
  id: string
  releaseId: string
  createdAt: string
  updatedAt: string
}

/** One-off storage conversion on an offline copy, using the generated migration. */
export async function migrateProcessingActionStorage(
  sqlite: Database,
  migrationSql: string,
  migrationName?: string,
) {
  const columns = sqlite
    .query('PRAGMA table_info(releaseProcessingActions)')
    .all() as Array<{ name: string }>
  if (
    !columns.some(column => column.name === 'evidence') ||
    columns.some(column => column.name === 'generation')
  )
    throw new Error('Expected the unconverted processing-action schema.')
  const original = sqlite
    .query(
      'SELECT * FROM releaseProcessingActions ORDER BY releaseId, action, mode, createdAt DESC, id DESC',
    )
    .all() as Array<Omit<OriginalDecision, 'evidence'> & { evidence: string }>
  const groups = new Map<string, OriginalDecision[]>()
  for (const row of original) {
    const key = JSON.stringify([row.releaseId, row.action, row.mode])
    const group = groups.get(key) ?? []
    group.push({ ...row, evidence: JSON.parse(row.evidence) })
    groups.set(key, group)
  }
  const summaries: AuditSummary[] = []
  const chunks: Array<typeof metaSchema.releaseProcessingActionChunks.$inferInsert> = []
  const generations = new Map<string, string>()
  for (const releaseId of new Set(original.map(row => row.releaseId))) {
    generations.set(
      releaseId,
      await createHash(original.filter(row => row.releaseId === releaseId)),
    )
  }
  // Preserve per-decision metadata in the migration envelope as explicit fields.
  // Newly ingested decisions share their group's timestamps and use ordinal IDs.
  for (const [key, rows] of groups) {
    const normalised = normaliseAuditActions(rows)
    const summary: AuditSummary = {
      id: await createHash(key),
      releaseId: rows[0]!.releaseId,
      action: rows[0]!.action,
      mode: rows[0]!.mode,
      generation: generations.get(rows[0]!.releaseId)!,
      decisionCount: rows.length,
      affectedRecordCount: normalised.reduce(
        (sum, row) => sum + row.affectedRecordCount,
        0,
      ),
      createdAt: rows.reduce(
        (latest, row) => (row.createdAt > latest ? row.createdAt : latest),
        '',
      ),
      updatedAt: rows.reduce(
        (latest, row) => (row.updatedAt > latest ? row.updatedAt : latest),
        '',
      ),
    }
    summaries.push(summary)
    chunks.push(
      ...(await encodeAuditGroup(
        summary,
        normalised.map((row, index) => ({
          ...row,
          original: {
            id: rows[index]!.id,
            createdAt: rows[index]!.createdAt,
            updatedAt: rows[index]!.updatedAt,
          },
        })),
      )),
    )
  }
  const db = drizzle({ client: sqlite, schema: metaSchema })
  sqlite.transaction(() => {
    sqlite.exec('DELETE FROM releaseProcessingActions')
    sqlite.exec(migrationSql)
    for (const summary of summaries)
      db.insert(metaSchema.releaseProcessingActions).values(summary).run()
    for (const chunk of chunks)
      db.insert(metaSchema.releaseProcessingActionChunks).values(chunk).run()
    if (
      migrationName &&
      sqlite
        .query(
          "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'd1_migrations'",
        )
        .get()
    ) {
      sqlite.query('INSERT INTO d1_migrations(name) VALUES (?)').run(migrationName)
    }
  })()
  return {
    decisions: original.length,
    summaries: summaries.length,
    chunks: chunks.length,
  }
}
