import { inArray, historySchema } from '@repo/db'
import {
  resolveApiReleaseSetSnapshotsForRequest,
  resolveSnapshotReplayPlan,
} from '@repo/core/db/metaRegistry'
import {
  resolveSnapshotVersionState,
  groupResolvedVersionsByShard,
} from '@repo/core/pipeline/db/snapshotReplay.ts'
import type { AppEnv } from '../types'
import { runWithD1ReadRetry } from '../lib/d1'
import { resolveDataRegion, type ApiRegion } from '../schema/region'

export type IdentityMapping = {
  namespace: string
  identifier: string
  canonicalId: string
}
export type IdentityBridgeQuery = {
  resourceType: 'division' | 'address2d'
  region: ApiRegion
  domain: string
  releaseSet: string
  catalogRevision?: string
  namespace?: string
  identifier?: string
  canonicalId?: string
  cursor?: string
  limit: number
}

/** Extract identities, excluding inherited Planning codes and curation metadata. */
export function extractIdentityMappings(
  identifiers: unknown,
  canonicalId: string,
): IdentityMapping[] {
  if (!identifiers || typeof identifiers !== 'object' || Array.isArray(identifiers))
    return []
  const object = identifiers as Record<string, unknown>
  const result: IdentityMapping[] = []
  const planning =
    object.hkgovPland && typeof object.hkgovPland === 'object'
      ? (object.hkgovPland as Record<string, unknown>)
      : object
  const code = (level: string) =>
    planning[`PLAND:${level.toUpperCase()}`] ?? planning[level]
  const ownLevel = ['subunit', 'tpu', 'spu', 'ppu'].find(
    level => code(level) != null && code(level) !== '',
  )
  if (ownLevel) {
    const value =
      ownLevel === 'subunit'
        ? `${code('tpu')}-${code('subunit')}`
        : String(code(ownLevel))
    if (ownLevel !== 'subunit' || code('tpu') != null)
      result.push({
        namespace: `PLAND:${ownLevel.toUpperCase()}`,
        identifier: value,
        canonicalId,
      })
  }
  const visit = (value: unknown, path: string) => {
    if (typeof value === 'string' || typeof value === 'number') {
      if (String(value).length)
        result.push({ namespace: path, identifier: String(value), canonicalId })
    } else if (Array.isArray(value)) {
      for (const item of value) visit(item, path)
    } else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value))
        visit(child, path ? `${path}.${key}` : key)
    }
  }
  for (const [key, value] of Object.entries(object)) {
    if (
      key === 'hkgovPland' ||
      /^PLAND:(PPU|SPU|TPU|SUBUNIT)$/.test(key) ||
      /curation|correction/i.test(key)
    )
      continue
    visit(value, key)
  }
  return result
}

const mappingKey = (row: IdentityMapping) =>
  JSON.stringify([row.namespace, row.identifier, row.canonicalId])

/** Regional source codes are also retained in the canonical area record key. */
export function extractAreaIdentityMappings(
  id: string,
  identifiers: unknown,
  divisionId: string,
) {
  const rows = extractIdentityMappings(identifiers, divisionId)
  const regional = /^CENSTATD:area:(HK|KLN|NT)$/.exec(id)
  if (regional)
    rows.push({
      namespace: 'hkgovCenstatd.code',
      identifier: regional[1]!,
      canonicalId: divisionId,
    })
  return rows
}

export function identityBridgePage(
  rows: IdentityMapping[],
  query: IdentityBridgeQuery,
) {
  const unique = new Map(
    rows
      .filter(
        row =>
          (!query.namespace || row.namespace === query.namespace) &&
          (query.identifier === undefined || row.identifier === query.identifier) &&
          (!query.canonicalId || row.canonicalId === query.canonicalId),
      )
      .map(row => [mappingKey(row), row]),
  )
  const keys = [...unique.keys()]
    .sort()
    .filter(key => !query.cursor || key > query.cursor)
  const page = keys.slice(0, query.limit)
  return {
    data: page.map(key => unique.get(key)!),
    nextCursor: keys.length > query.limit ? page.at(-1)! : null,
  }
}

const dependencies = {
  resolveApiReleaseSetSnapshotsForRequest,
  resolveSnapshotReplayPlan,
  resolveSnapshotVersionState,
}

/** Read exact immutable history membership, never today's current projection. */
export async function listIdentityBridge(
  args: Pick<AppEnv['Variables'], 'metaDb' | 'historyDbsByBinding'> & {
    query: IdentityBridgeQuery
  },
  deps = dependencies,
) {
  const { query } = args
  // Identity mappings are not published for Macao yet. Resolve the requested
  // Hong Kong release metadata so an otherwise invalid selector is still
  // rejected, then return an empty collection below.
  const regionCode = query.region === 'mo' ? 'hk' : resolveDataRegion(query.region)
  const selection = await runWithD1ReadRetry(() =>
    deps.resolveApiReleaseSetSnapshotsForRequest(
      args.metaDb as never,
      query.resourceType === 'address2d' ? 'address' : query.resourceType,
      {
        regionCode,
        domainCode: query.domain,
        releaseSet: query.releaseSet,
        catalogRevision: query.catalogRevision,
      },
    ),
  )
  if (!selection) return null
  if (query.region === 'mo')
    return {
      data: [],
      nextCursor: null,
      meta: {
        releaseSet: selection.releaseSet.code,
        catalogRevision: selection.releaseSet.apiCatalogRevision,
        resourceType: query.resourceType,
        domain: selection.releaseSet.domainCode,
      },
    }
  const shards = new Map(
    Object.entries(args.historyDbsByBinding).map(([bindingName, db]) => [
      bindingName,
      { bindingName, db: db as never },
    ]),
  )
  const mappings: IdentityMapping[] = []
  const snapshots = selection.snapshots.filter(
    snapshot =>
      snapshot.role !== 'lookup' &&
      (snapshot.snapshotResourceType ===
        (query.resourceType === 'address2d' ? 'address' : query.resourceType) ||
        (query.resourceType === 'division' &&
          snapshot.snapshotResourceType === 'divisionArea')),
  )
  if (!snapshots.some(snapshot => snapshot.role === 'primary')) return null
  const states = []
  const canonicalIds = new Set<string>()
  for (const snapshot of snapshots) {
    const recordType =
      snapshot.snapshotResourceType === 'address'
        ? 'address2d'
        : snapshot.snapshotResourceType
    const plan = await runWithD1ReadRetry(() =>
      deps.resolveSnapshotReplayPlan(args.metaDb as never, snapshot.snapshotId),
    )
    const state = await runWithD1ReadRetry(() =>
      deps.resolveSnapshotVersionState(plan, shards, [recordType]),
    )
    states.push({ snapshot, recordType, state })
    if (recordType !== 'divisionArea')
      for (const version of state.values()) canonicalIds.add(version.recordId)
  }
  for (const { snapshot, recordType, state } of states) {
    const table =
      recordType === 'divisionArea'
        ? historySchema.divisionAreas
        : recordType === 'division'
          ? historySchema.divisions
          : historySchema.address2d
    for (const versions of groupResolvedVersionsByShard(state.values()).values()) {
      for (let offset = 0; offset < versions.length; offset += 90) {
        const batch = versions.slice(offset, offset + 90)
        const expected = new Set(
          batch.map(row => JSON.stringify([row.recordId, row.versionHash])),
        )
        const rows = await runWithD1ReadRetry(async () =>
          batch[0]!.shard.db
            .select({
              id: table.id,
              versionHash: table.versionHash,
              identifiers: table.identifiers,
              canonicalId:
                recordType === 'divisionArea'
                  ? historySchema.divisionAreas.divisionId
                  : table.id,
            })
            .from(table)
            .where(
              inArray(
                table.versionHash,
                batch.map(row => row.versionHash),
              ),
            )
            .all(),
        )
        let found = 0
        for (const row of rows) {
          if (!expected.has(JSON.stringify([row.id, row.versionHash]))) continue
          found++
          if (!canonicalIds.has(row.canonicalId)) continue
          mappings.push(
            ...(recordType === 'divisionArea'
              ? extractAreaIdentityMappings(row.id, row.identifiers, row.canonicalId)
              : extractIdentityMappings(row.identifiers, row.canonicalId)),
          )
        }
        if (found !== expected.size)
          throw new Error(
            `Incomplete identity history for snapshot ${snapshot.snapshotId}.`,
          )
      }
    }
  }
  return {
    ...identityBridgePage(mappings, query),
    meta: {
      releaseSet: selection.releaseSet.code,
      catalogRevision: selection.releaseSet.apiCatalogRevision,
      resourceType: query.resourceType,
      domain: selection.releaseSet.domainCode,
    },
  }
}
