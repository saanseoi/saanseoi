import { and, eq, metaSchema } from '@repo/db'
import { inArray } from 'drizzle-orm'
import { resolveShardForTypeRegionYear } from '@repo/core/db/metaRegistry'
import { chunkArray, getMaxItemsPerInClause } from '@repo/core/pipeline/utils.ts'
import type { DataShardRecord } from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb } from '@repo/core/db/types'
import type { DatasetType } from '@repo/db'
import type { CountTarget } from './reportingTypes.ts'

export const {
  ingestRuns,
  metaDataShards,
  metaDatasets,
  metaPublishers,
  metaReleaseShardAssignments,
  metaReleases,
  releaseProcessingActions,
  stats,
} = metaSchema

export type ReportBindings = Record<string, unknown>

const RELEASE_ASSIGNMENT_BATCH_SIZE = getMaxItemsPerInClause(1, 3)

export type ReportRowCount = {
  kind: 'history' | 'source'
  label: string
  rowCount: number
  tableName: string
}

export type ReportFilters = {
  datasetCode?: string
  limit?: number
  releaseCode?: string
  releaseId?: string
  source?: string
  resourceType?: DatasetType
}

export type ReleaseContext = {
  regionCode: string
  releaseId: string
  source: string
  sourceUrl: string | null
  sourceVersion: string
  cohortKey: string | null
  resourceType: string
}

export type CountSpec = {
  label: string
  tableName: string
} & (
  | {
      additionalJoinKeys?: never
      parentTableName?: never
      parentKey?: never
      relationshipKey?: never
      strategy: 'direct'
    }
  | {
      additionalJoinKeys?: Array<{
        parentKey: string
        relationshipKey: string
      }>
      parentKey: string
      parentTableName: string
      relationshipKey: string
      strategy: 'join'
    }
  | {
      additionalJoinKeys?: never
      parentTableName?: never
      parentKey?: never
      relationshipKey?: never
      strategy: 'source-validity'
    }
)

type ReleaseCountPlan = {
  history: CountTarget | null
  releaseId: string
  source: CountTarget | null
}

export function buildReportFilterWhereClause(options: ReportFilters) {
  const conditions = []

  if (options.datasetCode) {
    conditions.push(eq(metaDatasets.code, options.datasetCode))
  }

  if (options.releaseCode) {
    conditions.push(eq(metaReleases.code, options.releaseCode))
  }

  if (options.releaseId) {
    conditions.push(eq(metaReleases.id, options.releaseId))
  }

  if (options.source) {
    conditions.push(eq(metaPublishers.code, options.source))
  }

  if (options.resourceType) {
    conditions.push(eq(metaReleases.resourceType, options.resourceType))
  }

  if (conditions.length === 0) {
    return undefined
  }

  return conditions.length === 1 ? conditions[0] : and(...conditions)
}

export async function buildReleaseCountPlans(
  db: HarbourReadableDb,
  bindings: ReportBindings,
  environment: 'preview' | 'production',
  releases: ReleaseContext[],
) {
  const [historyPlans, sourcePlans] = await Promise.all([
    buildHistoryCountTargets(db, bindings, environment, releases),
    buildSourceCountTargets(db, bindings, environment, releases),
  ])

  return releases.map(release => ({
    history: historyPlans.get(release.releaseId) ?? null,
    releaseId: release.releaseId,
    source: sourcePlans.get(release.releaseId) ?? null,
  }))
}

async function buildHistoryCountTargets(
  db: HarbourReadableDb,
  bindings: ReportBindings,
  environment: 'preview' | 'production',
  releases: ReleaseContext[],
) {
  const releaseIds = releases.map(release => release.releaseId)
  const assignedHistoryBindings = releaseIds.length
    ? ((
        await Promise.all(
          chunkArray(releaseIds, RELEASE_ASSIGNMENT_BATCH_SIZE).map(ids =>
            db
              .select({
                bindingName: metaDataShards.bindingName,
                releaseId: metaReleaseShardAssignments.releaseId,
              })
              .from(metaReleaseShardAssignments)
              .innerJoin(
                metaDataShards,
                eq(metaReleaseShardAssignments.dataShardId, metaDataShards.id),
              )
              .where(
                and(
                  inArray(metaReleaseShardAssignments.releaseId, ids),
                  eq(metaDataShards.shardType, 'history'),
                  eq(metaDataShards.environment, environment),
                  eq(metaDataShards.status, 'active'),
                ),
              )
              .all(),
          ),
        )
      ).flat() as Array<{ bindingName: string; releaseId: string }>)
    : []
  const assignedHistoryBindingsByReleaseId = groupShardBindings(assignedHistoryBindings)
  const fallbackShards = await resolveFallbackShardsByRelease(
    db,
    'history',
    environment,
    releases.filter(release => {
      return !assignedHistoryBindingsByReleaseId.has(release.releaseId)
    }),
  )

  return new Map(
    releases.map((release): [string, CountTarget] => {
      const assignedBindingNames = assignedHistoryBindingsByReleaseId.get(
        release.releaseId,
      )
      const fallbackBindingName = fallbackShards.get(release.releaseId)?.bindingName
      const bindingNames =
        assignedBindingNames ?? (fallbackBindingName ? [fallbackBindingName] : [])

      return [
        release.releaseId,
        {
          bindings: resolveD1Bindings(bindings, bindingNames),
          kind: 'history',
          releaseId: release.releaseId,
          sourceVersion: release.sourceVersion,
          specs: resolveHistoryCountSpecs(release.resourceType),
        } satisfies CountTarget,
      ]
    }),
  )
}

async function buildSourceCountTargets(
  db: HarbourReadableDb,
  bindings: ReportBindings,
  environment: 'preview' | 'production',
  releases: ReleaseContext[],
) {
  const releaseIds = releases.map(release => release.releaseId)
  const assignedSourceBindings = releaseIds.length
    ? ((
        await Promise.all(
          chunkArray(releaseIds, RELEASE_ASSIGNMENT_BATCH_SIZE).map(ids =>
            db
              .select({
                bindingName: metaDataShards.bindingName,
                releaseId: metaReleaseShardAssignments.releaseId,
              })
              .from(metaReleaseShardAssignments)
              .innerJoin(
                metaDataShards,
                eq(metaReleaseShardAssignments.dataShardId, metaDataShards.id),
              )
              .where(
                and(
                  inArray(metaReleaseShardAssignments.releaseId, ids),
                  eq(metaDataShards.shardType, 'source'),
                  eq(metaDataShards.environment, environment),
                  eq(metaDataShards.status, 'active'),
                ),
              )
              .all(),
          ),
        )
      ).flat() as Array<{ bindingName: string; releaseId: string }>)
    : []
  const assignedSourceBindingsByReleaseId = groupShardBindings(assignedSourceBindings)
  const fallbackSourceShards = await resolveFallbackShardsByRelease(
    db,
    'source',
    environment,
    releases.filter(release => {
      return !assignedSourceBindingsByReleaseId.has(release.releaseId)
    }),
  )

  return new Map(
    releases.map((release): [string, CountTarget] => {
      const assignedBindingNames = assignedSourceBindingsByReleaseId.get(
        release.releaseId,
      )
      const fallbackBindingName = fallbackSourceShards.get(
        release.releaseId,
      )?.bindingName
      const bindingNames =
        assignedBindingNames ?? (fallbackBindingName ? [fallbackBindingName] : [])

      return [
        release.releaseId,
        {
          bindings: resolveD1Bindings(bindings, bindingNames),
          kind: 'source',
          releaseId: release.releaseId,
          sourceVersion: release.sourceVersion,
          specs: resolveSourceCountSpecs(release),
        } satisfies CountTarget,
      ]
    }),
  )
}

async function resolveFallbackShardsByRelease(
  db: HarbourReadableDb,
  kind: 'history' | 'source',
  environment: 'preview' | 'production',
  releases: ReleaseContext[],
): Promise<Map<string, DataShardRecord | null>> {
  const uniqueShardKeys = new Map<string, { regionCode: string; year: string }>()

  for (const release of releases) {
    const year = resolveReleaseYear(release)

    if (!year) {
      continue
    }

    const key = `${release.regionCode}:${year}`

    if (!uniqueShardKeys.has(key)) {
      uniqueShardKeys.set(key, {
        regionCode: release.regionCode,
        year,
      })
    }
  }

  const resolvedShards = await Promise.all(
    [...uniqueShardKeys.entries()].map(
      async ([key, value]): Promise<[string, DataShardRecord | null]> => [
        key,
        await resolveShardForTypeRegionYear(
          db,
          kind,
          environment,
          value.regionCode,
          value.year,
        ),
      ],
    ),
  )
  const shardsByKey = new Map<string, DataShardRecord | null>(resolvedShards)

  return new Map(
    releases.map((release): [string, DataShardRecord | null] => {
      const year = resolveReleaseYear(release)
      const shard = !year
        ? null
        : (shardsByKey.get(`${release.regionCode}:${year}`) ?? null)

      return [release.releaseId, shard]
    }),
  )
}

export async function collectCountRowsByRelease(plans: ReleaseCountPlan[]) {
  const countTargets = plans.flatMap(plan =>
    [plan.source, plan.history].filter(Boolean),
  )
  const queryGroups = new Map<D1Database, Map<string, CountQueryGroup>>()

  for (const target of countTargets) {
    if (!target || target.bindings.length === 0 || target.specs.length === 0) {
      continue
    }

    for (const binding of target.bindings) {
      let bindingGroups = queryGroups.get(binding)

      if (!bindingGroups) {
        bindingGroups = new Map()
        queryGroups.set(binding, bindingGroups)
      }

      for (const spec of target.specs) {
        const key = `${target.kind}:${buildCountSpecKey(spec)}`
        const existingGroup = bindingGroups.get(key)

        if (existingGroup) {
          existingGroup.releaseVersions.set(target.releaseId, target.sourceVersion)
          continue
        }

        bindingGroups.set(key, {
          kind: target.kind,
          releaseVersions: new Map([[target.releaseId, target.sourceVersion]]),
          spec,
        })
      }
    }
  }

  const countsByReleaseSpec = new Map<string, number>()

  for (const [binding, bindingGroups] of queryGroups) {
    for (const group of bindingGroups.values()) {
      const counts =
        group.spec.strategy === 'source-validity'
          ? await countSourceRowsBySourceVersions(
              binding,
              group.spec,
              [...group.releaseVersions].map(([releaseId, sourceVersion]) => ({
                releaseId,
                sourceVersion,
              })),
            )
          : await countReleaseRowsByReleaseIds(binding, group.kind, group.spec, [
              ...group.releaseVersions.keys(),
            ])

      for (const [releaseId, count] of counts) {
        const key = buildReleaseSpecKey(releaseId, group.kind, group.spec)
        countsByReleaseSpec.set(key, (countsByReleaseSpec.get(key) ?? 0) + count)
      }
    }
  }

  return countsByReleaseSpec
}

type CountQueryGroup = {
  kind: 'history' | 'source'
  releaseVersions: Map<string, string>
  spec: CountSpec
}

export function buildReportRowCounts(
  target: CountTarget | null,
  countsByReleaseSpec: Map<string, number>,
) {
  if (!target || target.bindings.length === 0 || target.specs.length === 0) {
    return []
  }

  return target.specs.map(spec => ({
    kind: target.kind,
    label: spec.label,
    rowCount:
      countsByReleaseSpec.get(
        buildReleaseSpecKey(target.releaseId, target.kind, spec),
      ) ?? 0,
    tableName: spec.tableName,
  }))
}

async function countReleaseRowsByReleaseIds(
  binding: D1Database,
  kind: 'history' | 'source',
  spec: CountSpec,
  releaseIds: string[],
) {
  if (releaseIds.length === 0) {
    return new Map<string, number>()
  }

  const placeholders = releaseIds.map((_, index) => `?${index + 1}`).join(', ')
  const releaseColumn = kind === 'history' ? 'sourceReleaseId' : 'releaseId'
  const joinConditions =
    spec.strategy === 'join'
      ? [
          `parent."${spec.parentKey}" = child."${spec.relationshipKey}"`,
          ...(spec.additionalJoinKeys ?? []).map(
            joinKey =>
              `parent."${joinKey.parentKey}" = child."${joinKey.relationshipKey}"`,
          ),
        ].join(' AND ')
      : ''
  if (spec.strategy === 'source-validity') {
    throw new Error('Source-validity counts require source versions.')
  }
  const query =
    spec.strategy === 'direct'
      ? `SELECT "${releaseColumn}" AS releaseId, COUNT(*) AS count
         FROM "${spec.tableName}"
         WHERE "${releaseColumn}" IN (${placeholders})
         GROUP BY "${releaseColumn}"`
      : `SELECT parent."${releaseColumn}" AS releaseId, COUNT(*) AS count
         FROM "${spec.tableName}" child
         INNER JOIN "${spec.parentTableName}" parent
           ON ${joinConditions}
         WHERE parent."${releaseColumn}" IN (${placeholders})
         GROUP BY parent."${releaseColumn}"`
  const result = await binding
    .prepare(query)
    .bind(...releaseIds)
    .all<{
      count: number | string
      releaseId: string
    }>()
  const rows = normaliseCountRows(result)

  return new Map(
    releaseIds.map(releaseId => {
      const row = rows.find(candidate => candidate.releaseId === releaseId)
      return [releaseId, Number(row?.count ?? 0)]
    }),
  )
}

async function countSourceRowsBySourceVersions(
  binding: D1Database,
  spec: Extract<CountSpec, { strategy: 'source-validity' }>,
  releases: Array<{ releaseId: string; sourceVersion: string }>,
) {
  const counts = await Promise.all(
    releases.map(async release => {
      const result = await binding
        .prepare(
          `SELECT COUNT(*) AS count
           FROM "${spec.tableName}"
           WHERE "validFromRelease" <= ?
             AND ("validToRelease" IS NULL OR "validToRelease" > ?)`,
        )
        .bind(release.sourceVersion, release.sourceVersion)
        .all<{ count: number | string }>()
      const rows = Array.isArray(result) ? result : (result.results ?? [])
      return [release.releaseId, Number(rows[0]?.count ?? 0)] as const
    }),
  )

  return new Map(counts)
}

function normaliseCountRows(
  result:
    | Array<{
        count: number | string
        releaseId: string
      }>
    | {
        results?: Array<{
          count: number | string
          releaseId: string
        }> | null
      },
) {
  return Array.isArray(result) ? result : (result.results ?? [])
}

function buildCountSpecKey(spec: CountSpec) {
  return spec.strategy === 'direct' || spec.strategy === 'source-validity'
    ? `${spec.label}:${spec.strategy}:${spec.tableName}`
    : [
        spec.label,
        spec.strategy,
        spec.tableName,
        spec.parentTableName,
        spec.parentKey,
        spec.relationshipKey,
        ...(spec.additionalJoinKeys ?? []).flatMap(joinKey => [
          joinKey.parentKey,
          joinKey.relationshipKey,
        ]),
      ].join(':')
}

function buildReleaseSpecKey(
  releaseId: string,
  kind: 'history' | 'source',
  spec: CountSpec,
) {
  return `${releaseId}:${kind}:${buildCountSpecKey(spec)}`
}

function resolveSourceCountSpecs(release: ReleaseContext): CountSpec[] {
  const sourceFamily = resolveSourceFamily(release)

  switch (sourceFamily) {
    case 'hkgov-dpo':
      return [
        {
          label: 'source',
          strategy: 'direct',
          tableName: 'hkgovAlsAddresses2d',
        },
      ]
    case 'overture':
      switch (release.resourceType) {
        case 'division':
          return [
            {
              label: 'source',
              strategy: 'direct',
              tableName: 'overtureDivisions',
            },
          ]
        case 'place':
          return [
            {
              label: 'source',
              strategy: 'source-validity',
              tableName: 'overturePlaces',
            },
          ]
        default:
          return []
      }
    default:
      return []
  }
}

function resolveHistoryCountSpecs(type: string): CountSpec[] {
  switch (type) {
    case 'address':
      return [
        {
          label: 'resourceType',
          strategy: 'direct',
          tableName: 'address2d',
        },
        {
          label: 'resourceTypeI18n',
          strategy: 'direct',
          tableName: 'address2dI18n',
        },
        {
          label: 'resourceDetail',
          strategy: 'direct',
          tableName: 'address3d',
        },
        {
          label: 'resourceDetailI18n',
          strategy: 'direct',
          tableName: 'address3dI18n',
        },
      ]
    case 'division':
      return [
        {
          label: 'resourceType',
          strategy: 'direct',
          tableName: 'divisions',
        },
        {
          label: 'resourceTypeI18n',
          strategy: 'direct',
          tableName: 'divisionsI18n',
        },
      ]
    case 'place':
      return [
        {
          label: 'resourceType',
          strategy: 'direct',
          tableName: 'places',
        },
        {
          label: 'resourceTypeI18n',
          strategy: 'direct',
          tableName: 'placesI18n',
        },
      ]
    case 'street':
      return [
        {
          label: 'resourceType',
          strategy: 'direct',
          tableName: 'streets',
        },
        {
          label: 'resourceTypeI18n',
          strategy: 'direct',
          tableName: 'streetsI18n',
        },
      ]
    default:
      return []
  }
}

function resolveSourceFamily(release: ReleaseContext) {
  const normalisedSource = release.source.trim().toLowerCase()
  const normalisedSourceUrl = release.sourceUrl?.trim().toLowerCase() ?? ''

  if (normalisedSource === 'overture') {
    return 'overture'
  }

  if (normalisedSource === 'hkgov' && normalisedSourceUrl.includes('dpo')) {
    return 'hkgov-dpo'
  }

  return normalisedSource
}

function resolveReleaseYear(release: ReleaseContext) {
  const sourceYear = release.sourceVersion.slice(0, 4)

  if (/^\d{4}$/.test(sourceYear)) {
    return sourceYear
  }

  const snapshotYear = release.cohortKey?.slice(0, 4)
  return snapshotYear && /^\d{4}$/.test(snapshotYear) ? snapshotYear : null
}

export function normaliseJsonField(value: unknown) {
  if (typeof value !== 'string') {
    return value ?? null
  }

  const trimmed = value.trim()

  if (!trimmed) {
    return value
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

function resolveD1Binding(bindings: ReportBindings, bindingName: string) {
  const binding = bindings[bindingName]

  return binding &&
    typeof binding === 'object' &&
    'prepare' in binding &&
    typeof binding.prepare === 'function'
    ? (binding as D1Database)
    : undefined
}

function resolveD1Bindings(bindings: ReportBindings, bindingNames: string[]) {
  return bindingNames.flatMap(bindingName => {
    const binding = resolveD1Binding(bindings, bindingName)
    return binding ? [binding] : []
  })
}

function groupShardBindings(rows: Array<{ bindingName: string; releaseId: string }>) {
  const bindingsByReleaseId = new Map<string, string[]>()
  for (const row of rows) {
    const bindingNames = bindingsByReleaseId.get(row.releaseId) ?? []
    if (!bindingNames.includes(row.bindingName)) bindingNames.push(row.bindingName)
    bindingsByReleaseId.set(row.releaseId, bindingNames)
  }
  return bindingsByReleaseId
}

export function toIsoString(value: Date | number | string | null | undefined) {
  if (value == null) {
    return null
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (typeof value === 'number') {
    return new Date(value).toISOString()
  }

  return value
}
