import {
  fetchJson,
  parseCatalogue,
  parseVersions,
  tilejsonUrl,
  type Catalogue,
  type Region,
} from './catalogue'
import { parseRegionBoundary, type RegionBoundary } from './boundaries'
import { parseReleaseMetadata, type ReleaseMetadata } from './release-metadata'
import { parseTilejson, type Tilejson } from './tilejson'

export type PublishedReleases = {
  versions: string[]
  releaseMetadata: ReleaseMetadata[]
}

export type LoadedRelease = {
  url: string
  tilejson: Tilejson
  boundary: RegionBoundary | null
}

export class ReleaseRepository {
  private readonly origin: string
  private readonly timeoutMs: number
  private catalogueCache: Catalogue | null = null
  private readonly releasesCache = new Map<string, PublishedReleases>()
  private readonly releaseCache = new Map<string, LoadedRelease>()

  constructor(origin: string, timeoutMs = 10_000) {
    this.origin = new URL(origin).origin
    this.timeoutMs = timeoutMs
  }

  async getCatalogue(signal?: AbortSignal): Promise<Catalogue> {
    if (this.catalogueCache) return this.catalogueCache
    const value = parseCatalogue(
      await this.getJson(`${this.origin}/regions.json`, signal),
    )
    this.catalogueCache = value
    return value
  }

  async getReleases(region: Region, signal?: AbortSignal): Promise<PublishedReleases> {
    const cached = this.releasesCache.get(region.code)
    if (cached) return cached
    const value = await this.getJson(
      `${this.origin}/${region.code}/versions.json`,
      signal,
    )
    const releases = {
      versions: parseVersions(value).versions,
      releaseMetadata: parseReleaseMetadata(value),
    }
    this.releasesCache.set(region.code, releases)
    return releases
  }

  async getRelease(
    region: Region,
    version: string,
    signal?: AbortSignal,
  ): Promise<LoadedRelease> {
    const url = tilejsonUrl(this.origin, region, version)
    const cached = this.releaseCache.get(url)
    if (cached) return cached
    const tilejson = parseTilejson(await this.getJson(url, signal))
    const boundary = tilejson.boundary
      ? parseRegionBoundary(await this.getJsonIfAllowed(tilejson.boundary, signal))
      : null
    const release = { url, tilejson, boundary }
    this.releaseCache.set(url, release)
    return release
  }

  hasCachedReleases(): boolean {
    return this.releasesCache.size > 0
  }

  private async getJsonIfAllowed(
    url: string,
    signal?: AbortSignal,
  ): Promise<unknown | null> {
    if (!this.isAllowedUrl(url)) return null
    try {
      return await this.getJson(url, signal)
    } catch (error) {
      if (isAbort(error)) throw error
      return null
    }
  }

  private getJson(url: string, signal?: AbortSignal): Promise<unknown> {
    if (!this.isAllowedUrl(url)) throw new Error('The release URL is not allowed.')
    const requestController = new AbortController()
    const onAbort = () => requestController.abort(signal?.reason)
    if (signal?.aborted) onAbort()
    else signal?.addEventListener('abort', onAbort, { once: true })
    const timeout = globalThis.setTimeout(
      () =>
        requestController.abort(
          new Error(`Request timed out after ${this.timeoutMs} ms.`),
        ),
      this.timeoutMs,
    )

    return fetchJson(url, requestController.signal).finally(() => {
      globalThis.clearTimeout(timeout)
      signal?.removeEventListener('abort', onAbort)
    })
  }

  private isAllowedUrl(url: string): boolean {
    try {
      return new URL(url).origin === this.origin
    } catch {
      return false
    }
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
