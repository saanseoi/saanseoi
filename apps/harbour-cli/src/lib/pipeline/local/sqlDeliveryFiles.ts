import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import type {
  SqlDeliveryPlan,
  SqlDeliveryProgress,
  SqlDeliveryTarget,
} from './sqlDeliveryTypes.ts'

export const sha256 = (value: string | Uint8Array) =>
  createHash('sha256').update(value).digest('hex')

export function readBoundDeliveryStatements(
  bytes: Uint8Array,
): Array<{ sql: string; params: unknown[] }> {
  const statements: unknown = JSON.parse(new TextDecoder().decode(bytes))
  if (
    !Array.isArray(statements) ||
    !statements.length ||
    statements.some(
      statement =>
        !statement ||
        typeof statement.sql !== 'string' ||
        !statement.sql.trim() ||
        !Array.isArray(statement.params) ||
        statement.params.length > 100 ||
        Buffer.byteLength(statement.sql) > 100_000,
    )
  )
    throw new Error(
      'Invalid bound SQL delivery payload or D1 statement budget exceeded.',
    )
  return statements
}

export async function deliveryFileSha256(path: string) {
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(path)) hash.update(bytes)
  return hash.digest('hex')
}

/** Atomic replacement, with both the file and directory entry flushed before returning. */
export async function writeDeliveryFile(
  directory: string,
  name: string,
  contents: string | Uint8Array,
) {
  await mkdir(directory, { recursive: true })
  const temporary = join(directory, `.${name}.${randomUUID()}.tmp`)
  try {
    const file = await open(temporary, 'wx', 0o600)
    try {
      await file.writeFile(contents)
      await file.sync()
    } finally {
      await file.close()
    }
    await rename(temporary, join(directory, name))
    const parent = await open(directory, 'r')
    try {
      await parent.sync()
    } finally {
      await parent.close()
    }
  } finally {
    await rm(temporary, { force: true })
  }
}

/** SQLite releases this local advisory lock even when the process is killed. */
export async function withDeliveryLock<T>(directory: string, work: () => Promise<T>) {
  await mkdir(directory, { recursive: true })
  const lock = new Database(join(directory, 'lock.sqlite'))
  try {
    lock.exec('PRAGMA busy_timeout = 0; BEGIN IMMEDIATE;')
    return await work()
  } finally {
    lock.close()
  }
}

export async function readDeliveryPlan(
  directory: string,
): Promise<SqlDeliveryPlan | null> {
  let text: string
  try {
    text = await readFile(join(directory, 'plan.json'), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
  const plan = JSON.parse(text) as SqlDeliveryPlan
  if (
    plan.version !== 1 ||
    plan.id !== planId(plan.context, plan.batches, plan.outputs)
  ) {
    throw new Error('SQL delivery manifest is invalid or has been modified.')
  }
  for (const [index, batch] of plan.batches.entries()) {
    if (
      !['sql', 'bound'].includes(batch.kind) ||
      batch.index !== index ||
      batch.file !== `${index}.${batch.kind === 'sql' ? 'sql' : 'json'}`
    )
      throw new Error('Invalid SQL delivery batch order or path.')
    const bytes = await readFile(join(directory, batch.file))
    if (sha256(bytes) !== batch.sha256 || bytes.byteLength !== batch.bytes) {
      throw new Error(`SQL delivery batch ${index} has changed; refusing to replay it.`)
    }
    if (batch.kind === 'bound') readBoundDeliveryStatements(bytes)
  }
  return plan
}

function planId(
  context: SqlDeliveryPlan['context'],
  batches: SqlDeliveryPlan['batches'],
  outputs?: SqlDeliveryPlan['outputs'],
) {
  return sha256(JSON.stringify({ context, batches, outputs }))
}

/** Seal every batch before any remote write. Existing plans are never regenerated. */
export async function prepareSqlDelivery(
  directory: string,
  context: SqlDeliveryPlan['context'],
  generate: (
    append: (
      target: SqlDeliveryTarget,
      sql: Uint8Array,
      kind?: 'sql' | 'bound',
    ) => Promise<void>,
  ) => Promise<void | Record<string, unknown>>,
  timings: { mirrorPreparationMs?: number; sqlGenerationMs?: number } = {},
) {
  return withDeliveryLock(directory, async () => {
    const existing = await readDeliveryPlan(directory)
    if (existing) {
      if (JSON.stringify(existing.context) !== JSON.stringify(context))
        throw new Error(
          'SQL delivery planning context has changed; use the retained plan to resume.',
        )
      return existing
    }
    const batches: SqlDeliveryPlan['batches'] = []
    const startedAt = Date.now()
    // Generators may run independent database branches concurrently. Serialise file publication.
    let pending = Promise.resolve()
    let closed = false
    let outputs: void | Record<string, unknown>
    try {
      outputs = await generate((target, sql, kind = 'sql') => {
        if (closed) throw new Error('SQL delivery preparation has already stopped.')
        pending = pending.then(async () => {
          if (kind === 'bound') readBoundDeliveryStatements(sql)
          const index = batches.length
          const file = `${index}.${kind === 'sql' ? 'sql' : 'json'}`
          await writeDeliveryFile(directory, file, sql)
          batches.push({
            index,
            kind,
            target,
            file,
            bytes: sql.byteLength,
            sha256: sha256(sql),
          })
        })
        return pending
      })
    } finally {
      closed = true
      await pending
    }
    const plan: SqlDeliveryPlan = {
      version: 1,
      id: planId(context, batches, outputs || undefined),
      context,
      batches,
      ...(outputs ? { outputs } : {}),
      preparedAt: new Date().toISOString(),
      generationMs: (timings.sqlGenerationMs ?? 0) + Date.now() - startedAt,
      mirrorPreparationMs: timings.mirrorPreparationMs ?? 0,
    }
    await writeDeliveryFile(directory, 'plan.json', JSON.stringify(plan, null, 2))
    return plan
  })
}

export async function readDeliveryProgress(
  directory: string,
  plan: SqlDeliveryPlan,
): Promise<SqlDeliveryProgress> {
  try {
    const progress = JSON.parse(
      await readFile(join(directory, 'progress.json'), 'utf8'),
    ) as SqlDeliveryProgress
    if (progress.version !== 1 || progress.planId !== plan.id)
      throw new Error('SQL delivery progress belongs to a different plan.')
    return progress
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return { version: 1, planId: plan.id, remote: {}, local: {} }
  }
}
