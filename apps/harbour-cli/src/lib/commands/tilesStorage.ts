import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type {
  PreparedSource,
  Region,
  RegionCode,
  RegionVersions,
  RegionsIndex,
  VersionEntry,
  VersionsIndex,
} from './tilesTypes.ts'
import {
  BUCKET,
  GUANGDONG_EXTRACT_URL,
  PREFIX,
  SOURCE_BUCKET,
  TILES_ROOT,
} from './tilesConfig.ts'
import { run, runQuiet, wranglerCommand } from './tilesExecution.ts'
import { downloadTilesObject } from './tilesObjectRead.ts'

export async function archiveMetadata(path: string) {
  const before = await stat(path)
  const hash = createHash('sha256')
  let size = 0
  for await (const chunk of createReadStream(path)) {
    size += chunk.length
    hash.update(chunk)
  }
  const after = await stat(path)
  if (
    size !== before.size ||
    after.size !== before.size ||
    after.ino !== before.ino ||
    after.dev !== before.dev ||
    after.mtimeMs !== before.mtimeMs ||
    after.ctimeMs !== before.ctimeMs
  )
    throw new Error('Basemap source changed while calculating archive metadata.')
  return { size, sha256: hash.digest('hex') }
}

export function sourceArchiveKey(version: string) {
  return `osm/geofabrik/guangdong/${version}.osm.pbf`
}

export async function archiveGuangdongSource(
  path: string,
  version: string,
): Promise<NonNullable<PreparedSource['sourceArchive']>> {
  const metadata = await archiveMetadata(path)
  await putSourceObject(sourceArchiveKey(version), path)
  return {
    bucket: SOURCE_BUCKET,
    key: sourceArchiveKey(version),
    ...metadata,
    sourceUrl: GUANGDONG_EXTRACT_URL,
  }
}

export async function readRegionVersions(region: Region): Promise<RegionVersions> {
  const value = await getJson<RegionVersions>(objectKey(region.code, 'versions.json'))
  return (
    value ?? {
      schemaVersion: 1,
      region: { code: region.code, name: region.name, description: region.description },
      updatedAt: new Date(0).toISOString(),
      versions: [],
    }
  )
}

export async function readRegionsIndex(): Promise<RegionsIndex> {
  return (
    (await getJson<RegionsIndex>(`${PREFIX}/regions.json`)) ?? {
      schemaVersion: 1,
      updatedAt: new Date(0).toISOString(),
      regions: [],
    }
  )
}

export async function readVersionsIndex(): Promise<VersionsIndex> {
  return (
    (await getJson<VersionsIndex>(`${PREFIX}/versions.json`)) ?? {
      schemaVersion: 1,
      updatedAt: new Date(0).toISOString(),
      regions: {},
    }
  )
}

export async function getJson<T>(key: string): Promise<T | undefined> {
  const path = resolve(TILES_ROOT, 'catalogue', key.replaceAll('/', '__'))
  await mkdir(resolve(path, '..'), { recursive: true })
  if (!(await getObject(BUCKET, key, path))) return undefined
  return JSON.parse(await readFile(path, 'utf8')) as T
}

export async function getObject(
  bucket: string,
  key: string,
  path: string,
): Promise<boolean> {
  return downloadTilesObject(path, temporaryPath =>
    runQuiet([
      ...wranglerCommand(),
      'r2',
      'object',
      'get',
      `${bucket}/${key}`,
      '--remote',
      '--file',
      temporaryPath,
    ]),
  )
}

export async function putObject(key: string, file: string, contentType: string) {
  return putBucketObject(BUCKET, key, file, contentType)
}

async function putSourceObject(key: string, file: string) {
  return putBucketObject(SOURCE_BUCKET, key, file, 'application/x-protobuf')
}

async function putBucketObject(
  bucket: string,
  key: string,
  file: string,
  contentType: string,
) {
  await run([
    ...wranglerCommand(),
    'r2',
    'object',
    'put',
    `${bucket}/${key}`,
    '--remote',
    '--file',
    file,
    '--content-type',
    contentType,
  ])
}

export async function deleteObject(key: string) {
  await run([
    ...wranglerCommand(),
    'r2',
    'object',
    'delete',
    `${BUCKET}/${key}`,
    '--remote',
  ])
}

/** Invalidate CDN and Worker Cache API entries after changing tile artefacts. */
export async function purgeTilesHostCache() {
  const token = process.env.CLOUDFLARE_API_TOKEN
  if (!token) {
    throw new Error(
      'The release was removed from R2, but its cached URLs were not purged: CLOUDFLARE_API_TOKEN is required.',
    )
  }
  const zoneName = process.env.CLOUDFLARE_ZONE_NAME ?? 'saanseoi.hk'
  const zones = await fetch(
    `https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(zoneName)}&status=active`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const zoneResult = (await zones.json()) as {
    success?: boolean
    result?: Array<{ id?: string }>
  }
  const zoneId = zoneResult.result?.[0]?.id
  if (!zones.ok || !zoneResult.success || !zoneId) {
    throw new Error(
      `The release was removed from R2, but the ${zoneName} zone could not be resolved for cache purging.`,
    )
  }
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ hosts: ['tiles.saanseoi.hk'] }),
    },
  )
  const result = (await response.json()) as { success?: boolean }
  if (!response.ok || !result.success) {
    throw new Error(
      'The release was removed from R2, but the tiles cache could not be purged. Grant the token Zone > Cache Purge > Purge permission and retry the same tiles:retract command.',
    )
  }
}

export function mergeVersion(versions: VersionEntry[], entry: VersionEntry) {
  return [...versions.filter(version => version.version !== entry.version), entry].sort(
    (a, b) => b.version.localeCompare(a.version),
  )
}

export function mergeRegion(regions: RegionsIndex['regions'], region: Region) {
  const entry = {
    code: region.code,
    name: region.name,
    description: region.description,
    versionsKey: objectKey(region.code, 'versions.json'),
  }
  return [...regions.filter(candidate => candidate.code !== region.code), entry].sort(
    (a, b) => a.code.localeCompare(b.code),
  )
}

export function objectKey(region: RegionCode, name: string) {
  return `${PREFIX}/${region}/${name}`
}

export async function writeJson(path: string, value: unknown) {
  await mkdir(resolve(path, '..'), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
