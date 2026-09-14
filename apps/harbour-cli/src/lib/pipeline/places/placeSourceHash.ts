import { createHash } from '@repo/core/pipeline/utils'
import { recordContent } from '@repo/core/pipeline/services/sources/recordContent'

/** Observation timestamps and publisher versions do not create a source version. */
export function hashPlaceSource(row: Record<string, unknown>) {
  return createHash(recordContent(row))
}
