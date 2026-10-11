import { createHash } from '@repo/core/pipeline/utils'

type DivisionDeliveryPhaseInput = {
  preparedSha256: string
  supplementalRowsHash: string
  classificationFixtureHash: string
  snapshotId: string
  nativeRowsHash?: string
  rebuildPublishedSnapshot?: boolean
}

/**
 * A published snapshot rebuild has new canonical inputs while its source
 * release remains immutable. Keep its sealed SQL plan apart from the original
 * delivery, while making retries of the same rebuild resumable.
 */
export async function resolveDivisionDeliveryPhase(input: DivisionDeliveryPhaseInput) {
  if (!input.rebuildPublishedSnapshot) return 'division-data'

  const fingerprint = await createHash({
    classificationFixtureHash: input.classificationFixtureHash,
    nativeRowsHash: input.nativeRowsHash ?? null,
    preparedSha256: input.preparedSha256,
    snapshotId: input.snapshotId,
    supplementalRowsHash: input.supplementalRowsHash,
  })
  return `division-data-rebuild-${fingerprint.slice(0, 16)}`
}
