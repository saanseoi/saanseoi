import { selectApiInventory } from '@repo/core/db/apiInventory'
import { listDivisionAreasCurrentByDivisionIds } from '../db/divisions'
import { listReplayedDivisionAreasByDivisionIds } from '../db/divisionGeometryReplay'
import { and, desc, eq, sql, metaSchema } from '@repo/db'
import {
  listApiReleaseSetSnapshots,
  resolveApiReleaseSetSnapshotsForRequest,
  resolveSnapshotReplayPlan,
} from '@repo/core/db/metaRegistry'
import { resolveSnapshotVersionState } from '@repo/core/pipeline/db/snapshotReplay.ts'
import {
  listDivisionRecordsCurrent,
  listReplayedDivisionRecords,
} from '../db/divisions'
import { addressGeocodingCandidates } from '../db/geocoding'
import type { AddressRecord } from '../db/addresses'
import type { GeocodingQuery } from '../schema/geocoding'
import { listReplayedAddressPage } from '../db/addressesHistory'
import { collectAddressCandidates } from './addressGeocoding'
import {
  getPublicationReadiness,
  guardPublicationRead,
  PublicationReadUnavailableError,
} from '../db/publicationState'
import type { AppEnv } from '../types'

export type GeocodingDatabases = Pick<
  AppEnv['Variables'],
  'metaDb' | 'currentDb' | 'historyDbsByBinding'
>
export type GeocodingRelease = {
  code: string
  id: string
  cohortKey: string | null
  domainCode: string
  schemaVersion: string
  rulesetVersion: string
  inventory?: string
  snapshots: Awaited<ReturnType<typeof listApiReleaseSetSnapshots>>
}
const {
  metaApiReleaseSets: sets,
  metaApiVersionReleaseSets: versionSets,
  metaApiVersions: versions,
  metaApiReleaseSetSnapshots: members,
} = metaSchema

/** Explicit pins may live outside the newest catalogue; never fall back to latest. */
export async function resolveGeocodingRelease(
  db: GeocodingDatabases['metaDb'],
  family: 'address' | 'division',
  code?: string,
  divisionSnapshotIds?: string[],
  selectionOptions: { apiVersion?: string; inventory?: string } = {},
): Promise<GeocodingRelease | null> {
  const domainCode = family === 'address' ? 'saanseoi' : 'geographic'
  if (!code && !divisionSnapshotIds) {
    const selected = await resolveApiReleaseSetSnapshotsForRequest(
      db as never,
      family,
      { domainCode, regionCode: 'hk', ...selectionOptions },
    )
    return selected ? { ...selected.releaseSet, snapshots: selected.snapshots } : null
  }
  const selected = await db
    .select({
      id: sets.id,
      code: sets.code,
      cohortKey: sets.cohortKey,
      domainCode: sets.domainCode,
      schemaVersion: sets.schemaVersion,
      rulesetVersion: sets.rulesetVersion,
    })
    .from(sets)
    .innerJoin(versions, eq(sets.apiVersionId, versions.id))
    .where(
      and(
        eq(
          versions.code,
          selectionOptions.apiVersion ??
            (family === 'address' ? 'api-addresses-v0.1' : 'api-divisions-v0.1'),
        ),
        eq(sets.regionCode, 'hk'),
        eq(sets.domainCode, domainCode),
        sql`${sets.status} <> 'draft' and ${sets.publishedAt} is not null`,
        code ? eq(sets.code, code) : undefined,
        divisionSnapshotIds
          ? sql`exists (select 1 from ${members} where ${members.apiReleaseSetId} = ${sets.id} and ${members.snapshotId} in (select value from json_each(${JSON.stringify(divisionSnapshotIds)})))`
          : undefined,
      ),
    )
    .orderBy(desc(sets.effectiveFrom), desc(sets.revision), desc(sets.code))
    .limit(1)
    .get()
  if (!selected) return null
  const snapshots = await listApiReleaseSetSnapshots(db as never, selected.id)
  return {
    ...selected,
    ...(family === 'division' &&
    (selectionOptions.inventory || selectionOptions.apiVersion === 'api-divisions-v0.2')
      ? selectApiInventory(snapshots, 'division', selectionOptions.inventory)
      : { snapshots }),
  }
}

const allLocales = { mode: 'all', locales: ['*'] } as const
async function replayPlan(db: GeocodingDatabases, id: string) {
  const plan = await resolveSnapshotReplayPlan(db.metaDb as never, id)
  if (
    !plan.length ||
    plan.some(
      step =>
        !step.shards.length ||
        step.shards.some(
          shard => !Object.hasOwn(db.historyDbsByBinding, shard.bindingName),
        ),
    )
  )
    throw new PublicationReadUnavailableError(
      'The selected snapshot has no available retained history.',
    )
  return plan
}
function snapshotIds(release: GeocodingRelease, family: 'address' | 'division') {
  return [
    ...new Set(
      release.snapshots
        .filter(
          snapshot =>
            snapshot.snapshotResourceType === family &&
            (family === 'address' ||
              snapshot.role === 'primary' ||
              snapshot.role === 'enrichment'),
        )
        .map(snapshot => snapshot.snapshotId),
    ),
  ]
}
export async function loadGeocodingDivisions(
  db: GeocodingDatabases,
  release: GeocodingRelease,
) {
  const ids = snapshotIds(release, 'division')
  if (!ids.length)
    throw new PublicationReadUnavailableError('Division snapshot is unavailable.')
  const token = await getPublicationReadiness(db.currentDb, 'division', ids)
  const records = await guardPublicationRead(
    db.currentDb,
    'division',
    ids,
    token,
    async () => {
      if (token !== null)
        return listDivisionRecordsCurrent(db.currentDb, {
          snapshotId: ids[0]!,
          snapshotIds: ids,
          localeSelection: { ...allLocales, locales: ['*'] },
          limit: -1,
        })
      const shards = new Map(
        Object.entries(db.historyDbsByBinding).map(([bindingName, history]) => [
          bindingName,
          { bindingName, db: history as never },
        ]),
      )
      const results = []
      for (const id of ids) {
        const plan = await replayPlan(db, id)
        const state = await resolveSnapshotVersionState(plan, shards, [
          'division',
          'divisionI18n',
        ])
        results.push(
          ...(await listReplayedDivisionRecords(
            [...state.values()].map(version => ({
              ...version,
              shard: {
                bindingName: version.shard.bindingName,
                db: db.historyDbsByBinding[
                  version.shard.bindingName as keyof typeof db.historyDbsByBinding
                ],
              },
            })),
            id,
            { ...allLocales, locales: ['*'] },
          )),
        )
      }
      return results
    },
  )
  if (!records)
    throw new PublicationReadUnavailableError('Division publication changed.')
  const unique = [
    ...new Map(records.map(record => [record.division.id, record])).values(),
  ]
  const areaSnapshot =
    release.snapshots.find(
      s =>
        s.snapshotResourceType === 'divisionArea' &&
        s.variant === (release.inventory ?? 'saanseoi'),
    ) ??
    (!release.inventory
      ? release.snapshots.find(
          s => s.snapshotResourceType === 'divisionArea' && s.variant === 'overture',
        )
      : undefined)
  let areas: Awaited<ReturnType<typeof listDivisionAreasCurrentByDivisionIds>> = []
  if (areaSnapshot) {
    const lookup = {
      snapshotId: areaSnapshot.snapshotId,
      divisionIds: unique.map(r => r.division.id),
    }
    const areaToken = await getPublicationReadiness(db.currentDb, 'divisionArea', [
      lookup.snapshotId,
    ])
    const result = await guardPublicationRead(
      db.currentDb,
      'divisionArea',
      [lookup.snapshotId],
      areaToken,
      async () => {
        if (areaToken !== null)
          return listDivisionAreasCurrentByDivisionIds(db.currentDb, lookup)
        const plan = await replayPlan(db, lookup.snapshotId)
        const shards = new Map(
          Object.entries(db.historyDbsByBinding).map(([bindingName, history]) => [
            bindingName,
            { bindingName, db: history as never },
          ]),
        )
        const state = await resolveSnapshotVersionState(plan, shards, ['divisionArea'])
        return listReplayedDivisionAreasByDivisionIds(state.values(), lookup)
      },
    )
    if (!result) throw new PublicationReadUnavailableError('Area publication changed.')
    areas = result
  }
  return { records: unique, areas }
}

export async function loadGeocodingAddresses(
  db: GeocodingDatabases,
  release: GeocodingRelease,
  query: GeocodingQuery,
): Promise<{ records: AddressRecord[]; total: number }> {
  const ids = snapshotIds(release, 'address')
  const divisionSnapshots = release.snapshots.filter(
    snapshot =>
      snapshot.snapshotResourceType === 'division' && snapshot.variant === 'overture',
  )
  const division = divisionSnapshots[0]
  if (
    !ids.length ||
    !division ||
    new Set(divisionSnapshots.map(snapshot => snapshot.snapshotId)).size !== 1
  )
    throw new PublicationReadUnavailableError(
      'Address snapshot or its canonical division companion is unavailable.',
    )
  const token = await getPublicationReadiness(db.currentDb, 'address', ids)
  const records = await guardPublicationRead(
    db.currentDb,
    'address',
    ids,
    token,
    async () => {
      if (token !== null)
        return collectAddressCandidates(
          addressGeocodingCandidates(db.currentDb, ids, query),
          query,
        )
      const plans = new Map<string, Awaited<ReturnType<typeof replayPlan>>>()
      for (const id of ids) plans.set(id, await replayPlan(db, id))
      async function* pages() {
        let after: string | undefined
        for (;;) {
          const page = await listReplayedAddressPage({
            ...db,
            snapshotIds: ids,
            replayPlans: plans,
            divisionSnapshotId: division!.snapshotId,
            localeSelection: { ...allLocales, locales: ['*'] },
            limit: 256,
            offset: 0,
            after,
          })
          yield page.records
          if (!page.hasMore || !page.records.length) return
          after = page.records.at(-1)!.address.id
        }
      }
      return collectAddressCandidates(pages(), query)
    },
  )
  if (!records)
    throw new PublicationReadUnavailableError('Address publication changed.')
  // Current foreign keys name mutable storage scopes. The selected release,
  // rather than a subsequently promoted division scope, owns this public identity.
  return {
    ...records,
    records: records.records.map(record => ({
      ...record,
      address: { ...record.address, divisionSnapshotId: division.snapshotId },
    })),
  }
}
