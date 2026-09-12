import {
  getPublicationReadiness,
  hasSupersedingPublication,
  guardPublicationRead,
  hasHistoricalSelectors,
  PublicationReadUnavailableError,
} from '../db/publicationState'
import { resolveDataRegion, type ApiRegion } from '../schema/region'
import type { ApiProfileName } from '@repo/core/apiLocales'
import {
  resolveApiReleaseSetSnapshotsForRequest,
  resolvePublishedSnapshotForResourceTypeRegionCohortKey,
  resolveSnapshotReplayPlan,
} from '@repo/core/db/metaRegistry'
import { resolveSnapshotVersionState } from '@repo/core/pipeline/db/snapshotReplay.ts'
import type { ResolvedSnapshotVersion } from '@repo/core/pipeline/db/snapshotReplay.ts'
import {
  hasCurrentDivisionGeometrySnapshot,
  listReplayedDivisionAreasByDivisionIds,
  listReplayedDivisionBoundariesByDivisionIds,
} from '../db/divisionGeometryReplay'
import {
  listReplayedDivisionRecords,
  hasCurrentDivisionSnapshot,
  listDivisionRecordsCurrent,
  countDivisionsCurrent,
  listDivisionRecordsCurrentByIds,
  listDivisionAreasCurrentByDivisionIds,
  listDivisionBoundariesCurrentByDivisionIds,
  type DivisionAreaRecord,
  type DivisionBoundaryRecord,
  type DivisionLocaleSelection,
  type DivisionRecord,
} from '../db/divisions'
import { runWithD1ReadRetry } from '../lib/d1'
import type { AppEnv } from '../types'
import {
  resolveApiReleaseSetAccessAttribution,
  resolveOptionalApiReleaseSetAccessAttribution,
  type AccessAttribution,
} from './accessAnalytics'
import {
  buildDetailDocument,
  storedDivisionHierarchyIdentifiers,
  buildDivisionRouteState,
  buildListDocument,
  buildSnapshotNotReadyDivisionResponse,
  buildVariantUnavailableResponse,
  createDivisionResource,
  createIncludedDivisionGeometryResource,
  matchesDivisionFilters,
  requestedAreaCohort,
  requestedGeometryKinds,
  requestedGeometryVariants,
  requestedIncludes,
  type ActiveDivisionSnapshot,
  type DivisionDetailQuery,
  type DivisionDetailResult,
  type DivisionFilters,
  type DivisionListQuery,
  type DivisionListResult,
  type DivisionRouteState,
  type IncludedResourcePayload,
} from './divisionsPresentation'

export {
  createIncludedDivisionGeometryResource,
  createIncludedDivisionResource,
  type DivisionDetailQuery,
  type DivisionDetailResult,
  type DivisionListQuery,
  type DivisionListResult,
} from './divisionsPresentation'

export type RequestedDivisionVersion = 'divisions/v0' | 'divisions/v0.1'
export type RequestedDivisionApiVersion = '0.1'
export type ResolvedDivisionApiVersion = 'api-divisions-v0.1'
export type DivisionProfile = ApiProfileName

export type DivisionServiceDependencies = {
  hasSupersedingPublication: typeof hasSupersedingPublication
  getPublicationReadiness: typeof getPublicationReadiness
  hasCurrentDivisionSnapshot: typeof hasCurrentDivisionSnapshot
  listDivisionRecordsCurrent: typeof listDivisionRecordsCurrent
  countDivisionsCurrent: typeof countDivisionsCurrent
  listDivisionRecordsCurrentByIds: typeof listDivisionRecordsCurrentByIds
  resolveApiReleaseSetSnapshotsForRequest: typeof resolveApiReleaseSetSnapshotsForRequest
  resolvePublishedSnapshotForResourceTypeRegionCohortKey: typeof resolvePublishedSnapshotForResourceTypeRegionCohortKey
  resolveSnapshotReplayPlan: typeof resolveSnapshotReplayPlan
  resolveSnapshotVersionState: typeof resolveSnapshotVersionState
  listReplayedDivisionRecords: typeof listReplayedDivisionRecords
  listDivisionAreasCurrentByDivisionIds: typeof listDivisionAreasCurrentByDivisionIds
  listDivisionBoundariesCurrentByDivisionIds: typeof listDivisionBoundariesCurrentByDivisionIds
  hasCurrentDivisionGeometrySnapshot: typeof hasCurrentDivisionGeometrySnapshot
  listReplayedDivisionAreasByDivisionIds: typeof listReplayedDivisionAreasByDivisionIds
  listReplayedDivisionBoundariesByDivisionIds: typeof listReplayedDivisionBoundariesByDivisionIds
}

const defaultDivisionServiceDependencies: DivisionServiceDependencies = {
  getPublicationReadiness,
  hasSupersedingPublication,
  hasCurrentDivisionSnapshot,
  listDivisionRecordsCurrent,
  countDivisionsCurrent,
  listDivisionRecordsCurrentByIds,
  resolveApiReleaseSetSnapshotsForRequest,
  resolvePublishedSnapshotForResourceTypeRegionCohortKey,
  resolveSnapshotReplayPlan,
  resolveSnapshotVersionState,
  listReplayedDivisionRecords,
  listDivisionAreasCurrentByDivisionIds,
  listDivisionBoundariesCurrentByDivisionIds,
  hasCurrentDivisionGeometrySnapshot,
  listReplayedDivisionAreasByDivisionIds,
  listReplayedDivisionBoundariesByDivisionIds,
}

async function getActiveDivisionSnapshot(
  metaDb: AppEnv['Variables']['metaDb'],
  domainCode: string,
  variants: { area?: string; boundary?: string },
  selectors: Pick<
    DivisionListQuery,
    'region' | 'catalogRevision' | 'cohort' | 'effectiveAt' | 'knownAt' | 'releaseSet'
  >,
  resolveReleaseSet: DivisionServiceDependencies['resolveApiReleaseSetSnapshotsForRequest'] = resolveApiReleaseSetSnapshotsForRequest,
): Promise<ActiveDivisionSnapshot | null> {
  const selection = await runWithD1ReadRetry(() =>
    resolveReleaseSet(metaDb as never, 'division', {
      catalogRevision: selectors.catalogRevision,
      cohortKey: selectors.cohort,
      domainCode,
      effectiveAt: selectors.effectiveAt,
      knownAt: selectors.knownAt,
      regionCode: resolveDataRegion(selectors.region),
      releaseSet: selectors.releaseSet,
    }),
  )

  if (!selection) {
    return null
  }

  const primarySnapshot = selection.snapshots.find(
    snapshot =>
      snapshot.snapshotResourceType === 'division' && snapshot.role === 'primary',
  )
  if (!primarySnapshot) return null
  const divisionSnapshotIds = [
    primarySnapshot.snapshotId,
    ...selection.snapshots
      .filter(
        snapshot =>
          snapshot.snapshotResourceType === 'division' &&
          snapshot.role === 'enrichment',
      )
      .map(snapshot => snapshot.snapshotId),
  ]
  const areaSnapshot = selection.snapshots.find(
    snapshot =>
      snapshot.snapshotResourceType === 'divisionArea' &&
      (!variants.area || snapshot.variant === variants.area),
  )
  const boundarySnapshot = selection.snapshots.find(
    snapshot =>
      snapshot.snapshotResourceType === 'divisionBoundary' &&
      (!variants.boundary || snapshot.variant === variants.boundary),
  )

  return {
    snapshotId: primarySnapshot.snapshotId,
    divisionSnapshotIds: [...new Set(divisionSnapshotIds)],
    apiReleaseSet: selection.releaseSet.code,
    apiCatalogRevision: selection.releaseSet.apiCatalogRevision,
    catalogPublishedAt: selection.releaseSet.catalogPublishedAt,
    cohortKey: selection.releaseSet.cohortKey,
    domainCode: selection.releaseSet.domainCode,
    effectiveFrom: selection.releaseSet.effectiveFrom,
    schemaVersion: selection.releaseSet.schemaVersion,
    rulesetVersion: selection.releaseSet.rulesetVersion,
    areaSnapshotId: areaSnapshot?.snapshotId ?? null,
    boundarySnapshotId: boundarySnapshot?.snapshotId ?? null,
  }
}

async function resolveRequestedAreaSnapshot(args: {
  region?: ApiRegion
  metaDb: AppEnv['Variables']['metaDb']
  cohortKey: string | undefined
  variant: string | undefined
  resolvePublishedSnapshotForResourceTypeRegionCohortKey: DivisionServiceDependencies['resolvePublishedSnapshotForResourceTypeRegionCohortKey']
}) {
  const { cohortKey, variant } = args
  if (!cohortKey || !variant) return null
  return runWithD1ReadRetry(() =>
    args.resolvePublishedSnapshotForResourceTypeRegionCohortKey(
      args.metaDb as never,
      'divisionArea',
      resolveDataRegion(args.region),
      cohortKey,
      { variant },
    ),
  )
}

async function replayDivisionSnapshot(args: {
  snapshotId: string
  historyDbsByBinding: AppEnv['Variables']['historyDbsByBinding']
  metaDb: AppEnv['Variables']['metaDb']
  localeSelection: DivisionLocaleSelection
  resolveSnapshotReplayPlan: DivisionServiceDependencies['resolveSnapshotReplayPlan']
  resolveSnapshotVersionState: DivisionServiceDependencies['resolveSnapshotVersionState']
  listReplayedDivisionRecords: DivisionServiceDependencies['listReplayedDivisionRecords']
}) {
  const plan = await runWithD1ReadRetry(() =>
    args.resolveSnapshotReplayPlan(args.metaDb as never, args.snapshotId),
  )
  const shards = new Map(
    Object.entries(args.historyDbsByBinding).map(([bindingName, db]) => [
      bindingName,
      { bindingName, db: db as never },
    ]),
  )
  const versions = await runWithD1ReadRetry(() =>
    args.resolveSnapshotVersionState(plan, shards, ['division', 'divisionI18n']),
  )
  return args.listReplayedDivisionRecords(
    versions.values() as never,
    args.snapshotId,
    args.localeSelection,
  )
}

async function loadDivisionGeometry(args: {
  currentDb: AppEnv['Variables']['currentDb']
  metaDb: AppEnv['Variables']['metaDb']
  historyDbsByBinding: AppEnv['Variables']['historyDbsByBinding']
  snapshot: ActiveDivisionSnapshot
  areaSnapshotId?: string | null
  divisionIds: string[]
  variants?: { area?: string; boundary?: string }
  includeArea?: boolean
  includeBoundary?: boolean
  allowHistory: boolean
  dependencies: DivisionServiceDependencies
}) {
  const dependencies = args.dependencies
  async function readSnapshot<T>(
    snapshotId: string,
    kind: 'divisionArea' | 'divisionBoundary',
    readCurrent: () => Promise<T[]>,
    readHistory: (versions: Iterable<ResolvedSnapshotVersion>) => Promise<T[]>,
  ) {
    const token = await dependencies.getPublicationReadiness(args.currentDb, kind, [
      snapshotId,
    ])
    if (token !== null) {
      const rows = await guardPublicationRead(
        args.currentDb,
        kind,
        [snapshotId],
        token,
        readCurrent,
        dependencies.getPublicationReadiness,
      )
      if (rows === null)
        throw new PublicationReadUnavailableError(
          'Geometry publication changed during the read',
        )
      return rows
    }
    if (
      !args.allowHistory &&
      !(kind === 'divisionArea' && args.areaSnapshotId) &&
      !(await dependencies.hasSupersedingPublication(
        args.metaDb,
        args.currentDb,
        kind,
        snapshotId,
      ))
    )
      throw new PublicationReadUnavailableError('Geometry publication is not ready')
    const plan = await dependencies.resolveSnapshotReplayPlan(
      args.metaDb as never,
      snapshotId,
    )
    const shards = new Map(
      Object.entries(args.historyDbsByBinding).map(([bindingName, db]) => [
        bindingName,
        { bindingName, db: db as never },
      ]),
    )
    const versions = await dependencies.resolveSnapshotVersionState(plan, shards, [
      kind,
    ])
    return readHistory(versions.values())
  }
  const areaSnapshotId = args.areaSnapshotId ?? args.snapshot.areaSnapshotId
  const boundarySnapshotId = args.snapshot.boundarySnapshotId
  const areaLookup = { divisionIds: args.divisionIds, variant: args.variants?.area }
  const boundaryLookup = {
    divisionIds: args.divisionIds,
    variant: args.variants?.boundary,
  }
  const [areas, boundaries] = await Promise.all([
    args.includeArea && areaSnapshotId
      ? readSnapshot(
          areaSnapshotId,
          'divisionArea',
          () =>
            dependencies.listDivisionAreasCurrentByDivisionIds(args.currentDb, {
              snapshotId: areaSnapshotId,
              ...areaLookup,
            }),
          versions =>
            dependencies.listReplayedDivisionAreasByDivisionIds(versions, areaLookup),
        )
      : [],
    args.includeBoundary && boundarySnapshotId
      ? readSnapshot(
          boundarySnapshotId,
          'divisionBoundary',
          () =>
            dependencies.listDivisionBoundariesCurrentByDivisionIds(args.currentDb, {
              snapshotId: boundarySnapshotId,
              ...boundaryLookup,
            }),
          versions =>
            dependencies.listReplayedDivisionBoundariesByDivisionIds(
              versions,
              boundaryLookup,
            ),
        )
      : [],
  ])
  const areasByDivision = new Map<string, DivisionAreaRecord[]>()
  const boundariesByDivision = new Map<string, DivisionBoundaryRecord[]>()
  for (const area of areas)
    areasByDivision.set(area.divisionId, [
      ...(areasByDivision.get(area.divisionId) ?? []),
      area,
    ])
  for (const boundary of boundaries) {
    for (const id of [boundary.leftDivisionId, boundary.rightDivisionId]) {
      boundariesByDivision.set(id, [...(boundariesByDivision.get(id) ?? []), boundary])
    }
  }
  return { areas, boundaries, areasByDivision, boundariesByDivision }
}

async function loadIncludedHierarchyRecords(args: {
  includeHierarchy: boolean
  snapshotId: string
  snapshotIds?: string[]
  records: DivisionRecord[]
  replayedRecordsById: ReadonlyMap<string, DivisionRecord>
  routeState: DivisionRouteState
}) {
  if (!args.includeHierarchy) {
    return []
  }

  const primaryIds = new Set(args.records.map(record => record.division.id))
  const hierarchyIds = [
    ...new Set(
      args.records.flatMap(record =>
        storedDivisionHierarchyIdentifiers(
          record.division.id,
          record.division.hierarchies,
        ).map(hierarchy => hierarchy.id),
      ),
    ),
  ].filter(id => !primaryIds.has(id))

  return hierarchyIds.flatMap(id => {
    const record = args.replayedRecordsById.get(id)
    return record ? [record] : []
  })
}

async function isHistoricalDivisionSelection(args: {
  metaDb: AppEnv['Variables']['metaDb']
  query: DivisionListQuery | DivisionDetailQuery
  snapshot: ActiveDivisionSnapshot
  dependencies: DivisionServiceDependencies
}) {
  if (!hasHistoricalSelectors(args.query)) return false
  const latest = await getActiveDivisionSnapshot(
    args.metaDb,
    args.query.domain ?? 'geographic',
    {},
    { region: args.query.region },
    args.dependencies.resolveApiReleaseSetSnapshotsForRequest,
  )
  return Boolean(latest && latest.apiReleaseSet !== args.snapshot.apiReleaseSet)
}

export async function listDivisions(args: {
  currentDb: AppEnv['Variables']['currentDb']
  historyDbsByBinding: AppEnv['Variables']['historyDbsByBinding']
  metaDb: AppEnv['Variables']['metaDb']
  requestUrl: string
  requestedVersionPath: RequestedDivisionVersion
  requestedApiVersion: RequestedDivisionApiVersion
  resolvedApiVersion: ResolvedDivisionApiVersion
  query: DivisionListQuery
  onResolved?: (attribution: AccessAttribution) => void
  dependencies?: Partial<DivisionServiceDependencies>
}): Promise<DivisionListResult> {
  const dependencies = {
    ...defaultDivisionServiceDependencies,
    ...args.dependencies,
  }
  const routeState = buildDivisionRouteState({
    requestedVersionPath: args.requestedVersionPath,
    requestedApiVersion: args.requestedApiVersion,
    resolvedApiVersion: args.resolvedApiVersion,
    profile: args.query.profile,
    locales: args.query.locales,
  })
  const limit = args.query['page[limit]'] ?? 25
  const offset = args.query['page[offset]'] ?? 0
  const domainCode = args.query.domain ?? 'geographic'
  const geometryVariants = requestedGeometryVariants(
    args.query.include,
    domainCode,
    args.query.transform,
  )
  const areaCohort = requestedAreaCohort(args.query.include)
  const requestedGeometry = requestedGeometryKinds(args.query.include)
  const activeDivisionSnapshot = await getActiveDivisionSnapshot(
    args.metaDb,
    domainCode,
    { ...geometryVariants, area: areaCohort ? undefined : geometryVariants.area },
    args.query,
    dependencies.resolveApiReleaseSetSnapshotsForRequest,
  )

  if (!activeDivisionSnapshot) {
    return {
      status: 503,
      body: buildSnapshotNotReadyDivisionResponse(),
    }
  }
  const scopedAreaSnapshot = await resolveRequestedAreaSnapshot({
    region: args.query.region,
    metaDb: args.metaDb,
    cohortKey: areaCohort,
    variant: geometryVariants.area,
    resolvePublishedSnapshotForResourceTypeRegionCohortKey:
      dependencies.resolvePublishedSnapshotForResourceTypeRegionCohortKey,
  })
  const publicationToken = await dependencies.getPublicationReadiness(
    args.currentDb,
    'division',
    activeDivisionSnapshot.divisionSnapshotIds,
  )
  const useCurrent = publicationToken !== null
  const allowHistory = await isHistoricalDivisionSelection({
    ...args,
    snapshot: activeDivisionSnapshot,
    dependencies,
  })
  if (!useCurrent && !allowHistory)
    return {
      status: 503,
      publicationPending: true,
      body: buildSnapshotNotReadyDivisionResponse(),
    }
  return (
    (await guardPublicationRead(
      args.currentDb,
      'division',
      activeDivisionSnapshot.divisionSnapshotIds,
      publicationToken,
      async (): Promise<DivisionListResult> => {
        const replayedRecords = useCurrent
          ? []
          : await replayDivisionSnapshot({
              snapshotId: activeDivisionSnapshot.snapshotId,
              historyDbsByBinding: args.historyDbsByBinding,
              metaDb: args.metaDb,
              localeSelection: routeState.localeSelection,
              resolveSnapshotReplayPlan: dependencies.resolveSnapshotReplayPlan,
              resolveSnapshotVersionState: dependencies.resolveSnapshotVersionState,
              listReplayedDivisionRecords: dependencies.listReplayedDivisionRecords,
            })
        if (args.onResolved) {
          const accessAttribution = await resolveOptionalApiReleaseSetAccessAttribution(
            () =>
              resolveApiReleaseSetAccessAttribution(
                args.metaDb.$client,
                activeDivisionSnapshot.apiReleaseSet,
              ),
          )
          if (accessAttribution) args.onResolved(accessAttribution)
        }
        if (requestedGeometry.area && areaCohort && !scopedAreaSnapshot) {
          return {
            status: 409,
            body: buildVariantUnavailableResponse({
              kind: 'areas',
              variant: geometryVariants.area ?? domainCode,
              cohortKey: areaCohort,
            }),
          }
        }
        if (
          requestedGeometry.area &&
          !areaCohort &&
          !activeDivisionSnapshot.areaSnapshotId
        ) {
          return {
            status: 409,
            body: buildVariantUnavailableResponse({
              kind: 'areas',
              variant: geometryVariants.area ?? domainCode,
            }),
          }
        }
        if (requestedGeometry.boundary && !activeDivisionSnapshot.boundarySnapshotId) {
          return {
            status: 409,
            body: buildVariantUnavailableResponse({
              kind: 'boundaries',
              variant: geometryVariants.boundary ?? domainCode,
            }),
          }
        }

        const filters = {
          level: args.query['filter[level]'],
          divisionClass: args.query['filter[class]'],
          category: args.query['filter[category]'],
          parent: args.query['filter[parent]'],
        } satisfies DivisionFilters
        const matchingRecords = replayedRecords
          .filter(record => matchesDivisionFilters(record, filters))
          .sort(
            (left, right) =>
              (left.division.level ?? -1) - (right.division.level ?? -1) ||
              left.division.class.localeCompare(right.division.class) ||
              left.division.id.localeCompare(right.division.id),
          )
        const lookup = {
          snapshotId: activeDivisionSnapshot.snapshotId,
          limit,
          offset,
          level: filters.level,
          class: filters.divisionClass,
          category: filters.category,
          parentId: filters.parent,
          localeSelection: routeState.localeSelection,
        }
        const [records, total] = useCurrent
          ? await runWithD1ReadRetry(() =>
              Promise.all([
                dependencies.listDivisionRecordsCurrent(args.currentDb, lookup),
                dependencies.countDivisionsCurrent(args.currentDb, lookup),
              ]),
            )
          : [matchingRecords.slice(offset, offset + limit), matchingRecords.length]
        if (useCurrent && requestedIncludes(args.query.include).has('hierarchy')) {
          const divisionIds = [
            ...new Set(
              records.flatMap(record =>
                storedDivisionHierarchyIdentifiers(
                  record.division.id,
                  record.division.hierarchies,
                ).map(parent => parent.id),
              ),
            ),
          ]
          replayedRecords.push(
            ...(await runWithD1ReadRetry(() =>
              dependencies.listDivisionRecordsCurrentByIds(args.currentDb, {
                snapshotId: activeDivisionSnapshot.snapshotId,
                snapshotIds: activeDivisionSnapshot.divisionSnapshotIds,
                divisionIds,
                localeSelection: routeState.localeSelection,
              }),
            )),
          )
        }
        const replayedRecordsById = new Map(
          replayedRecords.map(record => [record.division.id, record]),
        )

        const includedRecords = await runWithD1ReadRetry(() =>
          loadIncludedHierarchyRecords({
            includeHierarchy: requestedIncludes(args.query.include).has('hierarchy'),
            snapshotId: activeDivisionSnapshot.snapshotId,
            snapshotIds: activeDivisionSnapshot.divisionSnapshotIds,
            records,
            replayedRecordsById,
            routeState,
          }),
        )
        const geometry = await runWithD1ReadRetry(() =>
          loadDivisionGeometry({
            currentDb: args.currentDb,
            metaDb: args.metaDb,
            historyDbsByBinding: args.historyDbsByBinding,
            snapshot: activeDivisionSnapshot,
            areaSnapshotId: scopedAreaSnapshot?.id,
            divisionIds: records.map(record => record.division.id),
            variants: geometryVariants,
            includeArea: requestedGeometry.area,
            includeBoundary: requestedGeometry.boundary,
            allowHistory,
            dependencies,
          }),
        )
        const includes = requestedIncludes(args.query.include)
        const includeAreas =
          includes.has('areas') || [...includes].some(item => item.startsWith('areas:'))
        const includeBoundaries =
          includes.has('boundaries') ||
          [...includes].some(item => item.startsWith('boundaries:'))
        const includedGeometry: IncludedResourcePayload[] = [
          ...(includeAreas
            ? geometry.areas.map(record =>
                createIncludedDivisionGeometryResource({ record, kind: 'area' }),
              )
            : []),
          ...(includeBoundaries
            ? geometry.boundaries.map(record =>
                createIncludedDivisionGeometryResource({ record, kind: 'boundary' }),
              )
            : []),
        ]

        return {
          status: 200,
          body: buildListDocument({
            url: new URL(args.requestUrl),
            routeState,
            activeSnapshot: activeDivisionSnapshot,
            records,
            includedRecords: [
              ...includedRecords.map(record =>
                createDivisionResource({
                  baseUrl: new URL(args.requestUrl).origin,
                  routeState,
                  record,
                }),
              ),
              ...includedGeometry,
            ],
            areasByDivision: geometry.areasByDivision,
            boundariesByDivision: geometry.boundariesByDivision,
            limit,
            offset,
            total,
            filters,
          }),
        }
      },
      dependencies.getPublicationReadiness,
    )) ?? {
      status: 503,
      publicationPending: true,
      body: buildSnapshotNotReadyDivisionResponse(),
    }
  )
}

export async function getDivisionDetail(args: {
  currentDb: AppEnv['Variables']['currentDb']
  historyDbsByBinding: AppEnv['Variables']['historyDbsByBinding']
  metaDb: AppEnv['Variables']['metaDb']
  requestUrl: string
  requestedVersionPath: RequestedDivisionVersion
  requestedApiVersion: RequestedDivisionApiVersion
  resolvedApiVersion: ResolvedDivisionApiVersion
  id: string
  query: DivisionDetailQuery
  onResolved?: (attribution: AccessAttribution) => void
  dependencies?: Partial<DivisionServiceDependencies>
}): Promise<DivisionDetailResult> {
  const dependencies = {
    ...defaultDivisionServiceDependencies,
    ...args.dependencies,
  }
  const routeState = buildDivisionRouteState({
    requestedVersionPath: args.requestedVersionPath,
    requestedApiVersion: args.requestedApiVersion,
    resolvedApiVersion: args.resolvedApiVersion,
    profile: args.query.profile,
    locales: args.query.locales,
  })
  const domainCode = args.query.domain ?? 'geographic'
  const geometryVariants = requestedGeometryVariants(
    args.query.include,
    domainCode,
    args.query.transform,
  )
  const areaCohort = requestedAreaCohort(args.query.include)
  const requestedGeometry = requestedGeometryKinds(args.query.include)
  const activeDivisionSnapshot = await getActiveDivisionSnapshot(
    args.metaDb,
    domainCode,
    { ...geometryVariants, area: areaCohort ? undefined : geometryVariants.area },
    args.query,
    dependencies.resolveApiReleaseSetSnapshotsForRequest,
  )

  if (!activeDivisionSnapshot) {
    return {
      status: 503,
      body: buildSnapshotNotReadyDivisionResponse(),
    }
  }
  const scopedAreaSnapshot = await resolveRequestedAreaSnapshot({
    region: args.query.region,
    metaDb: args.metaDb,
    cohortKey: areaCohort,
    variant: geometryVariants.area,
    resolvePublishedSnapshotForResourceTypeRegionCohortKey:
      dependencies.resolvePublishedSnapshotForResourceTypeRegionCohortKey,
  })
  const publicationToken = await dependencies.getPublicationReadiness(
    args.currentDb,
    'division',
    activeDivisionSnapshot.divisionSnapshotIds,
  )
  const useCurrent = publicationToken !== null
  const allowHistory = await isHistoricalDivisionSelection({
    ...args,
    snapshot: activeDivisionSnapshot,
    dependencies,
  })
  if (!useCurrent && !allowHistory)
    return {
      status: 503,
      publicationPending: true,
      body: buildSnapshotNotReadyDivisionResponse(),
    }
  return (
    (await guardPublicationRead(
      args.currentDb,
      'division',
      activeDivisionSnapshot.divisionSnapshotIds,
      publicationToken,
      async (): Promise<DivisionDetailResult> => {
        const replayedRecords = useCurrent
          ? await runWithD1ReadRetry(() =>
              dependencies.listDivisionRecordsCurrentByIds(args.currentDb, {
                snapshotId: activeDivisionSnapshot.snapshotId,
                divisionIds: [args.id],
                localeSelection: routeState.localeSelection,
              }),
            )
          : await replayDivisionSnapshot({
              snapshotId: activeDivisionSnapshot.snapshotId,
              historyDbsByBinding: args.historyDbsByBinding,
              metaDb: args.metaDb,
              localeSelection: routeState.localeSelection,
              resolveSnapshotReplayPlan: dependencies.resolveSnapshotReplayPlan,
              resolveSnapshotVersionState: dependencies.resolveSnapshotVersionState,
              listReplayedDivisionRecords: dependencies.listReplayedDivisionRecords,
            })
        if (args.onResolved) {
          const accessAttribution = await resolveOptionalApiReleaseSetAccessAttribution(
            () =>
              resolveApiReleaseSetAccessAttribution(
                args.metaDb.$client,
                activeDivisionSnapshot.apiReleaseSet,
              ),
          )
          if (accessAttribution) args.onResolved(accessAttribution)
        }
        if (requestedGeometry.area && areaCohort && !scopedAreaSnapshot) {
          return {
            status: 409,
            body: buildVariantUnavailableResponse({
              kind: 'areas',
              variant: geometryVariants.area ?? domainCode,
              cohortKey: areaCohort,
            }),
          }
        }
        if (
          requestedGeometry.area &&
          !areaCohort &&
          !activeDivisionSnapshot.areaSnapshotId
        ) {
          return {
            status: 409,
            body: buildVariantUnavailableResponse({
              kind: 'areas',
              variant: geometryVariants.area ?? domainCode,
            }),
          }
        }
        if (requestedGeometry.boundary && !activeDivisionSnapshot.boundarySnapshotId) {
          return {
            status: 409,
            body: buildVariantUnavailableResponse({
              kind: 'boundaries',
              variant: geometryVariants.boundary ?? domainCode,
            }),
          }
        }

        const record =
          replayedRecords.find(candidate => candidate.division.id === args.id) ?? null

        if (!record) {
          return {
            status: 404,
            body: {
              httpStatus: 404,
              error: 'not_found',
              message: `No division found for ${args.id}.`,
            },
          }
        }

        if (useCurrent && requestedIncludes(args.query.include).has('hierarchy')) {
          replayedRecords.push(
            ...(await runWithD1ReadRetry(() =>
              dependencies.listDivisionRecordsCurrentByIds(args.currentDb, {
                snapshotId: activeDivisionSnapshot.snapshotId,
                snapshotIds: activeDivisionSnapshot.divisionSnapshotIds,
                divisionIds: storedDivisionHierarchyIdentifiers(
                  record.division.id,
                  record.division.hierarchies,
                ).map(parent => parent.id),
                localeSelection: routeState.localeSelection,
              }),
            )),
          )
        }
        const includedRecords = await runWithD1ReadRetry(() =>
          loadIncludedHierarchyRecords({
            includeHierarchy: requestedIncludes(args.query.include).has('hierarchy'),
            snapshotId: activeDivisionSnapshot.snapshotId,
            snapshotIds: activeDivisionSnapshot.divisionSnapshotIds,
            records: [record],
            replayedRecordsById: new Map(
              replayedRecords.map(candidate => [candidate.division.id, candidate]),
            ),
            routeState,
          }),
        )
        const geometry = await runWithD1ReadRetry(() =>
          loadDivisionGeometry({
            currentDb: args.currentDb,
            metaDb: args.metaDb,
            historyDbsByBinding: args.historyDbsByBinding,
            snapshot: activeDivisionSnapshot,
            areaSnapshotId: scopedAreaSnapshot?.id,
            divisionIds: [record.division.id],
            variants: geometryVariants,
            includeArea: requestedGeometry.area,
            includeBoundary: requestedGeometry.boundary,
            allowHistory,
            dependencies,
          }),
        )
        const includes = requestedIncludes(args.query.include)
        const includeAreas =
          includes.has('areas') || [...includes].some(item => item.startsWith('areas:'))
        const includeBoundaries =
          includes.has('boundaries') ||
          [...includes].some(item => item.startsWith('boundaries:'))
        const includedGeometry: IncludedResourcePayload[] = [
          ...(includeAreas
            ? geometry.areas.map(item =>
                createIncludedDivisionGeometryResource({ record: item, kind: 'area' }),
              )
            : []),
          ...(includeBoundaries
            ? geometry.boundaries.map(item =>
                createIncludedDivisionGeometryResource({
                  record: item,
                  kind: 'boundary',
                }),
              )
            : []),
        ]

        return {
          status: 200,
          body: buildDetailDocument({
            url: new URL(args.requestUrl),
            routeState,
            activeSnapshot: activeDivisionSnapshot,
            record,
            includedRecords: [
              ...includedRecords.map(item =>
                createDivisionResource({
                  baseUrl: new URL(args.requestUrl).origin,
                  routeState,
                  record: item,
                }),
              ),
              ...includedGeometry,
            ],
            areasByDivision: geometry.areasByDivision,
            boundariesByDivision: geometry.boundariesByDivision,
          }),
        }
      },
      dependencies.getPublicationReadiness,
    )) ?? {
      status: 503,
      publicationPending: true,
      body: buildSnapshotNotReadyDivisionResponse(),
    }
  )
}
