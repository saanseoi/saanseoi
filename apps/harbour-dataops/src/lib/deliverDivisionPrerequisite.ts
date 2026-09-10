import { createCloudflareD1QueryClient } from '../../../harbour-cli/src/lib/dbCache/remoteD1Client.ts'
import { executeSqlText } from '../../../harbour-cli/src/lib/localPipeline/sqlImport.ts'
import { sqlLiteral } from '../../../harbour-cli/src/lib/divisionSql/processLocalHkgovPlandDivisionSqlUploadSql.ts'
import {
  resolveCloudflareAccountId,
  resolveCloudflareD1ApiToken,
} from '../../../harbour-cli/src/lib/addressSql/processLocalAddressSqlUploadImport.ts'
import type { UploadTarget } from '../../../harbour-cli/src/lib/cli/options.ts'

/** Restore immutable prerequisite rows remotely, even when the local mirror has them. */
export async function deliverDivisionPrerequisite(input: {
  target: UploadTarget
  databaseId: string | null | undefined
  snapshotId: string
  divisions: Record<string, unknown>[]
  i18n: Record<string, unknown>[]
}) {
  if (!input.target.remote) return
  const accountId = resolveCloudflareAccountId(input.target)
  const apiToken = resolveCloudflareD1ApiToken()
  const databaseId = input.databaseId
  if (!accountId || !apiToken || !databaseId)
    throw new Error(
      'Division prerequisite delivery requires D1 credentials and target.',
    )
  const client = createCloudflareD1QueryClient({ accountId, apiToken, databaseId })
  for (const [table, rows, keys] of [
    ['divisions', input.divisions, ['id']],
    ['divisionsI18n', input.i18n, ['divisionId', 'locale']],
  ] as const) {
    const query = `SELECT ${keys.join(', ')} FROM ${table} WHERE snapshotId = ${sqlLiteral(input.snapshotId)}`
    const key = (row: Record<string, unknown>) => JSON.stringify(keys.map(k => row[k]))
    const present = new Set((await client.query(query)).map(key))
    const missing = rows.filter(row => !present.has(key(row)))
    if (!missing.length) continue
    const statements = missing.map(row => {
      const entries = Object.entries(row).filter(([, value]) => value !== undefined)
      return `INSERT INTO ${table} (${entries.map(([name]) => `"${name}"`).join(',')}) VALUES (${entries.map(([, value]) => sqlLiteral(value)).join(',')}) ON CONFLICT DO NOTHING;`
    })
    await executeSqlText({ databaseId, name: 'current' }, statements.join('\n'), {
      accountId,
      apiToken,
      isLocal: false,
    })
    const verified = new Set((await client.query(query)).map(key))
    if (rows.some(row => !verified.has(key(row))))
      throw new Error(
        `Production prerequisite verification failed for ${table}: ${input.snapshotId}`,
      )
  }
}
