import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

import { createD1ImportClient } from '@repo/core/d1ImportApi'

export type ImportD1SqlOptions = {
  accountId: string
  apiToken: string
  databaseId: string
  filePath: string
  pollIntervalMs?: number
}

export async function importD1SqlFile(options: ImportD1SqlOptions) {
  const sql = await readFile(options.filePath)
  const etag = createHash('md5').update(sql).digest('hex')
  const client = createD1ImportClient({
    accountId: options.accountId,
    apiToken: options.apiToken,
    databaseId: options.databaseId,
  })

  const result = await client.importSql({
    etag,
    pollIntervalMs: options.pollIntervalMs,
    sql,
  })

  return {
    ...result,
    bytes: sql.byteLength,
    etag,
  }
}
