import { strFromU8, unzipSync } from 'fflate'
import {
  protomapsCoastlineLandMask,
  resolveProtomapsIslandSelections,
  type ProtomapsIslandSelection,
  type ProtomapsSourceRecord,
} from '@repo/core/pipeline/services/sources/protomapsSourceViews'

/** One shared SOURCE payload; island membership carries references only. */
export function readProtomapsSourceArchive(bytes: Uint8Array) {
  const files = unzipSync(bytes)
  if (
    !files['manifest.json'] ||
    !files['records.json'] ||
    !files['island-selections.json']
  )
    throw Error(
      'Protomaps archive requires a shared coastline payload and island selections; prepare a new source revision.',
    )
  const manifest = JSON.parse(strFromU8(files['manifest.json']))
  const records = JSON.parse(
    strFromU8(files['records.json']),
  ) as ProtomapsSourceRecord[]
  const selections = JSON.parse(
    strFromU8(files['island-selections.json']),
  ) as ProtomapsIslandSelection[]
  if (
    manifest.schemaVersion !== 2 ||
    manifest.datasetCode !== 'ds-hk-protomaps-island' ||
    !/^\d{4}-\d{2}-\d{2}\.\d+$/.test(manifest.sourceVersion) ||
    !Array.isArray(records) ||
    !records.length ||
    !Array.isArray(selections) ||
    !selections.length ||
    records.some(
      row =>
        !row ||
        typeof row.sourceRecordId !== 'string' ||
        !row.sourceRecordId ||
        !row.properties ||
        !['osm-island', 'coastline-land'].includes(row.properties.kind) ||
        !row.sourceGeometry,
    )
  )
    throw Error('Invalid shared Protomaps source archive.')
  return {
    manifest,
    records,
    islandSelections: selections,
    islands: resolveProtomapsIslandSelections(records, selections),
    landMask: protomapsCoastlineLandMask(records),
  }
}
