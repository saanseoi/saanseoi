import {
  and,
  createMetaDb,
  desc,
  eq,
  inArray,
  isNull,
  metaApiReleaseSets,
  metaApiVersions,
  metaDatasets,
  metaPublishers,
  metaSourceReleases,
} from '@repo/db'
import { getRequestEvent } from '$app/server'
import type { SitemapEntry } from './sitemap.js'

const BASEMAP_TILE_ORIGIN = 'https://tiles.saanseoi.hk'
const BASEMAP_VIEWER_ORIGIN = 'https://viewer.saanseoi.hk'
const BASEMAP_REGIONS = ['gba', 'hk', 'mo'] as const

const STATIC_PATHS = [
  '/',
  '/data',
  '/sources',
  '/docs',
  '/docs/glossary',
  '/guides',
  '/guides/create-a-map',
  '/guides/download-dataset',
  '/guides/use-the-api',
  '/guides/api-keys',
  '/themes',
  '/manifesto',
  '/publishers',
  '/policy/privacy',
  '/policy/terms',
  '/policy/fair-use',
  '/policy/accessibility',
]

const encodePathSegment = (value: string) => encodeURIComponent(value)

const normaliseLastmod = (value: string | null | undefined) => {
  if (!value) return undefined
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString()
}

async function getBasemapEntries(
  fetch: typeof globalThis.fetch,
): Promise<SitemapEntry[]> {
  const entries = await Promise.all(
    BASEMAP_REGIONS.map(async region => {
      try {
        const response = await fetch(`${BASEMAP_TILE_ORIGIN}/${region}/versions.json`, {
          headers: { Accept: 'application/json', Origin: BASEMAP_VIEWER_ORIGIN },
        })
        if (!response.ok) return []

        const value = (await response.json()) as {
          versions?: Array<{ version?: unknown; createdAt?: unknown }>
        }

        return (value.versions ?? [])
          .filter(
            (version): version is { version: string; createdAt?: string } =>
              typeof version.version === 'string' &&
              /^\d{4}-\d{2}-\d{2}$/.test(version.version),
          )
          .map(version => ({
            path: `/basemaps/releases/${region}/${encodePathSegment(version.version)}`,
            lastmod: normaliseLastmod(version.createdAt),
          }))
      } catch {
        return []
      }
    }),
  )

  return entries.flat()
}

export async function getSitemapEntries(): Promise<SitemapEntry[]> {
  const event = getRequestEvent()
  const binding = event.platform?.env.DB_META
  if (!binding) throw new Error('D1 binding "DB_META" not found.')
  const db = createMetaDb(binding)

  const [publishers, datasets, sourceReleases, apiVersions, apiReleases, basemaps] =
    await Promise.all([
      db
        .select({
          id: metaPublishers.id,
          code: metaPublishers.code,
          parentPublisherId: metaPublishers.parentPublisherId,
          updatedAt: metaPublishers.updatedAt,
        })
        .from(metaPublishers)
        .orderBy(metaPublishers.code)
        .all(),
      db.select({ publisherId: metaDatasets.publisherId }).from(metaDatasets).all(),
      db
        .select({
          datasetCode: metaDatasets.code,
          releaseCode: metaSourceReleases.code,
          publicationDate: metaSourceReleases.publicationDate,
          updatedAt: metaSourceReleases.updatedAt,
        })
        .from(metaSourceReleases)
        .innerJoin(metaDatasets, eq(metaSourceReleases.datasetId, metaDatasets.id))
        .where(
          and(
            inArray(metaSourceReleases.status, ['published', 'superseded']),
            isNull(metaSourceReleases.revokedAt),
          ),
        )
        .all(),
      db
        .select({
          id: metaApiVersions.id,
          familyType: metaApiVersions.familyType,
        })
        .from(metaApiVersions)
        .where(inArray(metaApiVersions.status, ['current', 'deprecated', 'retired']))
        .orderBy(desc(metaApiVersions.publishedAt), desc(metaApiVersions.createdAt))
        .all(),
      db
        .select({
          apiVersionId: metaApiReleaseSets.apiVersionId,
          familyType: metaApiVersions.familyType,
          releaseCode: metaApiReleaseSets.code,
          publishedAt: metaApiReleaseSets.publishedAt,
          updatedAt: metaApiReleaseSets.updatedAt,
        })
        .from(metaApiReleaseSets)
        .innerJoin(
          metaApiVersions,
          eq(metaApiReleaseSets.apiVersionId, metaApiVersions.id),
        )
        .where(inArray(metaApiReleaseSets.status, ['current', 'archived']))
        .all(),
      getBasemapEntries(event.fetch),
    ])

  const publisherById = new Map(publishers.map(publisher => [publisher.id, publisher]))
  const publisherIds = new Set(datasets.map(dataset => dataset.publisherId))
  const includedPublisherIds = new Set<string>()
  for (const publisherId of publisherIds) {
    let publisher = publisherById.get(publisherId)
    while (publisher && !includedPublisherIds.has(publisher.id)) {
      includedPublisherIds.add(publisher.id)
      publisher = publisher.parentPublisherId
        ? publisherById.get(publisher.parentPublisherId)
        : undefined
    }
  }

  const apiVersionByFamily = new Map<string, string>()
  for (const apiVersion of apiVersions) {
    if (!apiVersionByFamily.has(apiVersion.familyType)) {
      apiVersionByFamily.set(apiVersion.familyType, apiVersion.id)
    }
  }
  const selectedApiVersionIds = new Set(apiVersionByFamily.values())

  return [
    ...STATIC_PATHS.map(path => ({ path })),
    ...publishers
      .filter(publisher => includedPublisherIds.has(publisher.id))
      .map(publisher => ({
        path: `/publishers/${encodePathSegment(publisher.code)}`,
        lastmod: normaliseLastmod(publisher.updatedAt),
      })),
    ...sourceReleases.map(release => ({
      path: `/sources/${encodePathSegment(release.datasetCode)}/${encodePathSegment(release.releaseCode)}`,
      lastmod: normaliseLastmod(release.updatedAt ?? release.publicationDate),
    })),
    ...apiReleases
      .filter(release => selectedApiVersionIds.has(release.apiVersionId))
      .map(release => ({
        path: `/apis/${encodePathSegment(release.familyType)}/${encodePathSegment(release.releaseCode)}`,
        lastmod: normaliseLastmod(release.updatedAt ?? release.publishedAt),
      })),
    ...basemaps,
  ]
}
