import { createHash } from 'node:crypto'
import { stableJsonStringify } from '@repo/core/pipeline/utils'

/** Freeze reviewed values and bridge resolutions without serialising the entire cohort. */
export function hashCanonicalStatisticPreparation(
  canonical: Record<string, readonly unknown[]>,
) {
  const hash = createHash('sha256')
  for (const key of Object.keys(canonical).sort()) {
    const rows = canonical[key]
    if (!rows) throw new Error('Missing canonical statistic preparation section.')
    hash.update(JSON.stringify([key, rows.length])).update('\n')
    for (const row of rows) {
      const text = stableJsonStringify(row)
      if (typeof text !== 'string')
        throw new Error('Invalid canonical statistic preparation row.')
      hash.update(text).update('\n')
    }
  }
  return hash.digest('hex')
}
