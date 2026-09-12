import { Database } from 'bun:sqlite'
import { captureIndependentBoundDelivery } from './independentBoundDelivery.ts'
import {
  assertSqlDeliveryGeneration,
  readSqlDeliveryGeneration,
} from './sqlDeliveryGeneration.ts'
import { executeNativeSqlStatements } from './nativeSqlStatements.ts'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  prepareSqlDelivery,
  readDeliveryPlan,
  readDeliveryProgress,
  sha256,
  withDeliveryLock,
  writeDeliveryFile,
  readBoundDeliveryStatements,
} from './sqlDeliveryFiles.ts'
import {
  RECEIPT_SCHEMA_SQL,
  receiptQuery,
  receiptSql,
  checkReceipt,
} from './sqlDeliveryReceipts.ts'
import {
  registerPendingSqlDelivery,
  assertSqlDeliveryPlanningAllowed,
} from './sqlDeliveryPending.ts'

// Reset scripts already drop this operational table. Keeping identity here also
// detects an in-place schema reset, not just replacement of the SQLite file.
const IDENTITY_QUERY =
  "SELECT sha256 FROM harbourSqlDeliveryReceipts WHERE planId = 'native-database-identity' AND batchIndex = -1"
type NativeTarget = { path: string; identity: string }

export async function prepareNativeSqlDelivery(input: {
  directory: string
  ownershipDirectory: string
  releaseId: string
  phase: string
  inputs: Record<string, unknown>
  files: Record<string, string>
  generate: Parameters<typeof prepareSqlDelivery>[2]
}) {
  return withDeliveryLock(
    join(input.ownershipDirectory, 'sql-delivery-lock'),
    async () => {
      const plan = await prepareNativeSqlDeliveryLocked(input)
      // Reserve the mirror as soon as a plan is sealed, not only when replay starts.
      await registerPendingSqlDelivery(
        input.ownershipDirectory,
        input.releaseId,
        input.directory,
      )
      return plan
    },
  )
}

async function prepareNativeSqlDeliveryLocked(
  input: Parameters<typeof prepareNativeSqlDelivery>[0],
) {
  await assertSqlDeliveryPlanningAllowed(input.ownershipDirectory, input.releaseId)
  const targets: Record<string, NativeTarget> = {}
  for (const [binding, path] of Object.entries(input.files).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const db = new Database(path, { readwrite: true, create: false })
    try {
      // Existing identities are immutable until reset. Reading one must not
      // acquire a write lock against unrelated metadata progress updates.
      const tableExists = db
        .query(
          "SELECT 1 FROM sqlite_schema WHERE type='table' AND name='harbourSqlDeliveryReceipts'",
        )
        .get()
      const existing = tableExists
        ? (db.query(IDENTITY_QUERY).get() as { sha256: string } | null)
        : null
      const identity =
        existing?.sha256 ??
        db
          .transaction(() => {
            db.exec(RECEIPT_SCHEMA_SQL)
            const concurrent = db.query(IDENTITY_QUERY).get() as {
              sha256: string
            } | null
            if (concurrent) return concurrent.sha256
            const value = randomUUID()
            db.query(
              "INSERT INTO harbourSqlDeliveryReceipts VALUES ('native-database-identity', -1, ?)",
            ).run(value)
            return value
          })
          .immediate()
      targets[binding] = { path: resolve(path), identity }
    } catch (error) {
      throw new Error(
        `Native delivery identity check failed for ${binding}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    } finally {
      db.close()
    }
  }
  return prepareSqlDelivery(
    input.directory,
    {
      environment: 'local',
      releaseId: input.releaseId,
      phase: input.phase,
      inputs: {
        ...input.inputs,
        nativeTargets: targets,
        resetGeneration: await readSqlDeliveryGeneration(
          input.ownershipDirectory,
          input.releaseId,
        ),
      },
      cacheDir: resolve(input.ownershipDirectory),
      cachePreparedAt: sha256(JSON.stringify(targets)),
    },
    input.inputs.independentBoundTargets === true
      ? append => captureIndependentBoundDelivery(append, input.generate)
      : input.generate,
  )
}

/** No credentials, HTTP requests, remote checkpoints or implicit database creation. */
export async function runNativeSqlDelivery(
  directory: string,
  options: {
    files: Record<string, string>
    onProgress?: (completed: number, total: number) => void | Promise<void>
  },
) {
  return withDeliveryLock(directory, async () => {
    const plan = await readDeliveryPlan(directory)
    if (plan?.context.environment !== 'local')
      throw new Error('Expected a sealed native local SQL plan.')
    const targets = plan.context.inputs.nativeTargets as
      | Record<string, NativeTarget>
      | undefined
    if (!targets || sha256(JSON.stringify(targets)) !== plan.context.cachePreparedAt)
      throw new Error('Invalid native database identities.')
    return withDeliveryLock(
      join(plan.context.cacheDir, 'sql-delivery-lock'),
      async () => {
        await assertSqlDeliveryGeneration(
          plan.context.cacheDir,
          plan.context.releaseId,
          plan.context.inputs.resetGeneration,
        )
        const progress = await readDeliveryProgress(directory, plan)
        // Check every target before writing the first payload.
        for (const batch of plan.batches) {
          const target = targets[batch.target.bindingName]
          const configured = options.files[batch.target.bindingName]
          if (
            !target ||
            batch.target.databaseId !== batch.target.bindingName ||
            !configured ||
            resolve(configured) !== target.path
          )
            throw new Error('Native SQL delivery target configuration changed.')
        }
        for (const [binding, target] of Object.entries(targets)) {
          const configured = options.files[binding]
          if (!configured || resolve(configured) !== target.path)
            throw new Error('Native SQL delivery target configuration changed.')
          const db = new Database(target.path, { readonly: true, create: false })
          try {
            const row = db.query(IDENTITY_QUERY).get() as { sha256: string } | null
            if (row?.sha256 !== target.identity)
              throw new Error(
                'Native database identity changed; reset or replacement requires a new plan.',
              )
            for (const batch of plan.batches.filter(
              batch => batch.target.bindingName === binding,
            )) {
              const confirmed = checkReceipt(
                db.query(receiptQuery(plan, batch)).all() as Record<string, unknown>[],
                batch,
              )
              if (progress.local[batch.index] && !confirmed)
                throw new Error(
                  'Native local receipt disappeared; refusing to repeat acknowledged writes.',
                )
            }
          } finally {
            db.close()
          }
        }
        await registerPendingSqlDelivery(
          plan.context.cacheDir,
          plan.context.releaseId,
          directory,
        )
        let completed = 0
        for (const batch of plan.batches) {
          const bytes = await readFile(join(directory, batch.file))
          if (sha256(bytes) !== batch.sha256)
            throw new Error('Native SQL payload changed during replay.')
          const target = targets[batch.target.bindingName]
          if (!target) throw new Error('Missing native SQL target.')
          const db = new Database(target.path, { readwrite: true, create: false })
          const started = Date.now()
          try {
            db.exec('PRAGMA foreign_keys = ON')
            db.transaction(() => {
              const identity = db.query(IDENTITY_QUERY).get() as {
                sha256: string
              } | null
              if (identity?.sha256 !== target.identity)
                throw new Error('Native database identity changed during replay.')
              if (
                checkReceipt(
                  db.query(receiptQuery(plan, batch)).all() as Record<
                    string,
                    unknown
                  >[],
                  batch,
                )
              )
                return
              if (progress.local[batch.index])
                throw new Error(
                  'Native local receipt disappeared; refusing to repeat acknowledged writes.',
                )
              if (batch.kind === 'sql')
                executeNativeSqlStatements(db, new TextDecoder().decode(bytes))
              else
                for (const statement of readBoundDeliveryStatements(bytes))
                  db.query(statement.sql).run(
                    ...(statement.params as import('bun:sqlite').SQLQueryBindings[]),
                  )
              db.exec(receiptSql(plan, batch))
            }).immediate()
          } finally {
            db.close()
          }
          progress.local[batch.index] ??= {
            completedAt: new Date().toISOString(),
            durationMs: Date.now() - started,
          }
          await writeDeliveryFile(
            directory,
            'progress.json',
            JSON.stringify(progress, null, 2),
          )
          await options.onProgress?.(++completed, plan.batches.length)
        }
        return { completed, total: plan.batches.length }
      },
    )
  })
}
