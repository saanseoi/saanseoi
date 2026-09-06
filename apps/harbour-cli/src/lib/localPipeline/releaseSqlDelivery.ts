import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { LocalAddressDbContext } from '../dbCache/localDbCacheTypes.ts'
import { prepareSqlDelivery, runSqlDelivery, readDeliveryPlan } from './sqlDelivery.ts'
import type { SqlDeliveryTarget } from './sqlDeliveryTypes.ts'
import { readBoundDeliveryStatements } from './sqlDeliveryFiles.ts'

export async function prepareReleaseSqlDelivery(input: {
  directory: string
  context: LocalAddressDbContext
  releaseId: string
  phase: string
  inputs: Record<string, unknown>
  timings?: { mirrorPreparationMs?: number; sqlGenerationMs?: number }
  generate: (
    captureSql: (
      target: { databaseId: string | null },
      bytes: Uint8Array,
      kind?: 'sql' | 'bound',
    ) => Promise<void>,
  ) => Promise<void>
}) {
  if (input.context.state.target === 'local')
    throw new Error('Remote SQL delivery requires a remote mirror.')
  const mirror = JSON.parse(
    await readFile(join(input.context.state.dbCacheDir, 'manifest.json'), 'utf8'),
  ) as { preparedAt: string }
  return prepareSqlDelivery(
    input.directory,
    {
      releaseId: input.releaseId,
      environment: input.context.state.target,
      phase: input.phase,
      inputs: input.inputs,
      cacheDir: input.context.state.dbCacheDir,
      cachePreparedAt: mirror.preparedAt,
    },
    async append => {
      let bound: Array<{ sql: string; params: unknown[] }> = []
      let boundBytes = 0
      let boundTarget: SqlDeliveryTarget | undefined
      const flushBound = async () => {
        if (boundTarget && bound.length) {
          await append(
            boundTarget,
            new TextEncoder().encode(JSON.stringify(bound)),
            'bound',
          )
        }
        bound = []
        boundBytes = 0
        boundTarget = undefined
      }
      await input.generate(async (target, bytes, kind) => {
        const binding = Object.entries(input.context.state.bindings).find(
          ([, value]) => value.databaseId === target.databaseId,
        )
        if (!binding || !target.databaseId)
          throw new Error(
            'Could not resolve a prepared SQL target to its mirror binding.',
          )
        const resolved = { bindingName: binding[0], databaseId: target.databaseId }
        if (kind === 'bound') {
          const statements = readBoundDeliveryStatements(bytes)
          if (
            boundTarget &&
            (boundTarget.databaseId !== resolved.databaseId ||
              bound.length + statements.length > 64 ||
              boundBytes + bytes.byteLength > 16 * 1024 * 1024)
          )
            await flushBound()
          boundTarget = resolved
          bound.push(...statements)
          boundBytes += bytes.byteLength
        } else {
          await flushBound()
          await append(resolved, bytes, kind)
        }
      })
      await flushBound()
    },
    input.timings,
  )
}

export async function executeReleaseSqlDelivery(input: {
  directory: string
  context: LocalAddressDbContext
  accountId?: string
  apiToken?: string
  mode: 'remote' | 'local'
  onProgress?: (completed: number, total: number) => void | Promise<void>
}) {
  if (!input.accountId || !input.apiToken)
    throw new Error(
      'SQL delivery requires the configured Cloudflare account and D1 token.',
    )
  return runSqlDelivery(input.directory, {
    accountId: input.accountId,
    apiToken: input.apiToken,
    mode: input.mode,
    targets: Object.fromEntries(
      Object.entries(input.context.state.bindings).flatMap(([key, value]) =>
        value.databaseId ? [[key, value.databaseId]] : [],
      ),
    ),
    onProgress: input.onProgress,
  })
}

export { readDeliveryPlan }
