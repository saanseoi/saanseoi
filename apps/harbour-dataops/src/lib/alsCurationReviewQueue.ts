import { createHash } from 'node:crypto'
import { mkdir, rename } from 'node:fs/promises'
import { join } from 'node:path'
import type { AlsCurationReviewError } from '../../../harbour-cli/src/lib/sources/hkgov/dpo/hkgovAlsReviewIssue'

export async function queueAlsCurationReview(
  error: AlsCurationReviewError,
  directory: string,
) {
  const body = JSON.stringify({ schemaVersion: 1, ...error.issue }, null, 2)
  const digest = createHash('sha256').update(body).digest('hex').slice(0, 16)
  const safe = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, '_')
  await mkdir(directory, { recursive: true })
  const path = join(
    directory,
    `${safe(error.issue.sourceVersion)}-${safe(error.issue.decisionId)}-${digest}.json`,
  )
  const temporary = `${path}.${crypto.randomUUID()}.tmp`
  await Bun.write(temporary, `${body}\n`)
  await rename(temporary, path)
  return path
}
