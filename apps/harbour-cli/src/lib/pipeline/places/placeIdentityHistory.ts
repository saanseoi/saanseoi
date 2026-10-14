import { and, eq, metaSchema } from '@repo/db'
import type { HarbourReadableDb } from '@repo/core/db/types'
import {
  validateAuditManifest,
  type ObjectRef,
  type AuditManifest,
} from '@repo/core/provenance'
import type { PlaceIdentityDecision } from '@repo/core/pipeline/services/places/placeIdentity'
import type { PlaceHistoryState } from './processLocalPlaceSqlUploadTypes'

/** Restore private identity decisions from the exact component owner's retained audit. */
export async function hydratePlaceIdentityHistory(
  db: HarbourReadableDb,
  states: PlaceHistoryState[],
  read: (ref: ObjectRef) => Promise<unknown>,
) {
  const groups = Map.groupBy(states, state =>
    JSON.stringify([state.row.resourceReleaseId, state.row.snapshotId]),
  )
  for (const group of groups.values()) {
    const owner = group[0]!.row
    if (!owner.snapshotId) throw new Error('Missing exact Place component snapshot.')
    const audit = await db
      .select()
      .from(metaSchema.processingAudits)
      .where(
        and(
          eq(metaSchema.processingAudits.resourceReleaseId, owner.resourceReleaseId),
          eq(metaSchema.processingAudits.stage, 'assembly'),
          eq(metaSchema.processingAudits.ownerId, owner.snapshotId),
        ),
      )
      .get()
    if (audit?.attemptStatus !== 'completed' || typeof audit.byteLength !== 'number')
      throw new Error(`Missing completed Place identity audit: ${owner.snapshotId}.`)
    const manifest = (await read({
      hash: audit.manifestHash as ObjectRef['hash'],
      byteLength: audit.byteLength,
    })) as AuditManifest
    validateAuditManifest(manifest)
    if (
      manifest.resourceReleaseId !== owner.resourceReleaseId ||
      manifest.scope.stage !== 'assembly' ||
      manifest.scope.ownerId !== owner.snapshotId ||
      manifest.attempt.status !== 'completed'
    )
      throw new Error('Place identity audit owner mismatch.')
    const refs = manifest.bulk.flatMap(rule =>
      rule.id === 'resolve-place-identity'
        ? rule.fixtures
            .filter(fixture => fixture.type === 'place-identity-decisions')
            .map(fixture => fixture.object)
        : [],
    )
    const wanted = new Map(group.map(state => [state.row.id, state]))
    const found = new Set<string>()
    for (let offset = 0; offset < refs.length; offset += 4) {
      const parts = await Promise.all(refs.slice(offset, offset + 4).map(read))
      for (const part of parts) {
        const entries = (part as { entries?: PlaceIdentityDecision[] }).entries
        if (!Array.isArray(entries))
          throw new Error('Invalid retained Place identity partition.')
        for (const identity of entries) {
          const state = wanted.get(identity.id)
          if (!state) continue
          if (
            found.has(identity.id) ||
            !identity.evidence ||
            identity.sourceId !== identity.evidence.sourceId
          )
            throw new Error(`Invalid retained Place identity ${identity.id}.`)
          state.identity = identity
          found.add(identity.id)
        }
      }
    }
    if (found.size !== wanted.size)
      throw new Error('Incomplete retained Place identity decisions.')
  }
}
