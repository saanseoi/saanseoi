import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import { assertPreparedAlsDeletionReview } from '../../sources/hkgov/dpo/hkgovAlsDeletionPreflight.ts'
import {
  readAlsMembership,
  type AlsMembership,
} from '../../sources/hkgov/dpo/hkgovAlsMembership.ts'

export function addressMembershipMirrorFile(scopeId: string, snapshotId: string) {
  if (![scopeId, snapshotId].every(value => /^[a-zA-Z0-9_-]+$/.test(value)))
    throw new Error('Invalid Address membership identity.')
  return `address-membership/${scopeId}/${snapshotId}.json`
}

/** A prepared sidecar never establishes the predecessor: only acknowledged delivery does. */
export async function prepareAddressMembershipBaseline(input: {
  cacheDir: string
  currentPath: string
  scopeId: string
  parentSnapshotId: string | null
  preparedFile: string
  sourceVersion: string
  reportFile: string
}) {
  let previous: AlsMembership | null = null
  let previousMembershipFile: string | undefined
  if (input.parentSnapshotId) {
    previousMembershipFile = join(
      input.cacheDir,
      addressMembershipMirrorFile(input.scopeId, input.parentSnapshotId),
    )
    try {
      previous = await readAlsMembership(previousMembershipFile)
    } catch (error) {
      throw new Error(
        'The acknowledged Address predecessor membership is missing or invalid. Prepare a chronological local rebuild before planning deltas.',
        { cause: error },
      )
    }
  }
  const db = new Database(input.currentPath, { readonly: true, create: false })
  try {
    const mapping = db
      .query<
        { snapshotId: string; preparedAt: string | null; publicationToken: string },
        [string]
      >(
        'SELECT snapshotId,preparedAt,publicationToken FROM addressPublicationState WHERE scopeId = ?',
      )
      .get(input.scopeId)
    if (
      (mapping?.snapshotId ?? null) !== input.parentSnapshotId ||
      (mapping && (!mapping.preparedAt || !mapping.publicationToken))
    )
      throw new Error(
        'The Address current projection does not match the acknowledged predecessor.',
      )
    const ids = new Set(
      db
        .query<{ id: string }, [string]>(
          'SELECT id FROM address2d WHERE snapshotId = ?',
        )
        .all(input.scopeId)
        .map(row => row.id),
    )
    if (
      ids.size !== (previous?.addresses.length ?? 0) ||
      previous?.addresses.some(row => !ids.has(row.id))
    )
      throw new Error(
        'The Address mirror membership is incomplete; rebuild it before planning deletions.',
      )
    const collections = new Map(
      db
        .query<{ id: string; address2dId: string; units: string }, [string]>(
          'SELECT id,address2dId,units FROM address3d WHERE snapshotId=?',
        )
        .all(input.scopeId)
        .map(row => [row.id, row]),
    )
    if (
      collections.size !== (previous?.collections.length ?? 0) ||
      previous?.collections.some(expected => {
        const actual = collections.get(expected.id)
        if (!actual || actual.address2dId !== expected.ownerId) return true
        const units = new Set(
          (JSON.parse(actual.units) as Array<{ id: string }>).map(row => row.id),
        )
        return (
          units.size !== expected.units.length ||
          expected.units.some(([id]) => !units.has(id))
        )
      })
    )
      throw new Error(
        'The Address3D mirror membership is incomplete; rebuild it before planning deletions.',
      )
  } finally {
    db.close()
  }
  const current = await assertPreparedAlsDeletionReview({
    preparedFile: input.preparedFile,
    sourceVersion: input.sourceVersion,
    previousMembershipFile,
    reportFile: input.reportFile,
  })
  const ids = new Set(current.addresses.map(row => row.id))
  return {
    current,
    retiredIds:
      previous?.addresses.filter(row => !ids.has(row.id)).map(row => row.id) ?? [],
    previousBytes: previousMembershipFile
      ? await readFile(previousMembershipFile)
      : null,
  }
}
