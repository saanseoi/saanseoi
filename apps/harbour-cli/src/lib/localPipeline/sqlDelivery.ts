import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import {
  readDeliveryPlan,
  readDeliveryProgress,
  sha256,
  withDeliveryLock,
  writeDeliveryFile,
} from './sqlDeliveryFiles.ts'
import { registerPendingSqlDelivery } from './sqlDeliveryPending.ts'
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
    return withDeliveryLock(
      join(plan.context.cacheDir, 'sql-delivery-lock'),
      async () => {
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
        await save()
        let completed = 0
        const executeBatch = async (batch: SqlDeliveryPlan['batches'][number]) => {
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
            if (confirmed.has(batch.index)) {
              state.status = 'complete'
              await save()
            } else await remote.deliver(plan, batch, bytes, state, save)
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
                if (batch.kind === 'sql') db.exec(new TextDecoder().decode(bytes))
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
        if (options.mode === 'remote' && plan.context.inputs.parallelTargets === true) {
          const groups = new Map<string, SqlDeliveryPlan['batches']>()
          for (const batch of plan.batches) {
            const group = groups.get(batch.target.databaseId) ?? []
            group.push(batch)
            groups.set(batch.target.databaseId, group)
          }
          const results = await Promise.allSettled(
            [...groups.values()].map(async batches => {
              for (const batch of batches) await executeBatch(batch)
            }),
          )
          for (const result of results)
            if (result.status === 'rejected') throw result.reason
        } else for (const batch of plan.batches) await executeBatch(batch)
        return {
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

async function resolveDeliveryMirrorFiles(plan: SqlDeliveryPlan) {
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
