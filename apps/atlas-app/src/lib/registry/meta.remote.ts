import {
  getRegistryApi,
  getRegistrySource,
  getRegistrySourcePublisher,
  listRegistryApis,
  listRegistryReleases,
  listRegistrySources,
} from '@repo/core/db/metaRegistry'
import {
  and,
  createCurrentDb,
  createMetaDb,
  currentSchema,
  desc,
  eq,
  inArray,
  metaAssets,
  metaReleases,
  sql,
} from '@repo/db'
import { error, redirect } from '@sveltejs/kit'
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
    listRegistrySources(db, 200),
    listRegistryApis(db, 100),
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
    sources: (sources as RegistrySource[]).map(toSourcesPageSource),
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

export const getSourceDatasetPageData = query(registryCodeSchema, async datasetCode => {
  const db = getMetaDb()
  const source = (await getRegistrySource(db, datasetCode)) as RegistrySource | null
  if (!source) error(404, 'Source dataset not found.')

  const archives = await db
    .select({
      assetId: metaAssets.id,
      manifest: metaAssets.manifest,
      releaseId: metaAssets.releaseId,
    })
    .from(metaAssets)
    .where(
      and(
        eq(metaAssets.role, 'sourceArchive'),
        sql`json_extract(${metaAssets.manifest}, '$.dataset.code') = ${source.code}`,
      ),
    )
    .orderBy(desc(metaAssets.retrievedAt))
    .all()
  const assetIdByReleaseId = new Map(
    archives.flatMap(archive =>
      archive.releaseId ? [[archive.releaseId, archive.assetId] as const] : [],
    ),
  )
  const assetIdByReleaseSlot = new Map(
    archives.flatMap(archive => {
      const releaseSlot = getSourceArchiveReleaseSlot(archive.manifest)
      return releaseSlot ? [[releaseSlot, archive.assetId] as const] : []
    }),
  )

  return {
    ...source,
    sourceVersions: source.sourceVersions?.map(version => {
      const sourceArchiveAssetId =
        assetIdByReleaseId.get(version.id) ??
        assetIdByReleaseSlot.get(version.sourceVersion)
      return sourceArchiveAssetId ? { ...version, sourceArchiveAssetId } : version
    }),
  }
})

function getSourceArchiveReleaseSlot(manifest: unknown) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return null
  }
  const provenance = (manifest as { provenance?: unknown }).provenance
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) {
    return null
  }
  const releaseSlot = (provenance as { releaseSlot?: unknown }).releaseSlot
  return typeof releaseSlot === 'string' && /^\d{4}-Q[1-4]$/.test(releaseSlot)
    ? releaseSlot
    : null
}

const DISTRICT_COVERAGE_MAP_VARIANT = 'hkgov-censtatd:2021:simplified'
const districtMapLocaleSchema = z.enum(['en', 'zh-Hant', 'zh-Hans'])

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
  const releases = await listRegistryReleases(db, DATA_RELEASES_PAGE_SIZE + 1, offset)

  const [addressCounts, divisionCounts] = await Promise.all([
    getCurrentDb()
      .select({
        count: sql<number>`count(*)`,
        snapshotId: currentSchema.address2d.snapshotId,
      })
      .from(currentSchema.address2d)
      .groupBy(currentSchema.address2d.snapshotId)
      .all(),
    getCurrentDb()
      .select({
        count: sql<number>`count(*)`,
        snapshotId: currentSchema.divisions.snapshotId,
      })
      .from(currentSchema.divisions)
      .groupBy(currentSchema.divisions.snapshotId)
      .all(),
  ])
  const countsBySnapshot = new Map(
    [...addressCounts, ...divisionCounts].map(row => [
      row.snapshotId,
      Number(row.count),
    ]),
  )
  return {
    releases: releases.slice(0, DATA_RELEASES_PAGE_SIZE).map(release => {
      // API release-set stats are immutable presentation data for this exact
      // release. Prefer them over DB_CURRENT: that database only retains the
      // active snapshot, so it cannot count a revised or superseded release.
      const recordedCount = release.stats.find(
        stat =>
          stat.dimension === 'records' &&
          stat.metric === 'count' &&
          stat.metricUnit === 'count' &&
          stat.groupBy === null &&
          stat.groupValue === null,
      )?.value
      const primaryResourceType =
        release.apiFamily === 'addresses'
          ? 'address'
          : release.apiFamily === 'divisions'
            ? 'division'
            : null
      const primarySnapshot = release.apiReleaseSetSnapshots?.find(
        releaseSnapshot =>
          releaseSnapshot.snapshot.resourceType === primaryResourceType,
      )

      return {
        ...release,
        primaryRecordCount:
          recordedCount ??
          (primarySnapshot === undefined
            ? null
            : (countsBySnapshot.get(primarySnapshot.snapshotId) ?? null)),
      }
    }) as ApiRelease[],
    hasMore: releases.length > DATA_RELEASES_PAGE_SIZE,
    nextOffset: offset + Math.min(releases.length, DATA_RELEASES_PAGE_SIZE),
  }
}

async function loadDataPageData() {
  const [releasePage, apis, basemapReleases] = await Promise.all([
    loadDataReleasesPage(),
    listRegistryApis(getMetaDb(), 100),
    loadBasemapReleases(),
  ])

  return {
    ...releasePage,
    apis: apis as RegistryApi[],
    basemapReleases,
  }
}

export const getDataPageData = query(async () => {
  try {
    return await runWithD1ReadRetry(loadDataPageData)
  } catch (error) {
    // An import can briefly expose the app before both D1 databases have their
    // registry tables. Render the empty registry state until the upload finishes.
    if (isRegistryBootstrapError(error)) {
      return {
        releases: [] as ApiRelease[],
        hasMore: false,
        nextOffset: 0,
        apis: [] as RegistryApi[],
        basemapReleases: await loadBasemapReleases(),
      }
    }
    throw error
  }
})

export const getDataReleasesPageData = query(releasePageSchema, async ({ offset }) => {
  try {
    return await runWithD1ReadRetry(() => loadDataReleasesPage(offset))
  } catch (error) {
    if (isRegistryBootstrapError(error)) {
      return {
        releases: [] as ApiRelease[],
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

  return {
    ...api,
    releases: api.releases?.map(release => ({
      ...release,
      contributingSources: release.contributingSources?.map(source => {
        const archive = archiveByReleaseCode.get(source.sourceReleaseCode)
        return archive ? { ...source, sourceArchive: archive } : source
      }),
    })),
  }
})
