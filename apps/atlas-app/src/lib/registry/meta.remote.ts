import {
  getRegistryApi,
  listRegistryApiReleaseProcessingActions,
  listRegistryApiReleaseProcessingActionSections,
  listRegistrySourceReleaseProcessingActions,
  listRegistrySourceReleaseProcessingActionSections,
  getRegistrySourceRelease,
  getRegistrySourceReleaseShell,
  getRegistrySource,
  getRegistrySourcePublisher,
  listRegistryApiCompositions,
  listRegistrySourcePublishers,
  listRegistrySourcesPage,
  listRegistrySources,
} from '@repo/core/db/metaRegistry'
import { chunkArray, getMaxItemsPerInClause } from '@repo/core/pipeline/utils.ts'
import type { HarbourReadableDb } from '@repo/core/db/types'
import {
  and,
  desc,
  eq,
  inArray,
  metaAssets,
  metaReleases,
  metaSourceReleases,
  stats,
} from '@repo/db'
import { error, redirect } from '@sveltejs/kit'
import { query } from '$app/server'
import { z } from 'zod'

import { runWithD1ReadRetry } from '../server/d1'
import { readStatisticsSourceMeasures } from './statisticsSourceMeasures'
import {
  getRegistryAccessMetrics,
  getRegistryAccessMetricsBatch,
} from './accessMetrics.js'
import type {
  LocalisedRow,
  RegistryApi,
  RegistryPublisher,
  RegistrySource,
  SourceVersion,
} from './types'
import { getHistoryDb, getMetaDb, recordRegistryDataLoad } from './server'

const registryCodeSchema = z.string().trim().min(1).max(200)
const sourceReleaseShellSchema = z.object({
  datasetCode: registryCodeSchema,
  releaseCode: registryCodeSchema,
})
const sourceReleaseContentSchema = sourceReleaseShellSchema.extend({
  previousReleaseCode: registryCodeSchema.nullable().optional(),
  tab: z.enum(['notes', 'schema', 'samples', 'releases', 'assembly', 'stats', 'audit']),
})
const apiReleaseAuditSchema = z.object({
  familyType: registryCodeSchema,
  releaseCode: registryCodeSchema,
})
const apiReleaseDetailSchema = apiReleaseAuditSchema
const apiReleaseAuditPageSchema = apiReleaseAuditSchema.extend({
  action: registryCodeSchema,
  limit: z.number().int().min(1).max(500).default(50),
  offset: z.number().int().min(0).max(100_000),
})
const sourceReleaseAuditSchema = sourceReleaseShellSchema
const sourceReleaseAuditPageSchema = sourceReleaseAuditSchema.extend({
  action: registryCodeSchema,
  limit: z.number().int().min(1).max(500).default(50),
  offset: z.number().int().min(0).max(100_000),
})
const registryAccessMetricsSchema = z.object({
  entityId: registryCodeSchema,
  scope: z.enum(['publisher', 'dataset', 'source_release', 'api_release_set']),
})
const SOURCE_RELEASE_CODE_BATCH_SIZE = getMaxItemsPerInClause(1, 1)

export const getRegistryAccessMetricsData = query.batch(
  registryAccessMetricsSchema,
  async inputs => {
    const results = await getRegistryAccessMetricsBatch(getMetaDb(), inputs)
    return (_input, index) => results[index] ?? null
  },
)

export type SourcesPageSource = Pick<
  RegistrySource,
  | 'code'
  | 'publisherCode'
  | 'releaseFrequency'
  | 'sourceVariant'
  | 'resourceTypes'
  | 'theme'
> & {
  datasetI18n: LocalisedRow[]
  license: Pick<NonNullable<RegistrySource['license']>, 'code'> | null
  publisher: {
    publisherI18n: LocalisedRow[]
  } | null
  sourceVersions: Array<
    Pick<SourceVersion, 'code' | 'cohortKey' | 'status'> & {
      license: Pick<NonNullable<SourceVersion['license']>, 'code'> | null
      releaseAs: Array<
        Pick<
          NonNullable<SourceVersion['releaseAs']>[number],
          'apiFamily' | 'domainCode'
        >
      >
      stats: Array<
        Pick<
          NonNullable<SourceVersion['stats']>[number],
          'dimension' | 'groupBy' | 'groupValue' | 'metric' | 'metricUnit' | 'value'
        >
      >
    }
  >
}

function toSourcesPageSource(source: RegistrySource): SourcesPageSource {
  const version = source.sourceVersions?.find(item => item.status === 'published')

  return {
    code: source.code,
    datasetI18n: source.datasetI18n ?? [],
    license: source.license ? { code: source.license.code } : null,
    publisher: source.publisher
      ? { publisherI18n: source.publisher.publisherI18n ?? [] }
      : null,
    publisherCode: source.publisherCode,
    releaseFrequency: source.releaseFrequency,
    resourceTypes: source.resourceTypes,
    sourceVariant: source.sourceVariant,
    sourceVersions: version
      ? [
          {
            code: version.code,
            cohortKey: version.cohortKey,
            license: version.license ? { code: version.license.code } : null,
            releaseAs: (version.releaseAs ?? []).map(release => ({
              apiFamily: release.apiFamily,
              domainCode: release.domainCode,
            })),
            stats: (version.stats ?? []).filter(
              stat =>
                stat.dimension === 'records' &&
                stat.metric === 'count' &&
                stat.metricUnit === 'count' &&
                !stat.groupBy &&
                !stat.groupValue,
            ),
            status: version.status,
          },
        ]
      : [],
    theme: source.theme,
  }
}

export const getSourcesPageData = query(async () => {
  const db = getMetaDb()
  const [sources, apis] = await Promise.all([
    listRegistrySourcesPage(db, 200),
    listRegistryApiCompositions(db, 100),
  ])
  const domainsByApiFamily = Object.fromEntries(
    (apis as RegistryApi[]).map(api => {
      const composition = api.apiComposition
        ?.filter(item => item.status === 'current')
        .sort((left, right) => right.version - left.version)[0]

      return [
        api.familyType,
        {
          defaultDomainCode: composition?.defaultDomainCode ?? 'default',
          i18n: composition?.i18n ?? {},
        },
      ]
    }),
  )

  const result = {
    domainsByApiFamily,
    sources: (sources as unknown as RegistrySource[]).map(toSourcesPageSource),
  }
  recordRegistryDataLoad('/sources', 'source')
  return result
})

export const getPublishersPageData = query(async () => {
  const db = getMetaDb()
  const [registryPublishers, registrySources] = await Promise.all([
    listRegistrySourcePublishers(db),
    listRegistrySourcesPage(db, 200),
  ])
  const publishers = registryPublishers as RegistryPublisher[]
  const sourceCounts = new Map<string, number>()

  for (const source of registrySources) {
    sourceCounts.set(
      source.publisherId,
      (sourceCounts.get(source.publisherId) ?? 0) + 1,
    )
  }

  const childrenByPublisherId = new Map<string, RegistryPublisher[]>()
  for (const publisher of publishers) {
    if (!publisher.parentPublisherId) continue
    const children = childrenByPublisherId.get(publisher.parentPublisherId) ?? []
    children.push(publisher)
    childrenByPublisherId.set(publisher.parentPublisherId, children)
  }

  const contributionCounts = new Map<string, number>()
  const countContributions = (
    publisherId: string,
    ancestors = new Set<string>(),
  ): number => {
    const cachedCount = contributionCounts.get(publisherId)
    if (cachedCount !== undefined) return cachedCount
    if (ancestors.has(publisherId)) return sourceCounts.get(publisherId) ?? 0

    const nextAncestors = new Set(ancestors).add(publisherId)
    const count =
      (sourceCounts.get(publisherId) ?? 0) +
      (childrenByPublisherId.get(publisherId) ?? []).reduce(
        (total, child) => total + countContributions(child.id, nextAncestors),
        0,
      )
    contributionCounts.set(publisherId, count)
    return count
  }

  return {
    publishers: publishers
      .map(publisher => ({
        ...publisher,
        isInstitution:
          countContributions(publisher.id) > (sourceCounts.get(publisher.id) ?? 0),
        sourceCount: countContributions(publisher.id),
      }))
      .filter(publisher => publisher.sourceCount > 0),
  }
})

export const getSourcePageData = query(registryCodeSchema, async datasetCode => {
  const source = (await getRegistrySource(
    getMetaDb(),
    datasetCode,
  )) as RegistrySource | null
  if (!source) error(404, 'Source dataset not found.')

  const latestVersion = source.sourceVersions?.[0]
  if (latestVersion) {
    redirect(302, `/sources/${source.code}/${latestVersion.code}`)
  }

  recordRegistryDataLoad('/sources/:id', 'source', datasetCode)
  return source
})

export const getSourceReleaseShellData = query(
  sourceReleaseShellSchema,
  async ({ datasetCode, releaseCode }) => {
    const startedAt = performance.now()
    const shell = await runWithD1ReadRetry(() =>
      getRegistrySourceReleaseShell(getMetaDb(), datasetCode, releaseCode),
    )
    if (!shell) error(404, 'Source dataset not found.')

    const version = shell.sourceVersions.find(item => item.code === releaseCode) ?? null
    if (!version) error(404, 'Source release not found.')

    const timings = {
      ...shell.timings,
      shell: performance.now() - startedAt,
    }

    const {
      timings: _timings,
      selectedReleaseCode: _selectedReleaseCode,
      ...source
    } = shell
    const result = {
      source: source as RegistrySource,
      version: version as SourceVersion,
      timings,
    }
    recordRegistryDataLoad('/sources/:id/:id', 'source_release', releaseCode)
    return result
  },
)

export const getSourceReleaseContentData = query(
  sourceReleaseContentSchema,
  ({ datasetCode, releaseCode, previousReleaseCode, tab }) =>
    runWithD1ReadRetry(async () => {
      const db = getMetaDb()
      const source = await getRegistrySourceRelease(db, datasetCode, releaseCode, {
        content:
          tab === 'schema' || tab === 'samples'
            ? 'minimal'
            : tab === 'releases'
              ? 'releases'
              : tab,
      })
      if (!source) error(404, 'Source dataset not found.')

      const version = source.sourceVersions?.[0]
      if (!version) error(404, 'Source release not found.')

      const previousNotesPromise =
        tab !== 'notes'
          ? Promise.resolve(null)
          : previousReleaseCode
            ? db
                .select({ notes: metaSourceReleases.notes })
                .from(metaSourceReleases)
                .where(
                  and(
                    eq(metaSourceReleases.datasetId, version.datasetId),
                    eq(metaSourceReleases.code, previousReleaseCode),
                  ),
                )
                .limit(1)
                .get()
                .then(previous => previous?.notes ?? null)
            : db
                .select({
                  code: metaSourceReleases.code,
                  notes: metaSourceReleases.notes,
                })
                .from(metaSourceReleases)
                .where(eq(metaSourceReleases.datasetId, version.datasetId))
                .orderBy(
                  desc(metaSourceReleases.publicationDate),
                  desc(metaSourceReleases.createdAt),
                )
                .all()
                .then(releases => {
                  const currentIndex = releases.findIndex(
                    release => release.code === releaseCode,
                  )
                  return currentIndex >= 0
                    ? (releases[currentIndex + 1]?.notes ?? null)
                    : null
                })

      const [previousNotes, archive] = await Promise.all([
        previousNotesPromise,
        tab === 'audit'
          ? db
              .select({ assetId: metaAssets.id })
              .from(metaAssets)
              .leftJoin(metaReleases, eq(metaAssets.releaseId, metaReleases.id))
              .where(
                and(
                  eq(metaAssets.role, 'sourceArchive'),
                  eq(metaReleases.sourceReleaseId, version.id),
                ),
              )
              .orderBy(desc(metaAssets.retrievedAt))
              .limit(1)
              .get()
          : Promise.resolve(undefined),
      ])

      const measures =
        tab === 'stats' || tab === 'schema'
          ? await getSourceReleaseMeasures({
              datasetCode,
              releaseId: version.id,
              includeUnobserved: tab === 'schema',
            })
          : []
      const result = {
        version: archive
          ? { ...version, sourceArchiveAssetId: archive.assetId }
          : version,
        previousNotes,
        measures,
      } as {
        measures: Awaited<ReturnType<typeof getSourceReleaseMeasures>>
        version: SourceVersion
        previousNotes: string | null
      }

      recordRegistryDataLoad('/sources/:id/:id', 'source_release', releaseCode)
      return result
    }),
)

export const getPublisherPageData = query(registryCodeSchema, async publisherCode => {
  const db = getMetaDb()
  const [registryPublisher, registryPublishers, registrySources] = await Promise.all([
    getRegistrySourcePublisher(db, publisherCode),
    listRegistrySourcePublishers(db),
    listRegistrySources(db),
  ])
  const publisher = registryPublisher as RegistryPublisher | null
  const publishers = registryPublishers as RegistryPublisher[]
  const sources = registrySources as RegistrySource[]

  if (!publisher) error(404, 'Publisher not found.')

  const childrenByPublisherId = new Map<string, RegistryPublisher[]>()
  for (const child of publishers) {
    if (!child.parentPublisherId) continue
    const children = childrenByPublisherId.get(child.parentPublisherId) ?? []
    children.push(child)
    childrenByPublisherId.set(child.parentPublisherId, children)
  }

  const descendantPublisherIds = new Set<string>([publisher.id])
  const collectDescendants = (publisherId: string) => {
    for (const child of childrenByPublisherId.get(publisherId) ?? []) {
      if (descendantPublisherIds.has(child.id)) continue
      descendantPublisherIds.add(child.id)
      collectDescendants(child.id)
    }
  }
  collectDescendants(publisher.id)

  const accessMetrics = await getRegistryAccessMetrics(db, 'publisher', publisher.code)

  const result = {
    publisher: { ...publisher, accessMetrics },
    sources: sources.filter(source => descendantPublisherIds.has(source.publisherId)),
  }
  recordRegistryDataLoad('/publishers/:id', 'publisher', publisherCode)
  return result
})

async function getSourceReleaseMeasures(input: {
  datasetCode: string
  releaseId: string
  includeUnobserved?: boolean
}) {
  return readStatisticsSourceMeasures({
    metaDb: getMetaDb() as unknown as HarbourReadableDb,
    historyDbs: [
      'DB_HISTORY_HK_BEFORE',
      'DB_HISTORY_HK_2025',
      'DB_HISTORY_HK_2026',
    ].map(binding => getHistoryDb(binding) as unknown as HarbourReadableDb),
    datasetCode: input.datasetCode,
    sourceReleaseId: input.releaseId,
    includeUnobserved: input.includeUnobserved,
  })
}

export const getApiFamilyPageData = query(registryCodeSchema, async familyType => {
  const api = (await runWithD1ReadRetry(() =>
    getRegistryApi(getMetaDb(), familyType, { includeProcessingActions: false }),
  )) as RegistryApi | null
  if (!api) error(404, 'API family not found.')

  const latestRelease =
    api.releases?.find(release => release.displayStatus === 'current') ??
    api.releases?.[0]
  if (latestRelease) {
    redirect(302, `/apis/${api.familyType}/${latestRelease.code}`)
  }

  recordRegistryDataLoad('/apis/:id', 'api', familyType)
  return { api, release: null }
})

export const getApiReleaseShellData = query(
  apiReleaseDetailSchema,
  async ({ familyType, releaseCode }) => {
    const db = getMetaDb()
    const api = (await runWithD1ReadRetry(() =>
      getRegistryApi(db, familyType, {
        includeProcessingActions: false,
        releaseCode,
      }),
    )) as RegistryApi | null
    if (!api) error(404, 'API family not found.')

    recordRegistryDataLoad('/apis/:id/:id', 'api_release', familyType)
    return api
  },
)

export const getApiReleasePageData = query(
  apiReleaseDetailSchema,
  async ({ familyType, releaseCode }) => {
    const db = getMetaDb()
    const api = (await runWithD1ReadRetry(() =>
      getRegistryApi(db, familyType, {
        includeProcessingActions: false,
        releaseCode,
      }),
    )) as RegistryApi | null
    if (!api) error(404, 'API family not found.')

    const sourceReleaseCodes = [
      ...new Set(
        api.releases
          ?.flatMap(release => release.contributingSources ?? [])
          .map(source => source.sourceReleaseCode) ?? [],
      ),
    ]
    const sourceReleaseCodeBatches = chunkArray(
      sourceReleaseCodes,
      SOURCE_RELEASE_CODE_BATCH_SIZE,
    )
    const archives = sourceReleaseCodes.length
      ? (
          await Promise.all(
            sourceReleaseCodeBatches.map(releaseCodes =>
              db
                .select({
                  assetId: metaAssets.id,
                  mediaType: metaAssets.mediaType,
                  releaseCode: metaSourceReleases.code,
                })
                .from(metaAssets)
                .innerJoin(metaReleases, eq(metaAssets.releaseId, metaReleases.id))
                .innerJoin(
                  metaSourceReleases,
                  eq(metaReleases.sourceReleaseId, metaSourceReleases.id),
                )
                .where(
                  and(
                    eq(metaAssets.role, 'sourceArchive'),
                    inArray(metaSourceReleases.code, releaseCodes),
                  ),
                )
                .orderBy(desc(metaAssets.retrievedAt))
                .all(),
            ),
          )
        ).flat()
      : []
    const archiveByReleaseCode = new Map(
      [...archives].reverse().map(archive => [archive.releaseCode, archive] as const),
    )
    const districtStats = sourceReleaseCodes.length
      ? (
          await Promise.all(
            sourceReleaseCodeBatches.map(releaseCodes =>
              db
                .select({
                  dimension: stats.dimension,
                  groupBy: stats.groupBy,
                  groupValue: stats.groupValue,
                  metric: stats.metric,
                  metricUnit: stats.metricUnit,
                  releaseCode: metaSourceReleases.code,
                  value: stats.value,
                })
                .from(stats)
                .innerJoin(metaReleases, eq(stats.releaseId, metaReleases.id))
                .innerJoin(
                  metaSourceReleases,
                  eq(metaReleases.sourceReleaseId, metaSourceReleases.id),
                )
                .where(
                  and(
                    inArray(metaSourceReleases.code, releaseCodes),
                    eq(stats.dimension, 'records'),
                    eq(stats.metric, 'distribution'),
                    eq(stats.groupBy, 'district'),
                  ),
                )
                .all(),
            ),
          )
        ).flat()
      : []
    const districtStatsBySourceReleaseCode = new Map<string, typeof districtStats>()
    for (const stat of districtStats) {
      districtStatsBySourceReleaseCode.set(stat.releaseCode, [
        ...(districtStatsBySourceReleaseCode.get(stat.releaseCode) ?? []),
        stat,
      ])
    }

    const result = {
      ...api,
      releases: api.releases?.map(release => ({
        ...release,
        stats: (() => {
          const releaseStats = release.stats ?? []
          if (releaseStats.some(stat => stat.groupBy === 'district'))
            return releaseStats
          const primaryDivisionSourceCodes =
            release.contributingSources
              ?.filter(
                source =>
                  source.resourceType === 'division' && source.role === 'primary',
              )
              .map(source => source.sourceReleaseCode) ?? []
          return [
            ...releaseStats,
            ...primaryDivisionSourceCodes.flatMap(
              code => districtStatsBySourceReleaseCode.get(code) ?? [],
            ),
          ]
        })(),
        contributingSources: release.contributingSources?.map(source => {
          const archive = archiveByReleaseCode.get(source.sourceReleaseCode)
          return archive ? { ...source, sourceArchive: archive } : source
        }),
      })),
    }
    recordRegistryDataLoad('/apis/:id/:id', 'api_release', familyType)
    return result
  },
)

const processingActionPage = async (input: {
  action: string
  familyType: string
  limit: number
  offset: number
  releaseCode: string
}) => {
  const rows = await runWithD1ReadRetry(() =>
    listRegistryApiReleaseProcessingActions(getMetaDb(), {
      ...input,
      limit: input.limit + 1,
    }),
  )
  if (!rows) error(404, 'API release not found.')

  const pageRows = rows.slice(0, input.limit)
  return {
    rows: pageRows,
    hasMore: rows.length > input.limit,
    nextOffset: input.offset + pageRows.length,
  }
}

export const getApiReleaseAuditData = query(apiReleaseAuditSchema, async input => {
  const sections = await runWithD1ReadRetry(() =>
    listRegistryApiReleaseProcessingActionSections(getMetaDb(), input),
  )
  if (!sections) error(404, 'API release not found.')

  return {
    sections: sections.filter(
      section => section.action !== 'als_number_range_singleton_variant_consolidated',
    ),
  }
})

export const getApiReleaseAuditActionPage = query.batch(
  apiReleaseAuditPageSchema,
  async inputs => {
    const pages = await Promise.all(inputs.map(processingActionPage))
    return (_input, index) => {
      const page = pages[index]
      if (!page) throw new Error('Missing batched API audit page result.')
      return page
    }
  },
)

const sourceProcessingActionPage = async (input: {
  action: string
  datasetCode: string
  limit: number
  offset: number
  releaseCode: string
}) => {
  const rows = await runWithD1ReadRetry(() =>
    listRegistrySourceReleaseProcessingActions(getMetaDb(), {
      ...input,
      limit: input.limit + 1,
    }),
  )
  const pageRows = rows.slice(0, input.limit)
  return {
    rows: pageRows,
    hasMore: rows.length > input.limit,
    nextOffset: input.offset + pageRows.length,
  }
}

export const getSourceReleaseAuditData = query(
  sourceReleaseAuditSchema,
  async input => ({
    sections: await runWithD1ReadRetry(() =>
      listRegistrySourceReleaseProcessingActionSections(getMetaDb(), input),
    ),
  }),
)

export const getSourceReleaseAuditActionPage = query.batch(
  sourceReleaseAuditPageSchema,
  async inputs => {
    const pages = await Promise.all(inputs.map(sourceProcessingActionPage))
    return (_input, index) => {
      const page = pages[index]
      if (!page) throw new Error('Missing batched source audit page result.')
      return page
    }
  },
)
