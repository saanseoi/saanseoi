import { summariseD1RowUsage } from './sqlDeliveryUsage.ts'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import { executeNativeSqlStatements } from './nativeSqlStatements.ts'
import {
  readDeliveryPlan,
  readDeliveryProgress,
  sha256,
  withDeliveryLock,
  writeDeliveryFile,
  readBoundDeliveryStatements,
} from './sqlDeliveryFiles.ts'
import { registerPendingSqlDelivery } from './sqlDeliveryPending.ts'
import { assertSqlDeliveryGeneration } from './sqlDeliveryGeneration.ts'
import {
  createSqlDeliveryRemote,
  type SqlDeliveryRemoteOptions,
} from './sqlDeliveryRemote.ts'
import {
  RECEIPT_SCHEMA_SQL,
  checkReceipt,
  receiptQuery,
  receiptSql,
} from './sqlDeliveryReceipts.ts'
import type { SqlDeliveryPlan } from './sqlDeliveryTypes.ts'

export { prepareSqlDelivery, readDeliveryPlan } from './sqlDeliveryFiles.ts'
export type { SqlDeliveryPlan, SqlDeliveryTarget } from './sqlDeliveryTypes.ts'

export async function runSqlDelivery(
  directory: string,
  options: SqlDeliveryRemoteOptions & {
    mode: 'remote' | 'local'
    /** Live configured IDs, so a stale manifest cannot redirect delivery after reconfiguration. */
    targets: Record<string, string>
    onProgress?: (completed: number, total: number) => void | Promise<void>
  },
) {
  return withDeliveryLock(directory, async () => {
    const plan = await readDeliveryPlan(directory)
    if (!plan) throw new Error('No sealed SQL delivery plan exists.')
    if (plan.context.environment === 'local')
      throw new Error('Native local plans require the local SQL delivery executor.')
    return withDeliveryLock(
      join(plan.context.cacheDir, 'sql-delivery-lock'),
      async () => {
        await assertSqlDeliveryGeneration(
          plan.context.cacheDir,
          plan.context.releaseId,
          plan.context.inputs.resetGeneration,
        )
        for (const batch of plan.batches) {
          if (options.targets[batch.target.bindingName] !== batch.target.databaseId)
            throw new Error(
              `SQL delivery target changed for ${batch.target.bindingName}.`,
            )
        }
        const progress = await readDeliveryProgress(directory, plan)
        await registerPendingSqlDelivery(
          plan.context.cacheDir,
          plan.context.releaseId,
          directory,
        )
        let saving = Promise.resolve()
        const save = () => {
          saving = saving.then(() =>
            writeDeliveryFile(
              directory,
              'progress.json',
              JSON.stringify(progress, null, 2),
            ),
          )
          return saving
        }
        const remote = createSqlDeliveryRemote(options)
        const localFiles = await resolveDeliveryMirrorFiles(plan)
        const confirmed = await remote.confirmedReceipts(
          plan,
          options.mode === 'local'
            ? plan.batches
            : plan.batches.filter(
                batch =>
                  progress.remote[batch.index]?.status !== undefined &&
                  progress.remote[batch.index]?.status !== 'pending',
              ),
        )
        if (options.mode === 'local') {
          // Complete remote delivery is a prerequisite; local-only recovery never writes remotely.
          for (const batch of plan.batches) {
            if (!confirmed.has(batch.index))
              throw new Error(
                `Remote batch ${batch.index} is not confirmed; local replay cannot advance.`,
              )
            progress.remote[batch.index] = {
              ...(progress.remote[batch.index] ?? { uploadMs: 0, executionMs: 0 }),
              status: 'complete',
            }
          }
        }
        if (options.mode === 'remote') {
          for (const index of confirmed) {
            progress.remote[index] = {
              ...(progress.remote[index] ?? { uploadMs: 0, executionMs: 0 }),
              status: 'complete',
            }
          }
        }
        const localConfirmed = new Set<number>()
        if (options.mode === 'local') {
          const bindings = new Set(plan.batches.map(batch => batch.target.bindingName))
          for (const binding of bindings) {
            const path = localFiles?.[binding]
            if (!path) throw new Error(`Missing local mirror for ${binding}.`)
            const db = new Database(path, { readonly: true, create: false })
            try {
              const exists = db
                .query(
                  "SELECT 1 FROM sqlite_master WHERE type='table' AND name='harbourSqlDeliveryReceipts'",
                )
                .get()
              const rows = exists
                ? (db
                    .query(
                      'SELECT batchIndex,sha256 FROM harbourSqlDeliveryReceipts WHERE planId = ?',
                    )
                    .all(plan.id) as Array<{ batchIndex: number; sha256: string }>)
                : []
              const receipts = new Map(rows.map(row => [row.batchIndex, row]))
              for (const batch of plan.batches.filter(
                batch => batch.target.bindingName === binding,
              )) {
                const receipt = receipts.get(batch.index)
                if (checkReceipt(receipt ? [receipt] : [], batch)) {
                  localConfirmed.add(batch.index)
                  progress.local[batch.index] ??= {
                    completedAt: new Date().toISOString(),
                    durationMs: 0,
                  }
                } else if (progress.local[batch.index]) {
                  throw new Error(
                    `Local receipt disappeared for batch ${batch.index}; the mirror must be reconciled.`,
                  )
                }
              }
            } finally {
              db.close()
            }
          }
        }
        await save()
        let completed = 0
        const executeBatch = async (batch: SqlDeliveryPlan['batches'][number]) => {
          // readDeliveryPlan already checked every sealed payload. Receipt-confirmed
          // batches need neither another payload read nor two durable checkpoint writes.
          if (
            (options.mode === 'remote' && confirmed.has(batch.index)) ||
            (options.mode === 'local' && localConfirmed.has(batch.index))
          ) {
            completed += 1
            await options.onProgress?.(completed, plan.batches.length)
            return
          }
          const bytes = await readFile(join(directory, batch.file))
          if (sha256(bytes) !== batch.sha256)
            throw new Error(
              `SQL delivery batch ${batch.index} changed during execution.`,
            )
          if (options.mode === 'remote') {
            const state = progress.remote[batch.index] ?? {
              status: 'pending' as const,
              uploadMs: 0,
              executionMs: 0,
            }
            progress.remote[batch.index] = state
            await save()
            await remote.deliver(plan, batch, bytes, state, save)
          } else {
            const path = localFiles?.[batch.target.bindingName]
            if (!path)
              throw new Error(`Missing local mirror for ${batch.target.bindingName}.`)
            const db = new Database(path, { readwrite: true, create: false })
            const startedAt = Date.now()
            try {
              db.transaction(() => {
                db.exec(RECEIPT_SCHEMA_SQL)
                const receipt = db.query(receiptQuery(plan, batch)).all() as Record<
                  string,
                  unknown
                >[]
                if (checkReceipt(receipt, batch)) return
                if (progress.local[batch.index])
                  throw new Error(
                    `Local receipt disappeared for batch ${batch.index}; the mirror must be reconciled.`,
                  )
                if (batch.kind === 'sql')
                  executeNativeSqlStatements(db, new TextDecoder().decode(bytes))
                else {
                  const statements = JSON.parse(
                    new TextDecoder().decode(bytes),
                  ) as Array<{
                    sql: string
                    params: import('bun:sqlite').SQLQueryBindings[]
                  }>
                  for (const statement of statements)
                    db.query(statement.sql).run(...statement.params)
                }
                db.exec(receiptSql(plan, batch))
              }).immediate()
            } finally {
              db.close()
            }
            progress.local[batch.index] ??= {
              completedAt: new Date().toISOString(),
              durationMs: Date.now() - startedAt,
            }
            await save()
          }
          completed += 1
          await options.onProgress?.(completed, plan.batches.length)
        }
        const executeBatches = async (batches: SqlDeliveryPlan['batches']) => {
          for (let index = 0; index < batches.length; ) {
            const first = batches[index]
            if (!first) break
            const entries: Array<{
              batch: typeof first
              bytes: Uint8Array
              state: import('./sqlDeliveryTypes.ts').SqlDeliveryCheckpoint
            }> = []
            let totalBytes = 0
            let totalStatements = 0
            // Only the explicitly independent Address3D producer opts into transport grouping.
            if (
              options.mode === 'remote' &&
              plan.context.phase === 'address3d-data' &&
              plan.context.inputs.independentBoundTargets === true
            ) {
              for (const batch of batches.slice(index, index + 8)) {
                if (
                  batch.kind !== 'bound' ||
                  batch.target.databaseId !== first.target.databaseId ||
                  (progress.remote[batch.index]?.status ?? 'pending') !== 'pending' ||
                  totalBytes + batch.bytes > 8 * 1024 * 1024
                )
                  break
                const bytes = await readFile(join(directory, batch.file))
                if (sha256(bytes) !== batch.sha256)
                  throw new Error(
                    `SQL delivery batch ${batch.index} changed during execution.`,
                  )
                const statements = readBoundDeliveryStatements(bytes)
                if (totalStatements + statements.length > 512) break
                totalBytes += bytes.byteLength
                totalStatements += statements.length
                const state = progress.remote[batch.index] ?? {
                  status: 'pending' as const,
                  uploadMs: 0,
                  executionMs: 0,
                }
                entries.push({ batch, bytes, state })
              }
            }
            if (entries.length < 2) {
              await executeBatch(first)
              index++
              continue
            }
            for (const entry of entries)
              progress.remote[entry.batch.index] = entry.state
            await remote.deliverBoundGroup(plan, entries, save)
            for (const _entry of entries) {
              completed++
              await options.onProgress?.(completed, plan.batches.length)
            }
            index += entries.length
          }
        }
        if (options.mode === 'remote' && plan.context.inputs.parallelTargets === true) {
          const groups = new Map<string, SqlDeliveryPlan['batches']>()
          for (const batch of plan.batches) {
            const group = groups.get(batch.target.databaseId) ?? []
            group.push(batch)
            groups.set(batch.target.databaseId, group)
          }
          const results = await Promise.allSettled(
            [...groups.values()].map(executeBatches),
          )
          for (const result of results)
            if (result.status === 'rejected') throw result.reason
        } else await executeBatches(plan.batches)
        return {
          phase: plan.context.phase,
          rowUsage: summariseD1RowUsage(progress, plan.batches.length),
          planId: plan.id,
          batches: plan.batches.length,
          generationMs: plan.generationMs,
          mirrorPreparationMs: plan.mirrorPreparationMs,
          uploadMs: Object.values(progress.remote).reduce((n, s) => n + s.uploadMs, 0),
          executionMs: Object.values(progress.remote).reduce(
            (n, s) => n + s.executionMs,
            0,
          ),
          localReplayMs: Object.values(progress.local).reduce(
            (n, s) => n + s.durationMs,
            0,
          ),
        }
      },
    )
  })
}

export async function resolveDeliveryMirrorFiles(plan: SqlDeliveryPlan) {
  try {
    await readFile(join(plan.context.cacheDir, 'invalidated.json'))
    throw new Error(
      'The planning mirror is invalidated; SQL delivery requires reconciliation before recovery.',
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const manifest = JSON.parse(
    await readFile(join(plan.context.cacheDir, 'manifest.json'), 'utf8'),
  ) as {
    target: string
    preparedAt: string
    files: Record<string, string>
  }
  if (
    manifest.target !== plan.context.environment ||
    manifest.preparedAt !== plan.context.cachePreparedAt
  ) {
    throw new Error(
      'SQL delivery mirror generation has changed; refusing to replay against a different planning context.',
    )
  }
  return manifest.files
}
