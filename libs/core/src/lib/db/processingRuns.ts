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

export type ProcessingRunOwner =
  | { resourceReleaseId: string; snapshotId?: never; apiReleaseSetId?: never }
  | { snapshotId: string; resourceReleaseId?: never; apiReleaseSetId?: never }
  | { apiReleaseSetId: string; resourceReleaseId?: never; snapshotId?: never }

export type ProcessingCheckpoint = {
  version: 1
  /** Hash of exact inputs, rules and target identity; never a cohort label alone. */
  identityHash: string
  /** Reference to acknowledged durable work, not a copy of its receipts. */
  artefact: string
}

/** One current task row; retries increment a counter instead of duplicating logs. */
export async function recordProcessingRun(
  db: HarbourReadableDb & HarbourWritableDb,
  input: ProcessingRunOwner & {
    stage: ProcessingStage
    phase: string
    status: ProcessingRunStatus
    results?: Record<string, unknown> | null
    checkpoint?: ProcessingCheckpoint | null
    error?: string | null
    now?: string
  },
) {
  const owner = input.apiReleaseSetId
    ? 'apiReleaseSetId'
    : input.snapshotId
      ? 'snapshotId'
      : 'resourceReleaseId'
  if (!input[owner]) throw new Error('Processing run requires an owner.')
  if ((input.stage === 'composition') !== (owner === 'apiReleaseSetId'))
    throw new Error('Composition runs belong to API release sets.')
  const now = input.now ?? toIsoTimestamp()
  const checkpoint = input.checkpoint ?? null
  if (
    checkpoint &&
    (checkpoint.version !== 1 || !checkpoint.identityHash || !checkpoint.artefact)
  )
    throw new Error('Invalid processing checkpoint.')
  const running = input.status === 'running'
  const results = input.results ?? null
  await db
    .insert(processingRuns)
    .values({
      runId: crypto.randomUUID(),
      [owner]: input[owner],
      stage: input.stage,
      phase: input.phase,
      status: input.status,
      results,
      checkpoint,
      error: input.error ?? null,
      startedAt: now,
      finishedAt: running ? null : now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [processingRuns[owner], processingRuns.phase],
      set: {
        stage: input.stage,
        status: input.status,
        results: terminalProcessingRunResults(input.status, results),
        checkpoint:
          input.checkpoint === undefined
            ? sql`${processingRuns.checkpoint}`
            : checkpoint,
        error: input.error ?? null,
        attempt: running
          ? sql`${processingRuns.attempt} + CASE WHEN ${processingRuns.status} != 'running' THEN 1 ELSE 0 END`
          : sql`${processingRuns.attempt}`,
        startedAt: running
          ? sql`CASE WHEN ${processingRuns.status} != 'running' THEN excluded.startedAt ELSE ${processingRuns.startedAt} END`
          : sql`${processingRuns.startedAt}`,
        finishedAt: running ? null : now,
        updatedAt: now,
      },
      setWhere: sql`${processingRuns.status} != excluded.status
      OR ${processingRuns.results} IS NOT excluded.results
      OR ${processingRuns.error} IS NOT excluded.error
      OR (${input.checkpoint !== undefined ? 1 : 0} = 1 AND ${processingRuns.checkpoint} IS NOT excluded.checkpoint)
      OR (excluded.status = 'running' AND ${processingRuns.updatedAt} <= ${new Date(Date.parse(now) - PROCESSING_RUN_HEARTBEAT_INTERVAL_MS).toISOString()})`,
    })
    .run()
}

export async function readProcessingCheckpoint(
  db: HarbourReadableDb,
  owner: ProcessingRunOwner,
  phase: string,
  identityHash: string,
): Promise<ProcessingCheckpoint | null> {
  const key = owner.apiReleaseSetId
    ? 'apiReleaseSetId'
    : owner.snapshotId
      ? 'snapshotId'
      : 'resourceReleaseId'
  const row = await db
    .select({ checkpoint: processingRuns.checkpoint })
    .from(processingRuns)
    .where(and(eq(processingRuns[key], owner[key]!), eq(processingRuns.phase, phase)))
    .get()
  const checkpoint = row?.checkpoint as ProcessingCheckpoint | null
  if (!checkpoint) return null
  if (checkpoint.version !== 1 || checkpoint.identityHash !== identityHash)
    throw new Error(
      'Processing checkpoint belongs to different inputs, rules or target.',
    )
  return checkpoint
}
