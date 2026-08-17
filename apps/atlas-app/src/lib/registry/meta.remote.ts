import {
  getRegistryApi,
  getRegistrySourceRelease,
  getRegistrySourceReleaseShell,
  getRegistrySource,
  getRegistrySourcePublisher,
  listRegistryApiCompositions,
  listRegistrySourcesPage,
  listRegistrySources,
  getRegistryReleaseLifecycleScope,
  resolveRegistryReleaseDisplayStatus,
} from '@repo/core/db/metaRegistry'
import {
  and,
  createCurrentDb,
  createMetaDb,
  currentSchema,
  desc,
  eq,
  inArray,
  metaApiReleaseSets,
  metaApiVersions,
  metaAssets,
  metaDatasets,
  metaReleases,
  metaSourceReleases,
  ingestRuns,
  stats,
  sql,
} from '@repo/db'
import { error, redirect } from '@sveltejs/kit'
import { dev } from '$app/env'
import { getRequestEvent, query } from '$app/server'
import { z } from 'zod'

import { runWithD1ReadRetry } from '../server/d1'
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
  releases: Array<
    Pick<DataPageRelease, 'code' | 'createdAt' | 'displayStatus' | 'publishedAt'>
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
  const releases = await Promise.all(
    Object.entries(BASEMAP_REGIONS).map(async ([code, region]) => {
      try {
        const response = await fetch(`${BASEMAP_TILE_ORIGIN}/${code}/versions.json`, {
          headers: { Accept: 'application/json', Origin: BASEMAP_VIEWER_ORIGIN },
        })
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

  return {
    domainsByApiFamily,
    sources: (sources as unknown as RegistrySource[]).map(toSourcesPageSource),
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
    if (dev) console.info('[source-release-shell]', timings)

    const {
      timings: _timings,
      selectedReleaseCode: _selectedReleaseCode,
      ...source
    } = shell
    return {
      source: source as RegistrySource,
      version: version as SourceVersion,
      timings,
    }
  },
)

export const getSourceReleaseContentData = query(
  sourceReleaseContentSchema,
  async ({ datasetCode, releaseCode, previousReleaseCode }) => {
    const startedAt = performance.now()
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

    const result = {
      version: archive
        ? { ...version, sourceArchiveAssetId: archive.assetId }
        : version,
      previousNotes,
    } as { version: SourceVersion; previousNotes: string | null }

    if (dev)
      console.info('[source-release-content]', {
        content: performance.now() - startedAt,
      })

    return result
  },
)

const DISTRICT_COVERAGE_MAP_VARIANT = 'hkgov-censtatd:2021:simplified'
const districtMapLocaleSchema = z.enum(['en', 'zh-Hant', 'zh-Hans'])
const districtGeometryNamesSchema = z.object({
  districtIds: z.array(z.string().trim().min(1).max(200)).max(10_000),
  locale: districtMapLocaleSchema,
})
const D1_DISTRICT_NAME_BATCH_SIZE = 98
const UNOFFICIAL_DISTRICT_IDS = new Set([
  // Overture's Lok Ma Chau Loop is a named geographic area, not an official
  // Hong Kong district. Its localised names remain canonical division data.
  '222b7818-970a-491d-98b6-b88d8c6f0161',
])

/**
 * The district-coverage map uses the C&SD 2021 Census District Boundary's
 * simplified display geometry. Do not substitute HAD or source-precision
 * geometry here: the choropleth must remain a lightweight Census map.
 */
export const getDistrictCoverageMapData = query(
  districtMapLocaleSchema,
  async locale => {
    const { divisionAreas, divisionsI18n } = currentSchema
    const i18nLocale = locale.toLowerCase()
    const rows = await getCurrentDb()
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

    return ids.map(divisionId => ({
      divisionId,
      name: localisedNames?.get(divisionId) ?? englishNames?.get(divisionId) ?? null,
      unofficial: UNOFFICIAL_DISTRICT_IDS.has(divisionId),
    }))
  },
)

export const getPublisherPageData = query(registryCodeSchema, async publisherCode => {
  const db = getMetaDb()
  const [registryPublisher, registrySources] = await Promise.all([
    getRegistrySourcePublisher(db, publisherCode),
    listRegistrySources(db),
  ])
  const publisher = registryPublisher as RegistryPublisher | null
  const sources = registrySources as RegistrySource[]

  if (!publisher) error(404, 'Publisher not found.')

  return {
    publisher,
    sources: sources.filter(source => source.publisherId === publisher.id),
  }
})

async function loadDataReleasesPage(offset = 0) {
  const db = getMetaDb()
  const [lifecycleRows, releases, sourceOnlyReleases] = await Promise.all([
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
    db
      .select({
        code: metaReleases.code,
        cohortKey: metaReleases.cohortKey,
        createdAt: metaReleases.createdAt,
        datasetCode: metaDatasets.code,
        id: metaReleases.id,
        primaryRecordCount: sql<
          number | null
        >`cast(json_extract(${ingestRuns.stats}, '$.importedRows') as integer)`,
        publishedAt: metaReleases.ingestedAt,
      })
      .from(metaReleases)
      .innerJoin(metaDatasets, eq(metaReleases.datasetId, metaDatasets.id))
      .leftJoin(
        ingestRuns,
        and(
          eq(ingestRuns.releaseId, metaReleases.id),
          eq(ingestRuns.phase, 'processDataset'),
          eq(ingestRuns.status, 'completed'),
        ),
      )
      .where(
        and(
          eq(metaReleases.resourceType, 'divisionStatistic'),
          eq(metaReleases.status, 'published'),
        ),
      )
      .orderBy(desc(metaReleases.ingestedAt), desc(metaReleases.id))
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
  const sourceOnlyCohorts = new Set(
    sourceOnlyReleases.flatMap(release =>
      release.cohortKey ? [release.cohortKey] : [],
    ),
  )
  const sourceOnlyDataReleases = sourceOnlyReleases.map(
    release =>
      ({
        apiFamily: 'stats',
        code: release.code,
        cohortKey: release.cohortKey,
        createdAt: release.createdAt,
        displayCode: release.cohortKey ?? release.code,
        displayStatus: 'current',
        href: `/sources/${release.datasetCode}/${release.code}`,
        id: release.id,
        primaryRecordCount: release.primaryRecordCount,
        publishedAt: release.publishedAt,
        schemaVersion: 'sv-division-v1',
        status: 'published',
      }) satisfies DataPageRelease,
  )
  const mergedReleases = [
    ...apiReleases.filter(
      release =>
        !(
          release.apiFamily === 'stats' &&
          release.status === 'draft' &&
          sourceOnlyCohorts.has(release.cohortKey ?? '')
        ),
    ),
    ...sourceOnlyDataReleases,
  ].sort(
    (left, right) =>
      (right.publishedAt ?? right.createdAt).localeCompare(
        left.publishedAt ?? left.createdAt,
      ) || right.id.localeCompare(left.id),
  )

  return {
    releases: mergedReleases.slice(0, DATA_RELEASES_PAGE_SIZE),
    hasMore: mergedReleases.length > DATA_RELEASES_PAGE_SIZE,
    nextOffset: offset + Math.min(releases.length, DATA_RELEASES_PAGE_SIZE),
  }
}

async function loadDataPageApis(): Promise<DataPageApi[]> {
  const db = getMetaDb()
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
    const candidates = releases
      .filter(release => release.apiVersionId === api.id)
      .map(release => ({
        code: release.code,
        createdAt: release.createdAt,
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

    return { ...api, releases: latest ? [latest] : [] }
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
    return await runWithD1ReadRetry(loadDataPageApiData)
  } catch (error) {
    // An import can briefly expose the app before both D1 databases have their
    // registry tables. Render the empty registry state until the upload finishes.
    if (isRegistryBootstrapError(error)) {
      return {
        releases: [] as DataPageRelease[],
        hasMore: false,
        nextOffset: 0,
        apis: [] as DataPageApi[],
      }
    }
    throw error
  }
})

export const getDataPageBasemapData = query(async () => ({
  basemapReleases: await loadBasemapReleases(),
}))

export const getDataReleasesPageData = query(releasePageSchema, async ({ offset }) => {
  try {
    return await runWithD1ReadRetry(() => loadDataReleasesPage(offset))
  } catch (error) {
    if (isRegistryBootstrapError(error)) {
      return {
        releases: [] as DataPageRelease[],
        hasMore: false,
        nextOffset: offset,
      }
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

  return { api, release: null }
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
          releaseCode: metaReleases.code,
        })
        .from(metaAssets)
        .innerJoin(metaReleases, eq(metaAssets.releaseId, metaReleases.id))
        .where(
          and(
            eq(metaAssets.role, 'sourceArchive'),
            inArray(metaReleases.code, sourceReleaseCodes),
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
          releaseCode: metaReleases.code,
          value: stats.value,
        })
        .from(stats)
        .innerJoin(metaReleases, eq(stats.releaseId, metaReleases.id))
        .where(
          and(
            inArray(metaReleases.code, sourceReleaseCodes),
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

  return {
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
})
