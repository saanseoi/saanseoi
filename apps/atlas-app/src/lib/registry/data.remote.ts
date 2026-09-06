import {
  getRegistryReleaseLifecycleScope,
  resolveRegistryReleaseDisplayStatus,
} from '@repo/core/db/metaRegistry'
import {
  desc,
  eq,
  inArray,
  metaApiComposition,
  metaApiCompositionMembers,
  metaApiReleaseSets,
  metaApiVersions,
  sql,
  stats,
} from '@repo/db'
import { getRequestEvent, query } from '$app/server'
import { z } from 'zod'

import { runWithD1ReadRetry } from '../server/d1'
import { parseBasemapVersions } from './basemapVersions'
import { getMetaDb, isRegistryBootstrapError, recordRegistryDataLoad } from './server'
import { CURRENT_BASEMAP_SCHEMA_VERSION } from './types'
import type { ApiRelease, BasemapRelease, RegistryApi } from './types'

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
        const entries = parseBasemapVersions(value.versions)
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
