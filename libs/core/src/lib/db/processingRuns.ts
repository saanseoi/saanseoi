import { and, desc, eq, sql } from 'drizzle-orm'
import { metaSchema, toIsoTimestamp, type ProcessingRunStatus } from '@repo/db'
import type { HarbourReadableDb, HarbourWritableDb } from './types'
import {
  processingStageForPhase,
  type ProcessingStage,
} from '../../pipeline/processingStages'
const { processingRuns } = metaSchema

export async function insertProcessingRun(
  db: HarbourReadableDb & HarbourWritableDb,
  resourceReleaseId: string,
  phase: string,
  status: ProcessingRunStatus,
  results: Record<string, unknown> | string | null,
  startedAt: string,
  finishedAt: string | null,
  error: string | null = null,
) {
  const now = toIsoTimestamp(startedAt)

  await db
    .insert(processingRuns)
    .values({
      runId: crypto.randomUUID(),
      resourceReleaseId,
      phase,
      stage: processingStageForPhase(phase),
      status,
      results: normaliseOptionalJsonText(results),
      error,
      startedAt: now,
      finishedAt,
      createdAt: now,
      updatedAt: now,
    })
    .run()
}

const PROCESSING_RUN_HEARTBEAT_INTERVAL_MS = 60_000

export async function ensureProcessingRunStarted(
  db: HarbourReadableDb & HarbourWritableDb,
  resourceReleaseId: string,
  phase: string,
  results: Record<string, unknown> | string | null,
  startedAt: string,
) {
  const now = toIsoTimestamp(startedAt)
  const heartbeatCutoff = new Date(
    Date.parse(now) - PROCESSING_RUN_HEARTBEAT_INTERVAL_MS,
  ).toISOString()

  // Keep retries atomic with terminal transitions. Identical running reports only
  // refresh the heartbeat once a minute; progress and error recovery write at once.
  await db
    .insert(processingRuns)
    .values({
      runId: crypto.randomUUID(),
      resourceReleaseId,
      phase,
      stage: processingStageForPhase(phase),
      status: 'running',
      results: normaliseOptionalJsonText(results),
      error: null,
      startedAt,
      finishedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [processingRuns.resourceReleaseId, processingRuns.phase],
      set: {
        status: 'running',
        attempt: sql`CASE WHEN ${processingRuns.status} = 'error' THEN ${processingRuns.attempt} + 1 ELSE ${processingRuns.attempt} END`,
        results: sql`excluded.results`,
        error: null,
        startedAt: sql`CASE WHEN ${processingRuns.status} = 'error' THEN excluded.startedAt ELSE ${processingRuns.startedAt} END`,
        finishedAt: sql`CASE WHEN ${processingRuns.status} = 'error' THEN NULL ELSE ${processingRuns.finishedAt} END`,
        updatedAt: now,
      },
      setWhere: sql`${processingRuns.status} = 'error' OR (
        ${processingRuns.status} = 'running' AND (
          ${processingRuns.results} IS NOT excluded.results
          OR ${processingRuns.error} IS NOT NULL
          OR ${processingRuns.updatedAt} <= ${heartbeatCutoff}
        )
      )`,
    })
    .run()
}

export async function upsertProcessingRunStatus(
  db: HarbourReadableDb & HarbourWritableDb,
  resourceReleaseId: string,
  phase: string,
  status: ProcessingRunStatus,
  startedAt: string,
  finishedAt: string | null,
  results: Record<string, unknown> | string | null,
  error: string | null = null,
) {
  const createdAt = toIsoTimestamp(startedAt)
  const updatedAt = toIsoTimestamp(finishedAt ?? startedAt)
  const normalisedResults = normaliseOptionalJsonText(results)

  await db
    .insert(processingRuns)
    .values({
      runId: crypto.randomUUID(),
      resourceReleaseId,
      phase,
      stage: processingStageForPhase(phase),
      status,
      results: normalisedResults,
      error,
      startedAt,
      finishedAt,
      createdAt,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [processingRuns.resourceReleaseId, processingRuns.phase],
      set: {
        status,
        results: terminalProcessingRunResults(status, normalisedResults),
        error,
        finishedAt,
        updatedAt,
      },
    })
    .run()
}

export async function updateLatestOpenProcessingRun(
  db: HarbourReadableDb & HarbourWritableDb,
  resourceReleaseId: string,
  phase: string,
  status: ProcessingRunStatus,
  finishedAt: string,
  results: Record<string, unknown> | string | null,
  error: string | null = null,
) {
  const normalisedResults = normaliseOptionalJsonText(results)
  const openRun =
    ((await db
      .select({
        runId: processingRuns.runId,
      })
      .from(processingRuns)
      .where(
        and(
          eq(processingRuns.resourceReleaseId, resourceReleaseId),
          eq(processingRuns.phase, phase),
          eq(processingRuns.status, 'running'),
        ),
      )
      .orderBy(desc(processingRuns.startedAt), desc(processingRuns.runId))
      .limit(1)
      .get()) as { runId: string } | undefined) ?? null

  if (!openRun) {
    return false
  }

  await db
    .update(processingRuns)
    .set({
      status,
      results: terminalProcessingRunResults(status, normalisedResults),
      error,
      finishedAt,
      updatedAt: toIsoTimestamp(finishedAt),
    })
    .where(eq(processingRuns.runId, openRun.runId))
    .run()

  return true
}

// Failed phases retain their last progress; a retry starts with fresh results.
// Keep the merge in SQL so a concurrent progress report cannot be lost to a read.
function terminalProcessingRunResults(
  status: ProcessingRunStatus,
  results: Record<string, unknown> | string | null,
) {
  if (status !== 'error') return results
  if (results === null) return sql`${processingRuns.results}`
  if (typeof results !== 'object' || Array.isArray(results)) return results
  return sql`json_patch(
    CASE WHEN json_type(${processingRuns.results}) = 'object'
      THEN ${processingRuns.results} ELSE '{}' END,
    ${JSON.stringify(results)}
  )`
}

function normaliseOptionalJsonText(
  value: Record<string, unknown> | string | null,
): Record<string, unknown> | string | null {
  if (!value || typeof value !== 'string') {
    return value
  }

  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return value
  }
}
