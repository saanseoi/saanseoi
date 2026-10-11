import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { asyncBufferFromFile, parquetReadObjects } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'
import { unzipSync, strFromU8 } from 'fflate'
import { readLandsdPlaceNameArchive } from '../../sources/hkgov/landsd/landsdPlaceName'
import { readProtomapsSourceArchive } from './protomapsSourceArchive'
import type { CuratedSourceRelease } from './archiveInput'

export type ReviewSourcePin = CuratedSourceRelease & { assetId?: string }
export type ReviewArchiveOptions = {
  root: string
  apiBaseUrl?: string
  archiveBaseUrl?: string
  paths?: Record<string, string>
  fetch?: (url: string, init?: RequestInit) => Promise<Response>
}
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

/** Every transport resolves the same bytes. An unavailable API never selects another edition. */
export async function loadPinnedReviewArchive(
  pin: ReviewSourcePin,
  options: ReviewArchiveOptions,
) {
  if (
    !/^[a-f0-9]{64}$/.test(pin.contentHash) ||
    !pin.rawObjectKey.startsWith('by-source/') ||
    pin.rawObjectKey.split('/').includes('..')
  )
    throw Error(`Invalid review archive pin: ${pin.releaseCode}`)
  const cache = resolve(
    options.root,
    '.local/division-review/archives',
    pin.contentHash,
  )
  const request = options.fetch ?? fetch
  const verify = (bytes: Uint8Array) => {
    if (sha256(bytes) !== pin.contentHash)
      throw Error(`Review archive hash mismatch: ${pin.releaseCode}`)
    return bytes
  }
  const retain = async (bytes: Uint8Array) => {
    verify(bytes)
    await mkdir(resolve(options.root, '.local/division-review/archives'), {
      recursive: true,
    })
    const temporary = `${cache}.${randomUUID()}.tmp`
    try {
      await writeFile(temporary, bytes)
      await rename(temporary, cache)
    } finally {
      await rm(temporary, { force: true })
    }
    return cache
  }
  if (options.apiBaseUrl && pin.assetId) {
    let response: Response | undefined
    try {
      response = await request(
        `${options.apiBaseUrl.replace(/\/$/, '')}/v0.1/assets/${encodeURIComponent(pin.assetId)}`,
        { signal: AbortSignal.timeout(10000) },
      )
    } catch {
      /* Try the exact retained local input. */
    }
    if (response?.ok) return retain(new Uint8Array(await response.arrayBuffer()))
  }
  const candidates = [
    options.paths?.[pin.releaseCode],
    options.paths?.[`${pin.datasetCode}:${pin.resourceType}`],
    cache,
    resolve(
      options.root,
      '.local/harbour-sql/releases/local',
      pin.releaseCode,
      'objects',
      pin.rawObjectKey,
    ),
    pin.datasetCode.startsWith('ds-hk-overture-')
      ? resolve(
          options.root,
          '.local/harbour-sql/releases/local',
          pin.releaseCode,
          'objects/hk/overture',
          pin.sourceVersion,
          pin.resourceType === 'divisionArea'
            ? 'division-area.parquet'
            : 'division.parquet',
        )
      : undefined,
    pin.datasetCode === 'ds-hk-protomaps-island'
      ? resolve(
          options.root,
          '.local/protomaps-islands',
          pin.sourceVersion,
          `dr-hk-protomaps-island-${pin.sourceVersion}.zip`,
        )
      : undefined,
    pin.datasetCode === 'ds-hk-hkgov-rvd-division'
      ? resolve(options.root, '.local/rvd-review/ingested', `${pin.releaseCode}.zip`)
      : undefined,
  ].filter((path): path is string => Boolean(path))
  for (const path of candidates) {
    let bytes: Uint8Array
    try {
      bytes = await readFile(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
    verify(bytes)
    return path === cache ? cache : retain(bytes)
  }
  if (options.archiveBaseUrl) {
    const response = await request(
      `${options.archiveBaseUrl.replace(/\/$/, '')}/${pin.rawObjectKey.split('/').map(encodeURIComponent).join('/')}`,
      { signal: AbortSignal.timeout(60000) },
    )
    if (!response.ok)
      throw Error(`Review archive unavailable: ${pin.releaseCode} (${response.status})`)
    return retain(new Uint8Array(await response.arrayBuffer()))
  }
  throw Error(
    `Missing pinned review archive ${pin.releaseCode} (${pin.contentHash}); provide a local path, a registered asset API URL, or an R2 archive base URL.`,
  )
}

export async function readReviewSource(
  pin: ReviewSourcePin,
  options: ReviewArchiveOptions,
  view: 'islands' | 'land-mask' = 'islands',
): Promise<any[]> {
  const path = await loadPinnedReviewArchive(pin, options)
  if (pin.datasetCode.startsWith('ds-hk-overture-'))
    return parquetReadObjects({ file: await asyncBufferFromFile(path), compressors })
  const bytes = new Uint8Array(await readFile(path))
  if (pin.datasetCode === 'ds-hk-hkgov-landsd-division')
    return readLandsdPlaceNameArchive(bytes)
  if (pin.datasetCode === 'ds-hk-protomaps-island') {
    const source = readProtomapsSourceArchive(bytes)
    if (source.manifest.sourceVersion !== pin.sourceVersion)
      throw Error(`Review archive manifest mismatch: ${pin.releaseCode}`)
    if (view === 'land-mask') return source.landMask
    const selections = new Map(
      source.islandSelections.map(selection => [selection.sourceRecordId, selection]),
    )
    return source.islands.map(row => ({
      ...row,
      geometrySource: selections.get(row.sourceRecordId),
    }))
  }
  const files = unzipSync(bytes)
  if (pin.datasetCode === 'ds-hk-hkgov-rvd-division')
    return JSON.parse(strFromU8(files['records.json']!)).records
  const manifest = JSON.parse(strFromU8(files['manifest.json']!))
  if (
    manifest.datasetCode !== pin.datasetCode ||
    manifest.sourceVersion !== pin.sourceVersion
  )
    throw Error(`Review archive manifest mismatch: ${pin.releaseCode}`)
  return JSON.parse(strFromU8(files['records.json']!))
}
