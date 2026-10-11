import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import {
  protomapsSourceBundle,
  sha256,
} from '../../../../../harbour-dataops/src/lib/protomapsIslands'
import { readProtomapsSourceArchive } from './protomapsSourceArchive'
import { readReviewSource } from './reviewSourceArchives'
import { buildAdministrativeAreas } from './administrativeAreas'

const polygon = (west: number, south: number, east: number, north: number) => ({
  type: 'Polygon',
  coordinates: [
    [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ],
  ],
})
const mainland = polygon(0, 0, 2, 2)
const island = polygon(3, 0, 4, 1)
const bundle = protomapsSourceBundle(
  [],
  [{ geometry: mainland }, { geometry: island }],
  [
    {
      geometry: {
        type: 'LineString',
        coordinates: [
          [0, 2],
          [2, 2],
        ],
      },
    },
  ],
)
const manifest = {
  schemaVersion: 2,
  datasetCode: 'ds-hk-protomaps-island',
  sourceVersion: '2026-09-01.3',
}
const archive = (selections: unknown = bundle.islandSelections) =>
  zipSync({
    'manifest.json': strToU8(JSON.stringify(manifest)),
    'records.json': strToU8(JSON.stringify(bundle.records)),
    'island-selections.json': strToU8(JSON.stringify(selections)),
  })

test('one pinned archive supplies island references and the full administrative clipping mask', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shared-protomaps-'))
  try {
    const bytes = archive()
    const path = join(root, 'source.zip')
    await writeFile(path, bytes)
    const pin = {
      datasetCode: manifest.datasetCode,
      releaseCode: `dr-hk-protomaps-island-${manifest.sourceVersion}`,
      sourceVersion: manifest.sourceVersion,
      resourceType: 'divisionArea',
      rawObjectKey: `by-source/${sha256(bytes)}.zip`,
      contentHash: sha256(bytes),
      releaseNotesUrl: null,
    }
    const options = { root, paths: { [pin.releaseCode]: path } }
    const islands = await readReviewSource(pin, options)
    const landMask = await readReviewSource(pin, options, 'land-mask')
    expect(islands.map(row => row.sourceGeometry)).toEqual([island])
    expect(islands[0].geometrySource).toEqual({
      sourceRecordId: islands[0].sourceRecordId,
      componentIndexes: [0],
    })
    expect(landMask).toHaveLength(2)
    const decoded = readProtomapsSourceArchive(bytes)
    expect(decoded.records).toHaveLength(2)
    expect(decoded.islands[0]).toBe(
      decoded.landMask.find(
        row => row.sourceRecordId === decoded.islands[0]!.sourceRecordId,
      ),
    )
    expect(decoded.islandSelections).toEqual([
      { sourceRecordId: decoded.islands[0]!.sourceRecordId, componentIndexes: [0] },
    ])
    const areas = buildAdministrativeAreas({
      divisions: [{ id: 'district', class: 'district' }],
      names: [],
      overture: [
        {
          sourceRecordId: 'territory',
          sourceGeometry: polygon(-1, -1, 5, 3),
          properties: { divisionId: 'district', isTerritorial: true, isLand: false },
        },
      ],
      land: landMask,
      overtureRelease: 'overture-pinned',
      landRelease: pin.releaseCode,
    })
    const land = areas.find(row => row.isLand)
    const geometry = JSON.parse(land!.geometry)
    expect(geometry.type).toBe('MultiPolygon')
    expect(geometry.coordinates).toHaveLength(2)
    expect(
      JSON.parse(land!.sources)
        .protomaps.map((row: any) => row.record_id)
        .sort(),
    ).toEqual(landMask.map(row => row.sourceRecordId).sort())
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('island references reject missing records, duplicate memberships and invalid components', () => {
  const id = bundle.islandSelections[0]!.sourceRecordId
  for (const selections of [
    [{ sourceRecordId: 'missing', componentIndexes: [0] }],
    [
      { sourceRecordId: id, componentIndexes: [0] },
      { sourceRecordId: id, componentIndexes: [0] },
    ],
    [{ sourceRecordId: id, componentIndexes: [1] }],
    [{ sourceRecordId: id, componentIndexes: [0, 0] }],
    [{ sourceRecordId: id }],
    [{ sourceRecordId: id, componentIndexes: [0], sourceGeometry: island }],
  ])
    expect(() => readProtomapsSourceArchive(archive(selections))).toThrow()
})
