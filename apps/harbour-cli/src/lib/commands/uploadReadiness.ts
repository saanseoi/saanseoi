import type { HarbourReadableDb } from '@repo/core/db/types'
import {
  listCurrentApiCompositionMembersForType,
  resolveEarliestPublishedSnapshotForResourceTypeRegionAtOrAfterCohortKey,
  resolveLatestPublishedSnapshotForResourceTypeRegionAtOrBeforeCohortKey,
  resolvePublishedSnapshotForResourceTypeRegionCohortKey,
  resolvePublishedSnapshotsForResourceTypeRegionAtOrBeforeCohortKey,
} from '@repo/core/db/metaRegistry'
import { publisherCodeForSource } from '@repo/core'
import type { prepareUpload } from '@repo/core/uploadLocal'
import { metaSchema } from '@repo/db'
import { and, eq, or, sql } from 'drizzle-orm'
import {
  resolveLocalAddressDbContext,
  withRemoteCachedMetaDb,
} from '../dbCache/localDbCache.ts'
import type { UploadTarget } from '../cli/options.ts'
import { dirname } from 'node:path'
import {
  mapLocalTargetPaths,
  resolveD1Targets,
} from '../dbCache/localDbCacheTargets.ts'
import { findPendingSqlDeliveryReleaseId } from '../pipeline/local/sqlDeliveryPending.ts'

function resolveShardYear(cohortKey: string, sourceVersion: string) {
  const cohortYear = cohortKey.slice(0, 4)

  if (/^\d{4}$/.test(cohortYear)) {
    return cohortYear
  }

  return sourceVersion.slice(0, 4)
}

export async function assertAddressUploadPrerequisites(
  target: UploadTarget,
  plan: Awaited<ReturnType<typeof prepareUpload>>['plan'],
  options: {
    divisionCohortKey?: string
    resolveRemotePublishedDivisionSnapshot?: (
      target: UploadTarget,
      plan: Awaited<ReturnType<typeof prepareUpload>>['plan'],
    ) => Promise<unknown>
  } = {},
) {
  if (plan.type !== 'address' || plan.theme !== 'addresses') {
    return
  }

  if (target.remote) {
    const dependencyPlan = options.divisionCohortKey
      ? { ...plan, cohortKey: options.divisionCohortKey }
      : plan
    const snapshot = await (
      options.resolveRemotePublishedDivisionSnapshot ??
      resolveRemotePublishedDivisionSnapshotForAddressPlan
    )(target, dependencyPlan)

    if (snapshot) {
      return
    }

    throw new Error(
      [
        `Address uploads require a published division snapshot for region ${plan.regionCode.toUpperCase()}.`,
        `No published division snapshot was found for the ${plan.sourceVersion.slice(0, 4)} address shard.`,
        'Upload the division release(s) first, then rerun the address upload.',
      ].join(' '),
    )
  }

  const shardYear = resolveShardYear(plan.cohortKey, plan.sourceVersion)
  const dbContext = await resolveLocalAddressDbContext(
    target,
    plan.regionCode,
    shardYear,
    { cacheTableProfile: 'division' },
  )

  try {
    const metaReadDb = dbContext.metaDb as unknown as HarbourReadableDb
    const cohortSnapshot = await metaReadDb
      .select({ id: metaSchema.metaSnapshots.id })
      .from(metaSchema.metaSnapshots)
      .innerJoin(
        metaSchema.metaSnapshotLineages,
        eq(
          metaSchema.metaSnapshots.snapshotLineageId,
          metaSchema.metaSnapshotLineages.id,
        ),
      )
      .where(
        and(
          eq(metaSchema.metaSnapshots.resourceType, 'division'),
          eq(metaSchema.metaSnapshots.status, 'published'),
          options.divisionCohortKey
            ? eq(metaSchema.metaSnapshots.cohortKey, options.divisionCohortKey)
            : sql`${metaSchema.metaSnapshots.cohortKey} LIKE ${`${plan.sourceVersion.slice(0, 4)}-%`}`,
          eq(metaSchema.metaSnapshotLineages.regionCode, plan.regionCode),
          eq(metaSchema.metaSnapshotLineages.variant, 'overture'),
        ),
      )
      .limit(1)
      .get()

    if (cohortSnapshot) {
      return
    }
  } finally {
    dbContext.cleanup()
  }

  throw new Error(
    [
      `Address uploads require a published division snapshot for region ${plan.regionCode.toUpperCase()}.`,
      `No published division snapshot was found for the ${plan.sourceVersion.slice(0, 4)} address shard.`,
      'Upload the division release(s) first, then rerun the address upload.',
    ].join(' '),
  )
}

export type DivisionGeometryPlan = Awaited<ReturnType<typeof prepareUpload>>['plan']

export type AddressPlan = Awaited<ReturnType<typeof prepareUpload>>['plan']

type AddressReleaseSetReadiness = {
  divisionCohortKey: string | null
}

const LEGACY_OVERTURE_DIVISION_DATASET_CODE = 'ds-hk-overture-division'

type DivisionReleaseSetMemberReadiness = {
  cohortKeys: string[]
  cohortMatchingMode: string
  isRequired: boolean
  releaseCode: string | null
  resourceType: string
  variant: string
}

export type DivisionReleaseSetReadiness = {
  domainCode: string
  members: DivisionReleaseSetMemberReadiness[]
  ready: boolean
}

export async function assertDivisionGeometryUploadPrerequisites(
  target: UploadTarget,
  plan: DivisionGeometryPlan,
  options: {
    resolveRemotePublishedDivisionSnapshot?: (
      target: UploadTarget,
      plan: DivisionGeometryPlan,
    ) => Promise<unknown>
  } = {},
) {
  if (
    (plan.type !== 'divisionArea' && plan.type !== 'divisionBoundary') ||
    plan.theme !== 'divisions'
  ) {
    return
  }

  // HAD and C&SD district areas are independently bridged to canonical divisions.
  if (
    plan.source === 'hkgov-had' ||
    (plan.source === 'hkgov-censtatd' &&
      (plan.datasetCode === 'ds-hk-hkgov-censtatd-division-area-district' ||
        plan.datasetCode ===
          'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district' ||
        plan.datasetCode ===
          'ds-hk-hkgov-censtatd-division-statistic-population-households-district' ||
        plan.datasetCode ===
          'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district' ||
        plan.datasetCode ===
          'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-district'))
  ) {
    return
  }

  const snapshot = target.remote
    ? await (
        options.resolveRemotePublishedDivisionSnapshot ??
        resolveRemotePublishedSnapshotForGeometryPlan
      )(target, plan)
    : await resolveLocalPublishedDivisionSnapshotForGeometryPlan(target, plan)

  if (snapshot) return

  throw new Error(
    [
      `${plan.type} uploads require a published division snapshot for region ${plan.regionCode.toUpperCase()}.`,
      `No published division snapshot was found for the ${plan.cohortKey} cohort.`,
      'Upload the division release first, then rerun this upload.',
    ].join(' '),
  )
}

export async function resolveDivisionApiReleaseSetReadiness(
  target: UploadTarget,
  plan: DivisionGeometryPlan,
): Promise<DivisionReleaseSetReadiness> {
  const domainCode = resolveDivisionDomainCode(plan.source, plan.datasetCode)
  const resolveReadiness = (db: HarbourReadableDb) =>
    resolveDivisionCompositionReadiness(db, plan, domainCode)

  if (target.remote) {
    return withRemoteCachedMetaDb(target, db =>
      resolveReadiness(db as unknown as HarbourReadableDb),
    )
  }

  const dbContext = await resolveLocalAddressDbContext(
    target,
    plan.regionCode,
    resolveShardYear(plan.cohortKey, plan.sourceVersion),
    { cacheTableProfile: 'division' },
  )
  try {
    return await resolveReadiness(dbContext.metaDb as unknown as HarbourReadableDb)
  } finally {
    dbContext.cleanup()
  }
}

export async function resolveAddressApiReleaseSetReadiness(
  target: UploadTarget,
  plan: Pick<AddressPlan, 'cohortKey' | 'regionCode' | 'sourceVersion'>,
  divisionCohortKey?: string,
): Promise<AddressReleaseSetReadiness> {
  if (divisionCohortKey) return { divisionCohortKey }
  if (target.remote) return { divisionCohortKey: null }

  const dbContext = await resolveLocalAddressDbContext(
    target,
    plan.regionCode,
    resolveShardYear(plan.cohortKey, plan.sourceVersion),
    { cacheTableProfile: 'division' },
  )
  try {
    const rows = await (dbContext.metaDb as unknown as HarbourReadableDb)
      .select({ cohortKey: metaSchema.metaSnapshots.cohortKey })
      .from(metaSchema.metaSnapshots)
      .innerJoin(
        metaSchema.metaSnapshotLineages,
        eq(
          metaSchema.metaSnapshots.snapshotLineageId,
          metaSchema.metaSnapshotLineages.id,
        ),
      )
      .where(
        and(
          eq(metaSchema.metaSnapshots.resourceType, 'division'),
          eq(metaSchema.metaSnapshots.status, 'published'),
          eq(metaSchema.metaSnapshotLineages.regionCode, plan.regionCode),
          eq(metaSchema.metaSnapshotLineages.variant, 'overture'),
        ),
      )
      .all()
    const cohorts = [...new Set(rows.map(row => row.cohortKey))].sort()
    return {
      divisionCohortKey:
        cohorts.filter(cohort => cohort <= plan.cohortKey).at(-1) ?? cohorts[0] ?? null,
    }
  } finally {
    dbContext.cleanup()
  }
}

export function resolveDivisionDomainCode(
  source: DivisionGeometryPlan['source'] | undefined,
  datasetCode?: string,
) {
  if (
    datasetCode ===
    'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups'
  ) {
    return 'hkgov-censtatd-hma'
  }
  return source === 'hkgov-landsd' ||
    source === 'hkgov-pland-pu' ||
    source === 'hkgov-pland-new-town'
    ? source
    : 'geographic'
}

function matchesDivisionDomain(
  source: DivisionGeometryPlan['source'] | undefined,
  datasetCode?: string,
) {
  const domainCode = resolveDivisionDomainCode(source, datasetCode)

  // The initial Overture division snapshot predates snapshot lineages. Its
  // primary dataset is therefore the durable domain identity until it is
  // superseded by a lineage-backed revision.
  return domainCode === 'geographic'
    ? or(
        eq(metaSchema.metaSnapshotLineages.variant, 'overture'),
        eq(metaSchema.metaDatasets.code, LEGACY_OVERTURE_DIVISION_DATASET_CODE),
      )
    : eq(metaSchema.metaSnapshotLineages.variant, domainCode)
}

export function withReleaseSetCohort(
  plan: DivisionGeometryPlan,
  releaseSetCode: string | undefined,
): DivisionGeometryPlan {
  const cohortKey = parseDivisionReleaseSetCohortKey(releaseSetCode)
  return cohortKey ? { ...plan, cohortKey } : plan
}

export function parseDivisionReleaseSetCohortKey(releaseSetCode: string | undefined) {
  return releaseSetCode?.match(
    /^data-[a-z0-9]+-divisions-(.+?)(?:-r\d+)?(?:--[a-z0-9-]+)?$/i,
  )?.[1]
}

async function resolveLocalPublishedDivisionSnapshotForGeometryPlan(
  target: UploadTarget,
  plan: DivisionGeometryPlan,
) {
  const shardYear = resolveShardYear(plan.cohortKey, plan.sourceVersion)
  const metaPath = mapLocalTargetPaths(await resolveD1Targets('local')).DB_META
  const resumeSqlDeliveryReleaseId = metaPath
    ? await findPendingSqlDeliveryReleaseId(dirname(metaPath), plan.releaseCode)
    : undefined
  const dbContext = await resolveLocalAddressDbContext(
    target,
    plan.regionCode,
    shardYear,
    { cacheTableProfile: 'division', resumeSqlDeliveryReleaseId },
  )
  try {
    const db = dbContext.metaDb
    if (isCenstatdPermanentLivingQuartersPlan(plan)) {
      return await resolveCenstatdPermanentLivingQuartersDivisionSnapshot(
        db as unknown as HarbourReadableDb,
        plan,
      )
    }
    return (
      (await db
        .select({
          code: metaSchema.metaSnapshots.code,
          id: metaSchema.metaSnapshots.id,
        })
        .from(metaSchema.metaSnapshots)
        .leftJoin(
          metaSchema.metaSnapshotLineages,
          eq(
            metaSchema.metaSnapshots.snapshotLineageId,
            metaSchema.metaSnapshotLineages.id,
          ),
        )
        .innerJoin(
          metaSchema.metaSnapshotSources,
          eq(metaSchema.metaSnapshots.id, metaSchema.metaSnapshotSources.snapshotId),
        )
        .innerJoin(
          metaSchema.metaDatasets,
          eq(metaSchema.metaSnapshotSources.datasetId, metaSchema.metaDatasets.id),
        )
        .where(
          and(
            eq(metaSchema.metaSnapshots.resourceType, 'division'),
            eq(metaSchema.metaSnapshots.status, 'published'),
            eq(metaSchema.metaSnapshots.cohortKey, plan.cohortKey),
            eq(metaSchema.metaDatasets.regionCode, plan.regionCode),
            matchesDivisionDomain(plan.source, plan.datasetCode),
            eq(metaSchema.metaSnapshotSources.role, 'primary'),
          ),
        )
        .limit(1)
        .get()) ?? null
    )
  } finally {
    dbContext.cleanup()
  }
}

async function resolveRemotePublishedSnapshotForGeometryPlan(
  target: UploadTarget,
  plan: DivisionGeometryPlan,
) {
  return withRemoteCachedMetaDb(target, async db => {
    if (isCenstatdPermanentLivingQuartersPlan(plan)) {
      return resolveCenstatdPermanentLivingQuartersDivisionSnapshot(
        db as unknown as HarbourReadableDb,
        plan,
      )
    }
    return (
      (await db
        .select({
          resourceType: metaSchema.metaSnapshots.resourceType,
          snapshotId: metaSchema.metaSnapshots.id,
        })
        .from(metaSchema.metaSnapshots)
        .leftJoin(
          metaSchema.metaSnapshotLineages,
          eq(
            metaSchema.metaSnapshots.snapshotLineageId,
            metaSchema.metaSnapshotLineages.id,
          ),
        )
        .innerJoin(
          metaSchema.metaSnapshotSources,
          eq(metaSchema.metaSnapshots.id, metaSchema.metaSnapshotSources.snapshotId),
        )
        .innerJoin(
          metaSchema.metaDatasets,
          eq(metaSchema.metaSnapshotSources.datasetId, metaSchema.metaDatasets.id),
        )
        .where(
          and(
            eq(metaSchema.metaSnapshots.resourceType, 'division'),
            eq(metaSchema.metaSnapshots.status, 'published'),
            eq(metaSchema.metaDatasets.regionCode, plan.regionCode),
            matchesDivisionDomain(plan.source, plan.datasetCode),
            eq(metaSchema.metaSnapshots.cohortKey, plan.cohortKey),
            eq(metaSchema.metaSnapshotSources.role, 'primary'),
          ),
        )
        .limit(1)
        .get()) ?? null
    )
  })
}

async function resolveCenstatdPermanentLivingQuartersDivisionSnapshot(
  db: HarbourReadableDb,
  plan: DivisionGeometryPlan,
) {
  return (
    (await resolveLatestPublishedSnapshotForResourceTypeRegionAtOrBeforeCohortKey(
      db,
      'division',
      plan.regionCode,
      plan.cohortKey,
      { publisherCode: 'overture', variant: 'overture' },
    )) ??
    (await resolveEarliestPublishedSnapshotForResourceTypeRegionAtOrAfterCohortKey(
      db,
      'division',
      plan.regionCode,
      plan.cohortKey,
      { publisherCode: 'overture', variant: 'overture' },
    ))
  )
}

function isCenstatdPermanentLivingQuartersPlan(plan: DivisionGeometryPlan) {
  return (
    plan.source === 'hkgov-censtatd' &&
    plan.datasetCode ===
      'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters'
  )
}

async function resolveDivisionCompositionReadiness(
  db: HarbourReadableDb,
  plan: DivisionGeometryPlan,
  domainCode: string,
): Promise<DivisionReleaseSetReadiness> {
  const members = (await listCurrentApiCompositionMembersForType(db, 'division'))
    .filter(member => member.domainCode === domainCode)
    .filter(member => member.resourceType.startsWith('division'))

  if (members.length === 0) {
    throw new Error(
      `No current Divisions API composition members were found for domain ${domainCode}.`,
    )
  }

  const readinessMembers = await Promise.all(
    members.map(async member => {
      const snapshots = await resolveCompositionMemberSnapshots(db, member, plan)
      return {
        cohortKeys: snapshots.map(snapshot => snapshot.cohortKey),
        cohortMatchingMode: member.cohortMatchingMode,
        isRequired: member.isRequired,
        releaseCode: snapshots[0]?.code ?? null,
        resourceType: member.resourceType,
        variant: member.variant,
      }
    }),
  )

  return {
    domainCode,
    members: readinessMembers,
    ready: readinessMembers.every(member => !member.isRequired || member.releaseCode),
  }
}

async function resolveCompositionMemberSnapshots(
  db: HarbourReadableDb,
  member: Awaited<ReturnType<typeof listCurrentApiCompositionMembersForType>>[number],
  plan: DivisionGeometryPlan,
): Promise<Array<{ code: string; cohortKey: string }>> {
  if (member.variant === 'default') {
    const snapshot = await resolvePublishedSnapshotForResourceTypeRegionCohortKey(
      db,
      member.resourceType,
      plan.regionCode,
      plan.cohortKey,
    )
    return snapshot ? [{ code: snapshot.code, cohortKey: plan.cohortKey }] : []
  }

  const datasetCode = member.variant.startsWith('ds-') ? member.variant : undefined
  const source = member.variant.split(':')[0] ?? member.variant
  const publisherCode = datasetCode ? undefined : publisherCodeForSource(source)
  const snapshots =
    await resolvePublishedSnapshotsForResourceTypeRegionAtOrBeforeCohortKey(
      db,
      member.resourceType,
      plan.regionCode,
      plan.cohortKey,
      { datasetCode, publisherCode, variant: member.variant },
    )

  if (member.cohortMatchingMode === 'latest_at_or_before_cohort_per_dataset') {
    return snapshots.map(snapshot => ({
      code: snapshot.code,
      cohortKey: snapshot.cohortKey,
    }))
  }
  if (member.cohortMatchingMode === 'latest_at_or_before_or_earliest_after_cohort') {
    if (snapshots.length > 0) {
      return snapshots.map(snapshot => ({
        code: snapshot.code,
        cohortKey: snapshot.cohortKey,
      }))
    }
    const snapshot =
      await resolveEarliestPublishedSnapshotForResourceTypeRegionAtOrAfterCohortKey(
        db,
        member.resourceType,
        plan.regionCode,
        plan.cohortKey,
        { datasetCode, publisherCode },
      )
    return snapshot ? [{ code: snapshot.code, cohortKey: snapshot.cohortKey }] : []
  }

  return snapshots
    .filter(snapshot => snapshot.cohortKey === plan.cohortKey)
    .map(snapshot => ({ code: snapshot.code, cohortKey: snapshot.cohortKey }))
}

async function resolveRemotePublishedDivisionSnapshotForAddressPlan(
  target: UploadTarget,
  plan: Awaited<ReturnType<typeof prepareUpload>>['plan'],
) {
  return withRemoteCachedMetaDb(
    target,
    async db =>
      (await db
        .select({ snapshotId: metaSchema.metaSnapshots.id })
        .from(metaSchema.metaSnapshots)
        .leftJoin(
          metaSchema.metaSnapshotLineages,
          eq(
            metaSchema.metaSnapshots.snapshotLineageId,
            metaSchema.metaSnapshotLineages.id,
          ),
        )
        .innerJoin(
          metaSchema.metaSnapshotSources,
          eq(metaSchema.metaSnapshots.id, metaSchema.metaSnapshotSources.snapshotId),
        )
        .innerJoin(
          metaSchema.metaDatasets,
          eq(metaSchema.metaSnapshotSources.datasetId, metaSchema.metaDatasets.id),
        )
        .where(
          and(
            eq(metaSchema.metaSnapshots.resourceType, 'division'),
            eq(metaSchema.metaSnapshots.status, 'published'),
            eq(metaSchema.metaSnapshots.cohortKey, plan.cohortKey),
            eq(metaSchema.metaDatasets.regionCode, plan.regionCode),
            matchesDivisionDomain('overture'),
            eq(metaSchema.metaSnapshotSources.role, 'primary'),
          ),
        )
        .limit(1)
        .get()) ?? null,
  )
}
