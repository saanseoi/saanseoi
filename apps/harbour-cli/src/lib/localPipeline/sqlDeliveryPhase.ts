import { resolve } from 'node:path'
import type { LocalAddressDbContext } from '../dbCache/localDbCacheTypes.ts'
import {
  resolveCloudflareAccountId,
  resolveCloudflareD1ApiToken,
} from '../addressSql/processLocalAddressSqlUploadImport.ts'
import {
  prepareReleaseSqlDelivery,
  executeReleaseSqlDelivery,
} from './releaseSqlDelivery.ts'
import { withSqlDeliveryCapture } from './sqlDeliveryCapture.ts'

export type SqlDeliveryPhase = {
  context: LocalAddressDbContext
  releaseId: string
  phase: string
  inputs: Record<string, unknown>
  onProgress?: (completed: number, total: number) => void | Promise<void>
}

export function sqlDeliveryPhaseDirectory(input: SqlDeliveryPhase) {
  // Release IDs can contain publisher punctuation; encode them as one path component.
  return resolve(
    import.meta.dir,
    '../../../../../.local/harbour-sql/deliveries',
    input.context.state.target,
    encodeURIComponent(input.releaseId),
    input.phase,
  )
}

/** Capture existing family SQL builders without introducing a second planning context. */
export async function deliverSqlPhase(
  input: SqlDeliveryPhase,
  generate: () => Promise<unknown>,
) {
  if (input.context.state.target === 'local') {
    await generate()
    return
  }
  if (!/^[a-z0-9-]+$/.test(input.phase))
    throw new Error('Invalid SQL delivery phase name.')
  const accountId = resolveCloudflareAccountId({
    remote: true,
    environment: input.context.state.target,
  })
  const apiToken = resolveCloudflareD1ApiToken()
  if (!accountId || !apiToken)
    throw new Error('SQL delivery requires Cloudflare account and D1 credentials.')
  const directory = sqlDeliveryPhaseDirectory(input)
  await prepareReleaseSqlDelivery({
    ...input,
    directory,
    generate: capture => {
      let target: { databaseId: string | null } | undefined
      let bytes = 0
      let parts: Uint8Array[] = []
      let pending = Promise.resolve()
      const flush = async () => {
        if (!target || !parts.length) return
        const buffer = new Uint8Array(bytes)
        let offset = 0
        for (const part of parts) {
          buffer.set(part, offset)
          offset += part.byteLength
        }
        await capture(target, buffer)
        parts = []
        bytes = 0
        target = undefined
      }
      return (async () => {
        try {
          await withSqlDeliveryCapture((destination, payload) => {
            pending = pending.then(async () => {
              if (
                target &&
                (target.databaseId !== destination.databaseId ||
                  bytes + payload.byteLength + 1 > 64 * 1024 * 1024)
              )
                await flush()
              target = destination
              parts.push(payload, new Uint8Array([10]))
              bytes += payload.byteLength + 1
            })
            return pending
          }, generate)
          await pending
          await flush()
        } finally {
          await pending
        }
      })()
    },
  })
  const execution = { ...input, directory, accountId, apiToken }
  await executeReleaseSqlDelivery({ ...execution, mode: 'remote' })
  await executeReleaseSqlDelivery({ ...execution, mode: 'local' })
}
