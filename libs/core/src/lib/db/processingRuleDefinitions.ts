import { sql, type AnyColumn } from 'drizzle-orm'
import { computeVersionHash, metaSchema } from '@repo/db'
import type { HarbourReadableDb, HarbourWritableDb } from './types'

export async function retainProcessingRules(
  db: HarbourReadableDb & HarbourWritableDb,
  definition: unknown,
) {
  if (!definition) return null
  const id = computeVersionHash(definition)
  await db
    .insert(metaSchema.metaProcessingRuleDefinitions)
    .values({ id, definition })
    .onConflictDoNothing()
    .run()
  return id
}

/** Resolve a dataset, release, or recipe hash to its retained policy definition. */
export function processingRulesSelection(column: AnyColumn) {
  return sql<
    string | null
  >`(SELECT definition FROM processingRuleDefinitions WHERE id = ${column})`.mapWith(
    value => (value === null ? null : JSON.parse(value)),
  )
}

/** A publisher release captures ingestion only; canonical policies are snapshot-owned. */
export async function retainIngestionProcessingRules(
  db: HarbourReadableDb & HarbourWritableDb,
  definition: unknown,
) {
  if (definition && (definition as { stage?: unknown }).stage !== 'ingestion')
    throw new Error('Source and resource releases require ingestion processing rules.')
  return retainProcessingRules(db, definition)
}
