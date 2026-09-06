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
import { captureSqlDeliveryBatches } from './sqlDeliveryBatchCapture.ts'

export type SqlDeliveryPhase = {
  context: LocalAddressDbContext
  releaseId: string
  phase: string
  inputs: Record<string, unknown>
  mode?: 'remote' | 'local'
  onProgress?: (completed: number, total: number) => void | Promise<void>
}

export function sqlDeliveryPhaseDirectory(input: SqlDeliveryPhase) {
  // Release IDs can contain publisher punctuation; encode them as one path component.
  return resolve(
    import.meta.dir,
    '../../../../../.local/harbour-sql/deliveries',
    input.context.state.target,
    `release-${encodeURIComponent(input.releaseId)}`,
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
    generate: capture => captureSqlDeliveryBatches(capture, generate),
  })
  const execution = { ...input, directory, accountId, apiToken }
  if (input.mode !== 'local')
    await executeReleaseSqlDelivery({ ...execution, mode: 'remote' })
  if (input.mode !== 'remote')
    await executeReleaseSqlDelivery({ ...execution, mode: 'local' })
}
