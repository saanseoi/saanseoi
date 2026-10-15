import {
  resolveSnapshotReplayPlan,
  resolveApiReleaseSetSnapshotsForRequest,
} from '@repo/core/db/metaRegistry'
import { decompressJsonBrotli } from '@repo/core/pipeline/services/storage/brotliJson.ts'
import type { ContainmentArea } from '@repo/core/pipeline/services/divisions/containmentGeometry'
import { and, currentSchema, historySchema, metaSchema, eq, desc, ne } from '@repo/db'
import {
  resolveSnapshotVersionState,
  historyVersionSelection,
  type ResolvedSnapshotVersion,
} from '@repo/core/pipeline/db/snapshotReplay'
import type { HarbourReadableDb } from '@repo/core/db/types'
import type { LocalAddressDbContext } from '../../dbCache/localDbCache'
import { buildGeographicCrosswalk, type CrosswalkDivision } from './geographicCrosswalk'

type Selection = NonNullable<
  Awaited<ReturnType<typeof resolveApiReleaseSetSnapshotsForRequest>>
>

type CrosswalkContext = Pick<LocalAddressDbContext, 'currentDb'> &
  Partial<Pick<LocalAddressDbContext, 'metaDb' | 'historyTargets'>>

/** Replay an immutable branch, including unchanged inherited content and deletions. */
async function replayCrosswalkRows(
  context: CrosswalkContext,
  snapshotId: string,
  type: 'division' | 'divisionArea',
) {
  if (!context.metaDb || !context.historyTargets)
    throw new Error(
      `Crosswalk input ${snapshotId} is not CURRENT-ready and history is unavailable.`,
    )
  const plan = await resolveSnapshotReplayPlan(context.metaDb as never, snapshotId)
  const versions = await resolveSnapshotVersionState(
    plan,
    new Map(
      context.historyTargets.map(target => [
        target.bindingName,
        { bindingName: target.bindingName, db: target.db as HarbourReadableDb },
      ]),
    ),
    [type],
  )
  const groups = new Map<HarbourReadableDb, ResolvedSnapshotVersion[]>()
  for (const version of versions.values()) {
    const group = groups.get(version.shard.db) ?? []
    group.push(version)
    groups.set(version.shard.db, group)
  }
  const rows: Array<{
    id: string
    class?: string
    divisionId?: string
    geometry?: unknown
  }> = []
  for (const [db, entries] of groups) {
    for (let offset = 0; offset < entries.length; offset += 80) {
      const batch = entries.slice(offset, offset + 80)
      const found =
        type === 'division'
          ? await db
              .select({
                id: historySchema.divisions.id,
                class: historySchema.divisions.class,
              })
              .from(historySchema.divisions)
              .where(historyVersionSelection(historySchema.divisions, batch))
              .all()
          : await db
              .select({
                id: historySchema.divisionAreas.id,
                divisionId: historySchema.divisionAreas.divisionId,
                geometry: historySchema.divisionAreas.geometry,
              })
              .from(historySchema.divisionAreas)
              .where(historyVersionSelection(historySchema.divisionAreas, batch))
              .all()
      if (found.length !== batch.length)
        throw new Error(`Missing retained crosswalk content for ${snapshotId}.`)
      rows.push(...found)
    }
  }
  if (!rows.length) throw new Error(`No retained crosswalk content for ${snapshotId}.`)
  return rows
}

/** Never substitute a newer CURRENT scope for a pinned snapshot. */
export async function loadCrosswalkDivisions(
  context: CrosswalkContext,
  selection: Selection,
  variant: string,
  sourceClass?: string,
) {
  const exactSnapshot = (resourceType: 'division' | 'divisionArea') => {
    const candidates = selection.snapshots.filter(
      row => row.snapshotResourceType === resourceType && row.variant === variant,
    )
    if (candidates.length !== 1)
      throw new Error(
        `Expected one ${variant} ${resourceType} snapshot in ${selection.releaseSet.code}.`,
      )
    return candidates[0]!.snapshotId
  }
  const snapshotId = exactSnapshot('division'),
    areaSnapshotId = exactSnapshot('divisionArea')
  const db = context.currentDb
  const {
    divisionPublicationState: publication,
    divisionAreaPublicationState: areaPublication,
    divisions,
    divisionAreas,
  } = currentSchema
  const receipt = await db
    .select()
    .from(publication)
    .where(
      and(eq(publication.snapshotId, snapshotId), eq(publication.status, 'current')),
    )
    .get()
  const areaReceipt = await db
    .select()
    .from(areaPublication)
    .where(
      and(
        eq(areaPublication.snapshotId, areaSnapshotId),
        eq(areaPublication.status, 'current'),
      ),
    )
    .get()
  const identities = receipt
    ? await db
        .select({ id: divisions.id })
        .from(divisions)
        .where(
          and(
            eq(divisions.scopeId, receipt.scopeId),
            sourceClass ? eq(divisions.class, sourceClass) : undefined,
          ),
        )
        .all()
    : (await replayCrosswalkRows(context, snapshotId, 'division')).filter(
        row => !sourceClass || row.class === sourceClass,
      )
  const areas = areaReceipt
    ? await db
        .select({
          divisionId: divisionAreas.divisionId,
          geometry: divisionAreas.geometry,
        })
        .from(divisionAreas)
        .where(eq(divisionAreas.scopeId, areaReceipt.scopeId))
        .all()
    : (await replayCrosswalkRows(context, areaSnapshotId, 'divisionArea')).map(row => ({
        divisionId: row.divisionId!,
        geometry: row.geometry,
      }))
  const polygons = new Map<string, ContainmentArea[]>()
  for (const row of areas) {
    const geometry =
      row.geometry instanceof Uint8Array || row.geometry instanceof ArrayBuffer
        ? decompressJsonBrotli(row.geometry)
        : row.geometry
    if (
      !geometry ||
      typeof geometry !== 'object' ||
      !('type' in geometry) ||
      !['Polygon', 'MultiPolygon'].includes(String(geometry.type))
    )
      continue
    polygons.set(row.divisionId, [
      ...(polygons.get(row.divisionId) ?? []),
      geometry as ContainmentArea,
    ])
  }
  const missing = identities.filter(row => !polygons.has(row.id)).map(row => row.id)
  if (sourceClass && missing.length)
    throw new Error(
      `${missing.length} published ${sourceClass} divisions lack polygons.`,
    )
  const rows: CrosswalkDivision[] = identities
    .filter(row => polygons.has(row.id))
    .map(row => ({ id: row.id, areas: polygons.get(row.id)! }))
  if (!rows.length)
    throw new Error(`No usable polygons in ${selection.releaseSet.code}.`)
  return { snapshotId, areaSnapshotId, rows, missing }
}

/** All initialisation cohorts, paired with each published SaanSeoi geographic edition.
 * Only the latest revision per cohort is materialised; older immutable artefacts remain retained.
 */
export const crosswalkSourceDomains = {
  'hkgov-pland-pu': 'planning-tpu',
  'hkgov-censtatd-hma': 'housing-market-area',
  'hkgov-pland-new-town': 'planning-newtown',
} as const

export async function* prepareCurrentGeographicCrosswalks(
  context: Pick<LocalAddressDbContext, 'currentDb' | 'metaDb' | 'historyTargets'>,
) {
  const {
    metaApiReleaseSets: sets,
    metaApiVersionReleaseSets: publications,
    metaApiVersions: versions,
  } = metaSchema
  const published = await context.metaDb
    .select({
      code: sets.code,
      domain: sets.domainCode,
      cohort: sets.cohortKey,
    })
    .from(sets)
    .innerJoin(publications, eq(publications.apiReleaseSetId, sets.id))
    .innerJoin(versions, eq(versions.id, publications.apiVersionId))
    .where(
      and(
        eq(sets.regionCode, 'hk'),
        eq(versions.code, 'api-divisions-v0.2'),
        ne(publications.status, 'draft'),
      ),
    )
    .orderBy(desc(sets.revision))
    .all()
  const latest = new Map<string, (typeof published)[number]>()
  for (const row of published) {
    const key = `${row.domain}:${row.cohort}`
    if (!latest.has(key)) latest.set(key, row)
  }
  const geographic = [...latest.values()].filter(row => row.domain === 'geographic')
  for (const domain of Object.keys(crosswalkSourceDomains)) {
    if (![...latest.values()].some(row => row.domain === domain))
      throw new Error(`Publish ${domain} before preparing geographic crosswalks.`)
  }
  if (!geographic.length)
    throw new Error('Publish geographic release sets before preparing crosswalks.')
  const resolve = async (code: string, domain: string) => {
    const selection = await resolveApiReleaseSetSnapshotsForRequest(
      context.metaDb as never,
      'division',
      {
        regionCode: 'hk',
        domainCode: domain,
        apiVersion: 'api-divisions-v0.2',
        releaseSet: code,
        inventory: domain === 'geographic' ? 'saanseoi' : domain,
      },
    )
    if (!selection) throw new Error(`Published crosswalk release unavailable: ${code}`)
    return selection
  }
  for (const edition of geographic) {
    const geographicSelection = await resolve(edition.code, edition.domain)
    const target = await loadCrosswalkDivisions(
      context,
      geographicSelection,
      'saanseoi',
    )
    for (const row of latest.values()) {
      const sourceClass =
        crosswalkSourceDomains[row.domain as keyof typeof crosswalkSourceDomains]
      if (!sourceClass) continue
      const selection = await resolve(row.code, row.domain)
      const source = await loadCrosswalkDivisions(
        context,
        selection,
        row.domain,
        sourceClass,
      )
      console.log(
        `Crosswalk: ${row.code} (${source.rows.length}) × ${edition.code} (${target.rows.length}).`,
      )
      const result = buildGeographicCrosswalk(
        {
          geographicReleaseSet: edition.code,
          geographicSnapshotId: target.snapshotId,
          geographicAreaSnapshotId: target.areaSnapshotId,
          sourceReleaseSet: row.code,
          sourceSnapshotId: source.snapshotId,
          sourceAreaSnapshotId: source.areaSnapshotId,
          sourceDomain: row.domain,
          sourceCohort: selection.releaseSet.cohortKey,
        },
        source.rows,
        target.rows,
      )
      yield { result, missingGeographicGeometry: target.missing }
    }
  }
}
