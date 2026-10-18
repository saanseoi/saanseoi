import { join } from 'node:path'
import { currentSchema, metaSchema, eq } from '@repo/db'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { retainedDivisionScopeId } from '@repo/core/pipeline/services/publication/scope'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes.ts'
import { restoreSnapshotProjection } from '../../commands/rollback/projection.ts'
import { addressMembershipMirrorFile } from '../addresses/addressMembershipBaseline.ts'
import { deliverResolvedAddressSqlPhase } from '../addresses/resolvedAddressSqlPhase.ts'
import { readAlsMembership } from '../../sources/hkgov/dpo/hkgovAlsMembership.ts'
import { deliveryFileSha256 } from '../local/sqlDeliveryFiles.ts'

/** Restore a cleaned official dependency without moving the latest Address scope. */
export async function ensurePlaceAddressPublication(input: {
  context: LocalAddressDbContext
  resourceReleaseId: string
  snapshotId: string
}) {
  const current = input.context.currentDb as unknown as HarbourReadableDb
  const receipt = await current
    .select()
    .from(currentSchema.addressPublicationState)
    .where(eq(currentSchema.addressPublicationState.snapshotId, input.snapshotId))
    .get()
  if (receipt?.preparedAt && receipt.publicationToken) return

  const metaDb = input.context.metaDb as unknown as HarbourReadableDb
  const snapshot = await metaDb
    .select()
    .from(metaSchema.metaSnapshots)
    .where(eq(metaSchema.metaSnapshots.id, input.snapshotId))
    .get()
  if (snapshot?.status !== 'published')
    throw new Error('Places require a published official Address dependency.')
  const lineage = snapshot.snapshotLineageId
  if (typeof lineage !== 'string')
    throw new Error('Address dependency requires a lineage.')
  const scopeId = retainedDivisionScopeId(lineage, input.snapshotId)
  const membershipPath = join(
    input.context.state.dbCacheDir,
    addressMembershipMirrorFile(lineage, input.snapshotId),
  )
  const membership = await readAlsMembership(membershipPath)
  await deliverResolvedAddressSqlPhase(
    {
      context: input.context,
      resourceReleaseId: input.resourceReleaseId,
      phase: `places-address-dependency-${input.snapshotId}`,
      scopeId,
      snapshotId: input.snapshotId,
      expectedCount: membership.addresses.length,
      inputs: {
        snapshotId: input.snapshotId,
        scopeId,
        membershipSha256: await deliveryFileSha256(membershipPath),
      },
    },
    async candidates => {
      const candidate = candidates.DB_CURRENT?.db
      if (!candidate)
        throw new Error('Address dependency restoration requires DB_CURRENT.')
      await restoreSnapshotProjection({
        current: candidate,
        metaDb,
        historyTargets: input.context.historyTargets.map(target => ({
          bindingName: target.bindingName,
          db: target.db as unknown as HarbourReadableDb,
        })),
        snapshotId: input.snapshotId,
        scopeId,
        membershipScopeId: lineage,
        cacheDir: input.context.state.dbCacheDir,
        resourceType: 'address',
      })
    },
  )
}
