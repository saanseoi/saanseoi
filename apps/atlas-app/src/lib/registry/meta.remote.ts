import {
  getRegistryApi,
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
  metaDatasets,
  sql,
  metaResourceReleases,
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
  LocalisedMap,
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
const apiReleaseDetailSchema = z.object({
  familyType: registryCodeSchema,
  releaseCode: registryCodeSchema,
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
  datasetI18n: LocalisedMap
  license: Pick<NonNullable<RegistrySource['license']>, 'code'> | null
  publisher: {
    publisherI18n: LocalisedMap
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
          'category' | 'dimension' | 'dimensionValue' | 'measure' | 'unit' | 'value'
        >
      >
    }
  >
}

function toSourcesPageSource(source: RegistrySource): SourcesPageSource {
  const version = source.sourceVersions?.find(item => item.status === 'current')

  return {
    code: source.code,
    datasetI18n: source.datasetI18n ?? {},
    license: source.license ? { code: source.license.code } : null,
    publisher: source.publisher
      ? { publisherI18n: source.publisher.publisherI18n ?? {} }
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
                stat.category === 'records' &&
                stat.measure === 'count' &&
                stat.unit === 'count' &&
                !stat.dimension &&
                !stat.dimensionValue,
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
          members: composition?.apiCompositionMembers ?? [],
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
  const [registryPublishers, counts] = await Promise.all([
    listRegistrySourcePublishers(db),
    db
      .select({ publisherId: metaDatasets.publisherId, count: sql<number>`count(*)` })
      .from(metaDatasets)
      .groupBy(metaDatasets.publisherId)
      .all(),
  ])
  const sourceCounts = new Map(counts.map(row => [row.publisherId, row.count]))
  return {
    publishers: (registryPublishers as RegistryPublisher[])
      .filter(publisher => (sourceCounts.get(publisher.id) ?? 0) > 0)
      .map(publisher => ({
        ...publisher,
        isInstitution: false,
        sourceCount: sourceCounts.get(publisher.id) ?? 0,
      })),
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
            ? 'resources'
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

      const [previousNotes, archive, resourceSourceArchives] = await Promise.all([
        previousNotesPromise,
        tab === 'audit'
          ? db
              .select({ assetId: metaAssets.id })
              .from(metaAssets)
              .leftJoin(
                metaResourceReleases,
                eq(metaAssets.resourceReleaseId, metaResourceReleases.id),
              )
              .where(
                and(
                  eq(metaAssets.role, 'releaseSourceArchive'),
                  eq(metaAssets.sourceReleaseId, version.id),
                ),
              )
              .orderBy(desc(metaAssets.retrievedAt))
              .limit(1)
              .get()
          : Promise.resolve(undefined),
        tab === 'audit'
          ? db
              .select({
                assetId: metaAssets.id,
                resourceType: metaResourceReleases.resourceType,
              })
              .from(metaAssets)
              .innerJoin(
                metaResourceReleases,
                eq(metaAssets.resourceReleaseId, metaResourceReleases.id),
              )
              .where(
                and(
                  eq(metaResourceReleases.sourceReleaseId, version.id),
                  eq(metaAssets.role, 'resourceSourceArchive'),
                ),
              )
              .orderBy(metaResourceReleases.resourceType, desc(metaAssets.retrievedAt))
              .all()
          : Promise.resolve([]),
      ])

      const measures =
        tab === 'stats' || tab === 'schema'
          ? await getSourceReleaseMeasures({
              datasetCode,
              resourceReleaseId: version.id,
              includeUnobserved: tab === 'schema',
            })
          : []
      const result = {
        version: {
          ...version,
          resourceSourceArchives,
          ...(archive ? { sourceArchiveAssetId: archive.assetId } : {}),
        },
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
  resourceReleaseId: string
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
    sourceReleaseId: input.resourceReleaseId,
    includeUnobserved: input.includeUnobserved,
  })
}

export const getApiFamilyPageData = query(
  z.object({
    familyType: registryCodeSchema,
    domainCode: registryCodeSchema.optional(),
  }),
  async ({ familyType, domainCode }) => {
    const api = (await runWithD1ReadRetry(() =>
      getRegistryApi(getMetaDb(), familyType),
    )) as RegistryApi | null
    if (!api) error(404, 'API family not found.')

    const releases = domainCode
      ? api.releases?.filter(
          release => (release.domainCode ?? 'default') === domainCode,
        )
      : api.releases
    const latestRelease =
      releases?.find(release => release.displayStatus === 'current') ?? releases?.[0]
    if (latestRelease) {
      redirect(302, `/apis/${api.familyType}/${latestRelease.code}`)
    }
    if (domainCode) error(404, 'API domain release not found.')

    recordRegistryDataLoad('/apis/:id', 'api', familyType)
    return { api, release: null }
  },
)

export const getApiReleaseShellData = query(
  apiReleaseDetailSchema,
  async ({ familyType, releaseCode }) => {
    const db = getMetaDb()
    const api = (await runWithD1ReadRetry(() =>
      getRegistryApi(db, familyType, {
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
                .innerJoin(
                  metaSourceReleases,
                  eq(metaAssets.sourceReleaseId, metaSourceReleases.id),
                )
                .where(
                  and(
                    eq(metaAssets.role, 'releaseSourceArchive'),
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
                  category: stats.category,
                  dimension: stats.dimension,
                  dimensionValue: stats.dimensionValue,
                  measure: stats.measure,
                  unit: stats.unit,
                  releaseCode: metaSourceReleases.code,
                  value: stats.value,
                })
                .from(stats)
                .innerJoin(
                  metaResourceReleases,
                  eq(stats.resourceReleaseId, metaResourceReleases.id),
                )
                .innerJoin(
                  metaSourceReleases,
                  eq(metaResourceReleases.sourceReleaseId, metaSourceReleases.id),
                )
                .where(
                  and(
                    inArray(metaSourceReleases.code, releaseCodes),
                    eq(stats.category, 'records'),
                    eq(stats.measure, 'count'),
                    eq(stats.dimension, 'district'),
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
          if (releaseStats.some(stat => stat.dimension === 'district'))
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
