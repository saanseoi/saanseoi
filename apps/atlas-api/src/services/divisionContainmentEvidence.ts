import type { SnapshotReplayStep } from '@repo/core/db/metaRegistry'
import type { ReplayShard } from '@repo/core/pipeline/db/snapshotReplay.ts'
import { resolveSnapshotSourceResolutions } from '@repo/core/pipeline/db/sourceResolutionReplay.ts'
import type { SourceResolutions } from '@repo/db/historySchema'

export type DivisionContainmentEvidence = Map<
  string,
  NonNullable<SourceResolutions['divisionContainment']>[string]
>

/** Replay proofs independently of content versions, including evidence-only deltas. */
export async function loadDivisionContainmentEvidence(
  plan: SnapshotReplayStep[],
  shards: ReadonlyMap<string, ReplayShard>,
): Promise<DivisionContainmentEvidence> {
  const evidence: DivisionContainmentEvidence = new Map()
  const resolutions = await resolveSnapshotSourceResolutions(plan, shards)
  for (const { resolutions: value } of resolutions.values()) {
    for (const id of value.entities.division ?? []) {
      const proof = value.divisionContainment?.[id]
      if (!proof) continue
      if (evidence.has(id))
        throw new Error(`Ambiguous containment evidence for Division ${id}.`)
      evidence.set(id, proof)
    }
  }
  return evidence
}
