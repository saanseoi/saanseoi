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
  getRegistryReleaseLifecycleScope,
  resolveRegistryReleaseDisplayStatus,
} from '@repo/core/db/metaRegistry'
import {
  and,
  createCurrentDb,
  createHistoryDb,
  createMetaDb,
  currentSchema,
  desc,
  eq,
  historySchema,
  inArray,
  metaApiReleaseSets,
  metaApiVersions,
  metaAssets,
  metaDataShards,
  metaReleases,
  metaSourceReleases,
  metaSnapshotLineages,
  metaSnapshotShardAssignments,
  metaSnapshots,
  metaApiComposition,
  metaApiCompositionMembers,
  stats,
  sql,
} from '@repo/db'
import { error, redirect } from '@sveltejs/kit'
import { getRequestEvent, query } from '$app/server'
import { z } from 'zod'

import { runWithD1ReadRetry } from '../server/d1'
import { writeServerProductUsage } from '../analytics/productUsage.js'
import { getRegistryAccessMetrics } from './accessMetrics.js'
import { CURRENT_BASEMAP_SCHEMA_VERSION } from './types'
import type {
  ApiRelease,
  BasemapRelease,
  LocalisedRow,
  RegistryApi,
  RegistryPublisher,
  RegistrySource,
  SourceVersion,
} from './types'

const registryCodeSchema = z.string().trim().min(1).max(200)
const sourceReleaseShellSchema = z.object({
  datasetCode: registryCodeSchema,
  releaseCode: registryCodeSchema,
})
const sourceReleaseContentSchema = sourceReleaseShellSchema.extend({
  previousReleaseCode: registryCodeSchema.nullable().optional(),
})
const releasePageSchema = z.object({
  offset: z.number().int().min(0).max(10_000),
})
const DATA_RELEASES_PAGE_SIZE = 12
const BASEMAP_TILE_ORIGIN = 'https://tiles.saanseoi.hk'
const BASEMAP_VIEWER_ORIGIN = 'https://viewer.saanseoi.hk'
const BASEMAP_REGIONS = {
  gba: { name: 'Greater Bay Area', tileset: 'gba' },
  hk: { name: 'Hong Kong', tileset: 'hongkong' },
  mo: { name: 'Macao', tileset: 'macau' },
} as const

const recordRegistryDataLoad = (
  route: string,
  entityType:
    | 'source'
    | 'source_release'
    | 'publisher'
    | 'api'
    | 'api_release'
    | 'data_release'
    | 'district'
    | 'region',
  entityId?: string,
  outcome: 'success' | 'failure' = 'success',
) =>
  writeServerProductUsage({
    event: 'registry.data_load',
    surface: 'registry',
    route,
    entityType,
    entityId,
    outcome,
  })

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

export type DataPageRelease = {
  apiFamily: string
  apiVersionId?: string
  code: string
  cohortKey?: string | null
  domainCode?: string | null
  createdAt: string
  displayCode?: string
  displayStatus?: ApiRelease['displayStatus']
  href?: string
  id: string
  publishedAt: string | null
  primaryRecordCount: number | null
  schemaVersion: string
  status: string
}

type DataPageApi = Pick<
  RegistryApi,
  'code' | 'familyType' | 'id' | 'status' | 'version'
> & {
  defaultDomainCode: string
  domainCount: number
  releases: Array<
    Pick<
      DataPageRelease,
      'code' | 'createdAt' | 'displayStatus' | 'domainCode' | 'publishedAt'
    >
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

function isBasemapVersionEntry(
  value: unknown,
): value is { version: string; size: number; createdAt: string } {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.version === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(entry.version) &&
    typeof entry.size === 'number' &&
    Number.isFinite(entry.size) &&
    typeof entry.createdAt === 'string'
  )
}

async function loadBasemapReleases(): Promise<BasemapRelease[]> {
  const eventFetch = getRequestEvent().fetch
  const releases = await Promise.all(
    Object.entries(BASEMAP_REGIONS).map(async ([code, region]) => {
      try {
        const response = await eventFetch(
          `${BASEMAP_TILE_ORIGIN}/${code}/versions.json`,
          {
            headers: { Accept: 'application/json', Origin: BASEMAP_VIEWER_ORIGIN },
          },
        )
        if (!response.ok) return []
        const value = (await response.json()) as { versions?: unknown }
        if (!Array.isArray(value.versions)) return []
        const entries = value.versions.filter(isBasemapVersionEntry)
        return entries.map((entry, index): BasemapRelease => {
          const viewer = new URL(BASEMAP_VIEWER_ORIGIN)
          viewer.searchParams.set('region', code)
          viewer.searchParams.set('version', entry.version)
          viewer.searchParams.set('theme', 'midnight')
          return {
            apiFamily: 'basemaps',
            code: `${entry.version}-${code.toUpperCase()}`,
            createdAt: entry.createdAt,
            displayStatus: index === 0 ? 'current' : 'superseded',
            previewUrl: `${BASEMAP_TILE_ORIGIN}/render/${code}/${region.tileset}-${entry.version}-dark.webp`,
            regionCode: code as BasemapRelease['regionCode'],
            regionName: region.name,
            schemaVersion: CURRENT_BASEMAP_SCHEMA_VERSION,
            size: entry.size,
            status: 'published',
            version: entry.version,
            viewerUrl: viewer.toString(),
          }
        })
      } catch {
        return []
      }
    }),
  )
  return releases.flat().sort((left, right) => {
    const byDate = right.version.localeCompare(left.version)
    return byDate || left.regionCode.localeCompare(right.regionCode)
  })
}

function getMetaDb() {
  const event = getRequestEvent()
  const binding = event.platform?.env.DB_META
  if (!binding) throw new Error('D1 binding "DB_META" not found.')
  return createMetaDb(binding)
}

function getCurrentDb() {
  const event = getRequestEvent()
  const binding = event.platform?.env.DB_CURRENT
  if (!binding) throw new Error('D1 binding "DB_CURRENT" not found.')
  return createCurrentDb(binding)
}

function getHistoryDb(bindingName: string) {
  const env = getRequestEvent().platform?.env
  const bindings = {
    DB_HISTORY_HK_BEFORE: env?.DB_HISTORY_HK_BEFORE,
    DB_HISTORY_HK_2025: env?.DB_HISTORY_HK_2025,
    DB_HISTORY_HK_2026: env?.DB_HISTORY_HK_2026,
  }
  const binding = bindings[bindingName as keyof typeof bindings]
  if (!binding) throw new Error(`History D1 binding "${bindingName}" not found.`)
  return createHistoryDb(binding)
}

function isRegistryBootstrapError(error: unknown) {
  const seen = new Set<unknown>()
  let current = error

  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    if (
      current instanceof Error &&
      (/no such table: (?:apiReleaseSets|apiVersions|address2d|divisions)/i.test(
        current.message,
      ) ||
        (current.name === 'DrizzleQueryError' &&
          /Failed query:[\s\S]*from "apiReleaseSets"/i.test(current.message)))
    ) {
      return true
    }
    current = 'cause' in current ? current.cause : undefined
  }

  return false
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
    const shell = await getRegistrySourceReleaseShell(
      getMetaDb(),
      datasetCode,
      releaseCode,
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
    const accessMetrics = await getRegistryAccessMetrics(
      getMetaDb(),
      'source_release',
      version.id,
    )
    const result = {
      source: source as RegistrySource,
      version: { ...version, accessMetrics } as SourceVersion,
      timings,
    }
    recordRegistryDataLoad('/sources/:id/:id', 'source_release', releaseCode)
    return result
  },
)

export const getSourceReleaseContentData = query(
  sourceReleaseContentSchema,
  async ({ datasetCode, releaseCode, previousReleaseCode }) => {
    const db = getMetaDb()
    const source = await getRegistrySourceRelease(db, datasetCode, releaseCode)
    if (!source) error(404, 'Source dataset not found.')

    const version = source.sourceVersions?.[0]
    if (!version) error(404, 'Source release not found.')

    const previousNotesPromise = previousReleaseCode
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
          .select({ code: metaSourceReleases.code, notes: metaSourceReleases.notes })
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
      db
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
        .get(),
    ])

    const measures = await getSourceReleaseMeasures({
      datasetCode,
      releaseId: version.id,
    })
    const accessMetrics = await getRegistryAccessMetrics(
      db,
      'source_release',
      version.id,
    )
    const result = {
      version: archive
        ? { ...version, sourceArchiveAssetId: archive.assetId, accessMetrics }
        : { ...version, accessMetrics },
      previousNotes,
      measures,
    } as {
      measures: Awaited<ReturnType<typeof getSourceReleaseMeasures>>
      version: SourceVersion
      previousNotes: string | null
    }

    recordRegistryDataLoad('/sources/:id/:id', 'source_release', releaseCode)
    return result
  },
)

const DISTRICT_COVERAGE_MAP_VARIANT = 'hkgov-censtatd:2021:simplified'
const districtMapLocaleSchema = z.enum(['en', 'zh-Hant', 'zh-Hans'])
const districtGeometryNamesSchema = z.object({
  districtIds: z.array(z.string().trim().min(1).max(200)).max(100),
  locale: districtMapLocaleSchema,
})
const D1_DISTRICT_NAME_BATCH_SIZE = 98
const UNOFFICIAL_DISTRICT_IDS = new Set([
  // Overture's Lok Ma Chau Loop is a named geographic area, not an official
  // Hong Kong district. Its localised names remain canonical division data.
  '222b7818-970a-491d-98b6-b88d8c6f0161',
])

/**
 * The district-coverage map prefers the C&SD 2021 Census District Boundary's
 * simplified display geometry. Its immutable snapshot can live in a history
 * shard, so resolve the published snapshot and read its assigned shard rather
 * than substituting Overture geometry.
 */
export const getDistrictCoverageMapData = query(
  districtMapLocaleSchema,
  async locale => {
    const { divisionAreas, divisionsI18n } = currentSchema
    const i18nLocale = locale.toLowerCase()
    const selectCurrentDistrictAreas = () =>
      getCurrentDb()
        .select({
          divisionId: divisionAreas.divisionId,
          geometry: divisionAreas.geometry,
          updatedAt: divisionAreas.updatedAt,
          variant: divisionAreas.variant,
        })
        .from(divisionAreas)
        .where(eq(divisionAreas.variant, DISTRICT_COVERAGE_MAP_VARIANT))
        .orderBy(desc(divisionAreas.updatedAt))
        .all()
    const currentRows = await selectCurrentDistrictAreas()
    const snapshot =
      currentRows.length > 0
        ? null
        : await getMetaDb()
            .select({
              bindingName: metaDataShards.bindingName,
              snapshotId: metaSnapshots.id,
            })
            .from(metaSnapshots)
            .innerJoin(
              metaSnapshotLineages,
              eq(metaSnapshots.snapshotLineageId, metaSnapshotLineages.id),
            )
            .innerJoin(
              metaSnapshotShardAssignments,
              eq(metaSnapshots.id, metaSnapshotShardAssignments.snapshotId),
            )
            .innerJoin(
              metaDataShards,
              eq(metaSnapshotShardAssignments.dataShardId, metaDataShards.id),
            )
            .where(
              and(
                eq(metaSnapshots.resourceType, 'divisionArea'),
                eq(metaSnapshots.status, 'published'),
                eq(metaSnapshotLineages.variant, DISTRICT_COVERAGE_MAP_VARIANT),
              ),
            )
            .orderBy(desc(metaSnapshots.publishedAt), desc(metaSnapshots.createdAt))
            .limit(1)
            .get()
    const rows =
      currentRows.length > 0
        ? currentRows
        : snapshot
          ? await getHistoryDb(snapshot.bindingName)
              .select({
                divisionId: historySchema.divisionAreas.divisionId,
                geometry: historySchema.divisionAreas.geometry,
                updatedAt: historySchema.divisionAreas.updatedAt,
                variant: historySchema.divisionAreas.variant,
              })
              .from(historySchema.divisionAreas)
              .where(eq(historySchema.divisionAreas.snapshotId, snapshot.snapshotId))
              .orderBy(desc(historySchema.divisionAreas.updatedAt))
              .all()
          : []

    const latestByDistrict = new Map<string, (typeof rows)[number]>()
    for (const row of rows) {
      if (!latestByDistrict.has(row.divisionId))
        latestByDistrict.set(row.divisionId, row)
    }

    const districtIds = [...latestByDistrict.keys()]
    const i18nRows = districtIds.length
      ? await getCurrentDb()
          .select({
            divisionId: divisionsI18n.divisionId,
            locale: divisionsI18n.locale,
            name: divisionsI18n.name,
          })
          .from(divisionsI18n)
          .where(
            and(
              inArray(divisionsI18n.locale, [i18nLocale, 'en']),
              inArray(divisionsI18n.divisionId, districtIds),
            ),
          )
          .orderBy(desc(divisionsI18n.updatedAt))
          .all()
      : []
    const nameByLocale = new Map<string, Map<string, string>>()
    for (const row of i18nRows) {
      if (!row.name) continue
      const names = nameByLocale.get(row.locale) ?? new Map<string, string>()
      if (!names.has(row.divisionId)) {
        names.set(row.divisionId, row.name)
      }
      nameByLocale.set(row.locale, names)
    }
    const localisedNames = nameByLocale.get(i18nLocale)
    const englishNames = nameByLocale.get('en')

    return [...latestByDistrict.values()].map(row => ({
      ...row,
      name:
        localisedNames?.get(row.divisionId) ??
        englishNames?.get(row.divisionId) ??
        null,
    }))
  },
)

/**
 * Resolves names for district geometry statistics. This intentionally uses
 * canonical division localisations instead of display geometry, because a
 * release can contain a district that is not part of the official C&SD map.
 */
export const getDistrictGeometryNames = query(
  districtGeometryNamesSchema,
  async ({ districtIds, locale }) => {
    const ids = [...new Set(districtIds)]
    if (!ids.length) return []

    const i18nLocale = locale.toLowerCase()
    const { divisionsI18n } = currentSchema
    const rows = (
      await Promise.all(
        Array.from(
          { length: Math.ceil(ids.length / D1_DISTRICT_NAME_BATCH_SIZE) },
          (_, index) =>
            getCurrentDb()
              .select({
                divisionId: divisionsI18n.divisionId,
                locale: divisionsI18n.locale,
                name: divisionsI18n.name,
                updatedAt: divisionsI18n.updatedAt,
              })
              .from(divisionsI18n)
              .where(
                and(
                  inArray(divisionsI18n.locale, [i18nLocale, 'en']),
                  inArray(
                    divisionsI18n.divisionId,
                    ids.slice(
                      index * D1_DISTRICT_NAME_BATCH_SIZE,
                      (index + 1) * D1_DISTRICT_NAME_BATCH_SIZE,
                    ),
                  ),
                ),
              )
              .orderBy(desc(divisionsI18n.updatedAt))
              .all(),
        ),
      )
    ).flat()

    const namesByLocale = new Map<string, Map<string, string>>()
    for (const row of rows) {
      if (!row.name) continue
      const names = namesByLocale.get(row.locale) ?? new Map<string, string>()
      if (!names.has(row.divisionId)) names.set(row.divisionId, row.name)
      namesByLocale.set(row.locale, names)
    }
    const localisedNames = namesByLocale.get(i18nLocale)
    const englishNames = namesByLocale.get('en')

    const result = ids.map(divisionId => ({
      divisionId,
      name: localisedNames?.get(divisionId) ?? englishNames?.get(divisionId) ?? null,
      unofficial: UNOFFICIAL_DISTRICT_IDS.has(divisionId),
    }))
    recordRegistryDataLoad('/sources/:id/:id', 'district')
    return result
  },
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

async function loadDataReleasesPage(offset = 0) {
  const db = getMetaDb()
  const [lifecycleRows, releases] = await Promise.all([
    db
      .select({
        apiFamily: metaApiVersions.familyType,
        regionCode: metaApiReleaseSets.regionCode,
        domainCode: metaApiReleaseSets.domainCode,
        cohortKey: metaApiReleaseSets.cohortKey,
        revision: metaApiReleaseSets.revision,
        status: metaApiReleaseSets.status,
      })
      .from(metaApiReleaseSets)
      .innerJoin(
        metaApiVersions,
        eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id),
      )
      .all(),
    db
      .select({
        apiFamily: metaApiVersions.familyType,
        apiVersionId: metaApiReleaseSets.apiVersionId,
        code: metaApiReleaseSets.code,
        regionCode: metaApiReleaseSets.regionCode,
        domainCode: metaApiReleaseSets.domainCode,
        cohortKey: metaApiReleaseSets.cohortKey,
        createdAt: metaApiReleaseSets.createdAt,
        id: metaApiReleaseSets.id,
        publishedAt: metaApiReleaseSets.publishedAt,
        revision: metaApiReleaseSets.revision,
        schemaVersion: metaApiReleaseSets.schemaVersion,
        status: metaApiReleaseSets.status,
      })
      .from(metaApiReleaseSets)
      .innerJoin(
        metaApiVersions,
        eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id),
      )
      .orderBy(
        desc(
          sql`coalesce(${metaApiReleaseSets.publishedAt}, ${metaApiReleaseSets.createdAt})`,
        ),
        desc(metaApiReleaseSets.id),
      )
      .limit(DATA_RELEASES_PAGE_SIZE + 1)
      .offset(offset)
      .all(),
  ])
  const latestByScope = new Map<string, { cohortKey: string; revision: number }>()
  for (const release of lifecycleRows) {
    if (release.status === 'draft' || release.cohortKey === null) continue
    const scope = getRegistryReleaseLifecycleScope(
      release.apiFamily,
      release.regionCode,
      release.domainCode,
    )
    const latest = latestByScope.get(scope)
    if (
      !latest ||
      release.cohortKey > latest.cohortKey ||
      (release.cohortKey === latest.cohortKey && release.revision > latest.revision)
    ) {
      latestByScope.set(scope, {
        cohortKey: release.cohortKey,
        revision: release.revision,
      })
    }
  }
  const releaseIds = releases.map(release => release.id)
  const releaseStats = releaseIds.length
    ? await db
        .select({
          apiReleaseSetId: stats.apiReleaseSetId,
          dimension: stats.dimension,
          groupBy: stats.groupBy,
          groupValue: stats.groupValue,
          metric: stats.metric,
          metricUnit: stats.metricUnit,
          value: stats.value,
        })
        .from(stats)
        .where(inArray(stats.apiReleaseSetId, releaseIds))
        .all()
    : []
  const primaryRecordCountByReleaseId = new Map(
    releaseStats.flatMap(stat =>
      stat.apiReleaseSetId &&
      stat.dimension === 'records' &&
      stat.metric === 'count' &&
      stat.metricUnit === 'count' &&
      stat.groupBy === null &&
      stat.groupValue === null
        ? [[stat.apiReleaseSetId, stat.value] as const]
        : [],
    ),
  )

  const apiReleases = releases.map(release => {
    return {
      apiFamily: release.apiFamily,
      apiVersionId: release.apiVersionId,
      code: release.code,
      cohortKey: release.cohortKey,
      createdAt: release.createdAt,
      primaryRecordCount: primaryRecordCountByReleaseId.get(release.id) ?? null,
      displayStatus: resolveRegistryReleaseDisplayStatus(
        release,
        latestByScope.get(
          getRegistryReleaseLifecycleScope(
            release.apiFamily,
            release.regionCode,
            release.domainCode,
          ),
        ),
      ) as DataPageRelease['displayStatus'],
      id: release.id,
      publishedAt: release.publishedAt,
      schemaVersion: release.schemaVersion,
      status: release.status,
    }
  }) satisfies DataPageRelease[]
  return {
    releases: apiReleases.slice(0, DATA_RELEASES_PAGE_SIZE),
    hasMore: releases.length > DATA_RELEASES_PAGE_SIZE,
    nextOffset: offset + Math.min(releases.length, DATA_RELEASES_PAGE_SIZE),
  }
}

async function getSourceReleaseMeasures(input: {
  datasetCode: string
  releaseId: string
}) {
  const currentDb = getCurrentDb()
  const records = await currentDb
    .select({ values: currentSchema.statsRecords.values })
    .from(currentSchema.statsRecords)
    .where(eq(currentSchema.statsRecords.sourceReleaseId, input.releaseId))
    .all()
  if (!records.length) return []

  const countsByMeasure = new Map<string, number>()
  for (const record of records) {
    for (const fieldName of Object.keys(record.values)) {
      countsByMeasure.set(fieldName, (countsByMeasure.get(fieldName) ?? 0) + 1)
    }
  }
  const rows = (
    await Promise.all(
      ['DB_HISTORY_HK_BEFORE', 'DB_HISTORY_HK_2025', 'DB_HISTORY_HK_2026'].map(
        async bindingName =>
          getHistoryDb(bindingName)
            .select({
              definition: historySchema.statsFieldsI18n.description,
              aggregation: historySchema.statsFields.aggregation,
              fieldName: historySchema.statsFields.fieldName,
              name: historySchema.statsFieldsI18n.name,
              sourceField: historySchema.statsFields.sourceField,
              statisticKind: historySchema.statsFields.statisticKind,
              unitCode: historySchema.statsFields.unitCode,
              valueKind: historySchema.statsFields.valueKind,
            })
            .from(historySchema.statsFields)
            .leftJoin(
              historySchema.statsFieldsI18n,
              and(
                eq(
                  historySchema.statsFieldsI18n.sourceReleaseId,
                  historySchema.statsFields.sourceReleaseId,
                ),
                eq(
                  historySchema.statsFieldsI18n.datasetCode,
                  historySchema.statsFields.datasetCode,
                ),
                eq(
                  historySchema.statsFieldsI18n.fieldName,
                  historySchema.statsFields.fieldName,
                ),
                eq(historySchema.statsFieldsI18n.locale, 'en'),
              ),
            )
            .where(
              and(
                eq(historySchema.statsFields.sourceReleaseId, input.releaseId),
                eq(historySchema.statsFields.datasetCode, input.datasetCode),
              ),
            )
            .orderBy(historySchema.statsFields.sourceField)
            .all(),
      ),
    )
  ).flat()
  const uniqueRows = [...new Map(rows.map(row => [row.fieldName, row])).values()]
  return uniqueRows.flatMap(row => {
    const observationCount = countsByMeasure.get(row.fieldName)
    return observationCount === undefined
      ? []
      : [
          {
            definition: row.definition,
            aggregation: row.aggregation,
            name: row.name ?? row.sourceField,
            observationCount,
            sourceField: row.sourceField,
            statisticKind: row.statisticKind,
            unitCode: row.unitCode,
            valueKind: row.valueKind,
          },
        ]
  })
}

async function loadDataPageApis(): Promise<DataPageApi[]> {
  const db = getMetaDb()
  const apiQueryBatchSize = 90
  const [apis, releases] = await Promise.all([
    db
      .select({
        id: metaApiVersions.id,
        code: metaApiVersions.code,
        familyType: metaApiVersions.familyType,
        status: metaApiVersions.status,
        version: metaApiVersions.version,
      })
      .from(metaApiVersions)
      .orderBy(desc(metaApiVersions.publishedAt), desc(metaApiVersions.createdAt))
      .limit(100)
      .all(),
    db
      .select({
        apiFamily: metaApiVersions.familyType,
        apiVersionId: metaApiReleaseSets.apiVersionId,
        code: metaApiReleaseSets.code,
        regionCode: metaApiReleaseSets.regionCode,
        domainCode: metaApiReleaseSets.domainCode,
        cohortKey: metaApiReleaseSets.cohortKey,
        createdAt: metaApiReleaseSets.createdAt,
        publishedAt: metaApiReleaseSets.publishedAt,
        revision: metaApiReleaseSets.revision,
        status: metaApiReleaseSets.status,
      })
      .from(metaApiReleaseSets)
      .innerJoin(
        metaApiVersions,
        eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id),
      )
      .all(),
  ])

  const apiIds = apis.map(api => api.id)
  const apiIdBatches = Array.from(
    { length: Math.ceil(apiIds.length / apiQueryBatchSize) },
    (_, index) =>
      apiIds.slice(index * apiQueryBatchSize, (index + 1) * apiQueryBatchSize),
  )
  const compositions = (
    await Promise.all(
      apiIdBatches.map(ids =>
        ids.length
          ? db
              .select({
                apiVersionId: metaApiComposition.apiVersionId,
                defaultDomainCode: metaApiComposition.defaultDomainCode,
                id: metaApiComposition.id,
                status: metaApiComposition.status,
                version: metaApiComposition.version,
              })
              .from(metaApiComposition)
              .where(inArray(metaApiComposition.apiVersionId, ids))
              .all()
          : Promise.resolve([]),
      ),
    )
  ).flat()
  const compositionIds = compositions.map(composition => composition.id)
  const compositionIdBatches = Array.from(
    { length: Math.ceil(compositionIds.length / apiQueryBatchSize) },
    (_, index) =>
      compositionIds.slice(index * apiQueryBatchSize, (index + 1) * apiQueryBatchSize),
  )
  const compositionMembers = (
    await Promise.all(
      compositionIdBatches.map(ids =>
        ids.length
          ? db
              .select({
                apiCompositionId: metaApiCompositionMembers.apiCompositionId,
                domainCode: metaApiCompositionMembers.domainCode,
              })
              .from(metaApiCompositionMembers)
              .where(inArray(metaApiCompositionMembers.apiCompositionId, ids))
              .all()
          : Promise.resolve([]),
      ),
    )
  ).flat()

  const latestByScope = new Map<string, { cohortKey: string; revision: number }>()
  for (const release of releases) {
    if (release.status === 'draft' || release.cohortKey === null) continue
    const scope = getRegistryReleaseLifecycleScope(
      release.apiFamily,
      release.regionCode,
      release.domainCode,
    )
    const latest = latestByScope.get(scope)
    if (
      !latest ||
      release.cohortKey > latest.cohortKey ||
      (release.cohortKey === latest.cohortKey && release.revision > latest.revision)
    ) {
      latestByScope.set(scope, {
        cohortKey: release.cohortKey,
        revision: release.revision,
      })
    }
  }

  return apis.map(api => {
    const currentComposition = compositions
      .filter(
        composition =>
          composition.apiVersionId === api.id && composition.status === 'current',
      )
      .sort((left, right) => right.version - left.version)[0]
    const defaultDomainCode = currentComposition?.defaultDomainCode ?? 'default'
    const domainCount = currentComposition
      ? new Set(
          compositionMembers
            .filter(member => member.apiCompositionId === currentComposition.id)
            .map(member => member.domainCode),
        ).size
      : 0
    const candidates = releases
      .filter(release => release.apiVersionId === api.id)
      .filter(release => release.domainCode === defaultDomainCode)
      .map(release => ({
        code: release.code,
        createdAt: release.createdAt,
        domainCode: release.domainCode,
        displayStatus: resolveRegistryReleaseDisplayStatus(
          release,
          latestByScope.get(
            getRegistryReleaseLifecycleScope(
              release.apiFamily,
              release.regionCode,
              release.domainCode,
            ),
          ),
        ) as DataPageRelease['displayStatus'],
        publishedAt: release.publishedAt,
      }))
      .sort(
        (left, right) =>
          new Date(right.publishedAt ?? right.createdAt).getTime() -
          new Date(left.publishedAt ?? left.createdAt).getTime(),
      )
    const latest =
      candidates.find(release => release.displayStatus === 'current') ?? candidates[0]

    return {
      ...api,
      defaultDomainCode,
      domainCount,
      releases: latest ? [latest] : [],
    }
  })
}

async function loadDataPageApiData() {
  const [releasePage, apis] = await Promise.all([
    loadDataReleasesPage(),
    loadDataPageApis(),
  ])

  return {
    ...releasePage,
    apis,
  }
}

export const getDataPageApiData = query(async () => {
  try {
    const result = await runWithD1ReadRetry(loadDataPageApiData)
    recordRegistryDataLoad('/data', 'data_release')
    return result
  } catch (error) {
    // An import can briefly expose the app before both D1 databases have their
    // registry tables. Render the empty registry state until the upload finishes.
    if (isRegistryBootstrapError(error)) {
      const result = {
        releases: [] as DataPageRelease[],
        hasMore: false,
        nextOffset: 0,
        apis: [] as DataPageApi[],
      }
      recordRegistryDataLoad('/data', 'data_release')
      return result
    }
    throw error
  }
})

export const getDataPageBasemapData = query(async () => {
  const result = { basemapReleases: await loadBasemapReleases() }
  recordRegistryDataLoad('/data', 'region')
  return result
})

export const getDataReleasesPageData = query(releasePageSchema, async ({ offset }) => {
  try {
    const result = await runWithD1ReadRetry(() => loadDataReleasesPage(offset))
    recordRegistryDataLoad('/data/releases', 'data_release', String(offset))
    return result
  } catch (error) {
    if (isRegistryBootstrapError(error)) {
      const result = {
        releases: [] as DataPageRelease[],
        hasMore: false,
        nextOffset: offset,
      }
      recordRegistryDataLoad('/data/releases', 'data_release', String(offset))
      return result
    }
    throw error
  }
})

export const getApiFamilyPageData = query(registryCodeSchema, async familyType => {
  const api = (await runWithD1ReadRetry(() =>
    getRegistryApi(getMetaDb(), familyType),
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

export const getApiReleaseShellData = query(registryCodeSchema, async familyType => {
  const db = getMetaDb()
  const api = (await runWithD1ReadRetry(() =>
    getRegistryApi(db, familyType),
  )) as RegistryApi | null
  if (!api) error(404, 'API family not found.')

  const releases = await Promise.all(
    (api.releases ?? []).map(async release => ({
      ...release,
      accessMetrics: await getRegistryAccessMetrics(db, 'api_release_set', release.id),
    })),
  )

  recordRegistryDataLoad('/apis/:id/:id', 'api_release', familyType)
  return { ...api, releases }
})

export const getApiReleasePageData = query(registryCodeSchema, async familyType => {
  const db = getMetaDb()
  const api = (await runWithD1ReadRetry(() =>
    getRegistryApi(db, familyType),
  )) as RegistryApi | null
  if (!api) error(404, 'API family not found.')

  const sourceReleaseCodes = [
    ...new Set(
      api.releases
        ?.flatMap(release => release.contributingSources ?? [])
        .map(source => source.sourceReleaseCode) ?? [],
    ),
  ]
  const archives = sourceReleaseCodes.length
    ? await db
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
            inArray(metaSourceReleases.code, sourceReleaseCodes),
          ),
        )
        .orderBy(desc(metaAssets.retrievedAt))
        .all()
    : []
  const archiveByReleaseCode = new Map(
    [...archives].reverse().map(archive => [archive.releaseCode, archive] as const),
  )
  const districtStats = sourceReleaseCodes.length
    ? await db
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
            inArray(metaSourceReleases.code, sourceReleaseCodes),
            eq(stats.dimension, 'records'),
            eq(stats.metric, 'distribution'),
            eq(stats.groupBy, 'district'),
          ),
        )
        .all()
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
        if (releaseStats.some(stat => stat.groupBy === 'district')) return releaseStats
        const primaryDivisionSourceCodes =
          release.contributingSources
            ?.filter(
              source => source.resourceType === 'division' && source.role === 'primary',
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
  const releasesWithMetrics = await Promise.all(
    (result.releases ?? []).map(async release => ({
      ...release,
      accessMetrics: await getRegistryAccessMetrics(db, 'api_release_set', release.id),
    })),
  )
  recordRegistryDataLoad('/apis/:id/:id', 'api_release', familyType)
  return { ...result, releases: releasesWithMetrics }
})
