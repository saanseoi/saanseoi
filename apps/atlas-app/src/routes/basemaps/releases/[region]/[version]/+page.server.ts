import { routingReleaseSchema } from '#lib/registry/routingRelease.js'
import { eq, metaBasemapReleaseStats } from '@repo/db'
import { getMetaDb } from '#lib/registry/server.js'
import { getRegistryAccessMetrics } from '#lib/registry/accessMetrics.js'
import { error } from '@sveltejs/kit'
import { parseVersions } from '@repo/basemap'
import { basemapManifestSchema } from '#lib/registry/basemapRelease.js'
import type { PageServerLoad } from './$types'

const origin = 'https://tiles.saanseoi.hk'
export const load = (async ({ params, fetch }) => {
  const { region, version } = params
  if (!['hk', 'mo', 'gba'].includes(region) || !/^\d{4}-\d{2}-\d{2}$/.test(version))
    error(404, 'Basemap release not found.')
  const manifestUrl = `${origin}/releases/${region}/${version}.json`
  async function manifest(date: string) {
    const response = await fetch(`${origin}/releases/${region}/${date}.json`, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok)
      error(response.status === 404 ? 404 : 502, 'Basemap manifest unavailable.')
    const parsed = basemapManifestSchema.safeParse(await response.json())
    if (
      !parsed.success ||
      parsed.data.region.code !== region ||
      parsed.data.release.version !== date
    )
      error(502, 'Invalid basemap manifest.')
    return parsed.data
  }
  const [current, catalogue] = await Promise.all([
    manifest(version),
    fetch(`${origin}/${region}/versions.json`, {
      headers: { Origin: 'https://viewer.saanseoi.hk' },
      signal: AbortSignal.timeout(10_000),
    })
      .then(async response => {
        if (!response.ok) throw new Error('Catalogue unavailable')
        return parseVersions(await response.json()).versions
      })
      .catch(() => null),
  ])
  const versions = [...new Set([...(catalogue ?? []), version])].sort().reverse()
  const previousVersion = catalogue
    ? (versions[versions.indexOf(version) + 1] ?? null)
    : null
  let previous = null
  if (previousVersion) previous = await manifest(previousVersion).catch(() => null)
  const routing = await fetch(`${origin}/routing/${region}/${version}.json`, {
    signal: AbortSignal.timeout(10_000),
  })
    .then(async response => {
      if (!response.ok) return null
      const parsed = routingReleaseSchema.safeParse(await response.json())
      return parsed.success &&
        parsed.data.region === region &&
        parsed.data.version === version
        ? parsed.data
        : null
    })
    .catch(() => null)
  const db = getMetaDb()
  const [storedStats, accessMetrics] = await Promise.all([
    db
      .select()
      .from(metaBasemapReleaseStats)
      .where(eq(metaBasemapReleaseStats.id, `${region}/${version}`))
      .get()
      .catch(() => null),
    getRegistryAccessMetrics(db, 'basemap_release', `${region}/${version}`),
  ])
  const statistics =
    storedStats && storedStats.archiveSha256 === current.release.archive.sha256
      ? storedStats.statistics
      : null
  if (!current.release.schema && statistics) current.release.schema = statistics.schema
  return {
    statistics,
    routing,
    accessMetrics,
    region,
    version,
    manifestUrl,
    current,
    previous,
    previousVersion,
    versions,
    catalogueAvailable: catalogue !== null,
  }
}) satisfies PageServerLoad
