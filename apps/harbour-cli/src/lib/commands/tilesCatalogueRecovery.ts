import { readFile, rm } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { sha256, writeDeliveryFile } from '../pipeline/local/sqlDeliveryFiles.ts'
import type { Region, VersionEntry, VersionsIndex } from './tilesTypes.ts'

export type TilesCatalogueIntent = {
  region: Region
  entry: VersionEntry
  promoteLatest: boolean
  previousLatest: VersionEntry | null
}

export async function writeTilesCatalogueIntent(
  path: string,
  intent: TilesCatalogueIntent,
) {
  const payload = JSON.stringify(intent)
  await writeDeliveryFile(
    dirname(path),
    basename(path),
    JSON.stringify({ payload, checksum: sha256(payload) }),
  )
}

export async function readTilesCatalogueIntent(
  path: string,
): Promise<TilesCatalogueIntent | null> {
  const text = await readFile(path, 'utf8').catch(error => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (text === null) return null
  const value = JSON.parse(text) as { payload: string; checksum: string }
  if (typeof value.payload !== 'string' || sha256(value.payload) !== value.checksum)
    throw new Error('Basemap catalogue completion intent checksum differs.')
  const intent = JSON.parse(value.payload) as TilesCatalogueIntent
  if (
    !intent.region?.code ||
    !intent.entry?.sha256 ||
    typeof intent.promoteLatest !== 'boolean'
  )
    throw new Error('Invalid Basemap catalogue completion intent.')
  return intent
}

export function sameTilesVersion(
  a: VersionEntry | null | undefined,
  b: VersionEntry | null | undefined,
) {
  if (!a || !b) return !a && !b
  return (
    ['version', 'tileset', 'key', 'manifestKey', 'sha256', 'size', 'createdAt'] as const
  ).every(key => a[key] === b[key])
}

/** Preserve unrelated regions and refuse to supersede a publication made after this intent. */
export function applyTilesCatalogueIntent(
  index: VersionsIndex,
  intent: TilesCatalogueIntent,
  versionsKey: string,
): VersionsIndex {
  const previous = index.regions[intent.region.code]
  if (
    intent.promoteLatest &&
    !sameTilesVersion(previous?.latest, intent.previousLatest) &&
    !sameTilesVersion(previous?.latest, intent.entry)
  )
    throw new Error(
      'Basemap latest selection changed after publication started; refusing catalogue replay.',
    )
  return {
    ...index,
    updatedAt: new Date().toISOString(),
    regions: {
      ...index.regions,
      [intent.region.code]: {
        name: intent.region.name,
        versionsKey,
        ...(intent.promoteLatest
          ? { latest: intent.entry }
          : previous?.latest
            ? { latest: previous.latest }
            : {}),
      },
    },
  }
}

export async function completeTilesCatalogueIntent(
  path: string,
  complete: (intent: TilesCatalogueIntent) => Promise<void>,
) {
  const intent = await readTilesCatalogueIntent(path)
  if (!intent) throw new Error('Missing Basemap catalogue completion intent.')
  await complete(intent)
  await rm(path)
}
