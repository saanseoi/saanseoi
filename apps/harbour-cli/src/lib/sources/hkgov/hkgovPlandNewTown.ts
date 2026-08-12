import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { parquetWriteFile } from 'hyparquet-writer'
import shp from 'shpjs'
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import GeoJSONWriter from 'jsts/org/locationtech/jts/io/GeoJSONWriter.js'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import BufferOp from 'jsts/org/locationtech/jts/operation/buffer/BufferOp.js'
import IsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js'

import { buildDeterministicUuidV5 } from '@repo/db'
import type { GeoJsonGeometry, GeoJsonPosition } from '@repo/core/pipeline/geojson'

const EXPECTED_FEATURE_COUNTS: Record<string, number> = {
  '2006': 12,
  '2011': 12,
  '2016': 12,
  '2021': 13,
}
const CANONICAL_DIVISION_ID_NAMESPACE = '68cfb529-cbcb-58c9-bdf1-ff9c8e5b9c7c'

type Feature = {
  geometry?: unknown
  properties?: unknown
  type?: unknown
}

type FeatureCollection = {
  features?: unknown
  type?: unknown
}

type NewTownProperties = {
  NewTown_Sc?: unknown
  NewTown_Tc?: unknown
  NewTown_en?: unknown
}

type NewTownRow = {
  geometry: GeoJsonGeometry
  id: string
  names: { en: string; 'zh-hans': string; 'zh-hant': string }
  originalGeometry: GeoJsonGeometry
  repaired: boolean
  sourceFeature: Feature
}

export type HkgovPlandNewTownRepairResult = {
  outputFile: string
  repairedFeatureCount: number
  sourceFeatureCount: number
}

/**
 * Exports a clearly labelled diagnostic copy of a New Town delivery with
 * invalid polygon rings canonicalised by buffer(0). The publisher file is
 * never overwritten; the upload adapter uses the same reviewed repair while
 * retaining the source feature and original geometry in the source layer.
 */
export async function exportRepairedHkgovPlandNewTownGeoJson(options: {
  inputFile: string
  outputFile: string
  sourceVersion: string
}): Promise<HkgovPlandNewTownRepairResult> {
  const expectedCount = EXPECTED_FEATURE_COUNTS[options.sourceVersion]
  if (!expectedCount) {
    throw new Error(
      `No registered Planning Department New Town parser profile exists for source version ${options.sourceVersion}.`,
    )
  }
  const payload = JSON.parse(
    await readFile(resolve(options.inputFile), 'utf8'),
  ) as FeatureCollection
  if (payload.type !== 'FeatureCollection' || !Array.isArray(payload.features)) {
    throw new Error(
      'Planning Department New Town input must be a GeoJSON FeatureCollection.',
    )
  }
  if (payload.features.length !== expectedCount) {
    throw new Error(
      `Planning Department New Town ${options.sourceVersion} must contain ${expectedCount} features; found ${payload.features.length}.`,
    )
  }

  let repairedFeatureCount = 0
  const features = payload.features.map((value, index) => {
    if (!isRecord(value) || value.type !== 'Feature') {
      throw new Error(
        `Planning Department New Town feature ${index + 1} is not a GeoJSON Feature.`,
      )
    }
    const feature = value as Feature
    const geometry = requireWgs84PolygonGeometry(feature.geometry, index)
    const repaired = repairGeometryIfInvalid(geometry, index)
    if (repaired.repaired) repairedFeatureCount += 1
    return {
      ...feature,
      geometry: repaired.geometry,
      properties: {
        ...(isRecord(feature.properties) ? feature.properties : {}),
        saanseoiGeometryCanonicalisation: repaired.repaired
          ? 'buffer(0): self-intersection repair; original retained separately'
          : 'unchanged',
      },
    }
  })
  const outputFile = resolve(options.outputFile)
  await mkdir(dirname(outputFile), { recursive: true })
  await writeFile(outputFile, `${JSON.stringify({ ...payload, features })}\n`, 'utf8')
  return { outputFile, repairedFeatureCount, sourceFeatureCount: features.length }
}

/**
 * Prepare a New Town GeoJSON artefact for the cohort-scoped planning-division
 * and geometry uploaders.
 * The CSDI GeoJSON delivery is WGS84 even though the catalogue service is
 * published in EPSG:2326. It has no upstream stable feature ID, so `id` is a
 * deterministic, cohort-scoped normalised English name retained as the provider
 * identifier and used to derive the canonical UUIDv5.
 */
export async function prepareHkgovPlandNewTownParquet(options: {
  inputFile: string
  outputFile: string
  sourceVersion: string
  type: 'division' | 'divisionArea'
}) {
  const payload = JSON.parse(
    await readFile(resolve(options.inputFile), 'utf8'),
  ) as FeatureCollection
  return prepareHkgovPlandNewTownFeatureCollection(options, payload)
}

/** Reads a mirrored Planning Department New Town SHP ZIP directly. */
export async function prepareHkgovPlandNewTownNativeShpZip(options: {
  inputFile: string
  outputFile: string
  sourceVersion: string
  type: 'division' | 'divisionArea'
}) {
  return prepareHkgovPlandNewTownFeatureCollection(
    options,
    await readHkgovPlandNewTownNativeShpZip(options.inputFile),
  )
}

export async function readHkgovPlandNewTownNativeShpZip(inputFile: string) {
  const parsed = await shp((await readFile(resolve(inputFile))).buffer)
  const collections = Array.isArray(parsed) ? parsed : [parsed]
  const payload = collections.find(isFeatureCollection)
  if (!payload || collections.filter(isFeatureCollection).length !== 1) {
    throw new Error(
      'Planning Department New Town SHP archive must contain exactly one feature layer.',
    )
  }
  return payload
}

async function prepareHkgovPlandNewTownFeatureCollection(
  options: {
    inputFile: string
    outputFile: string
    sourceVersion: string
    type: 'division' | 'divisionArea'
  },
  payload: FeatureCollection,
) {
  const expectedCount = EXPECTED_FEATURE_COUNTS[options.sourceVersion]
  if (!expectedCount) {
    throw new Error(
      `No registered Planning Department New Town parser profile exists for source version ${options.sourceVersion}.`,
    )
  }
  if (payload.type !== 'FeatureCollection' || !Array.isArray(payload.features)) {
    throw new Error(
      'Planning Department New Town input must be a GeoJSON FeatureCollection.',
    )
  }
  if (payload.features.length !== expectedCount) {
    throw new Error(
      `Planning Department New Town ${options.sourceVersion} must contain ${expectedCount} features; found ${payload.features.length}.`,
    )
  }

  const rows = payload.features.map(normaliseFeature)
  const ids = new Set(rows.map(row => row.id))
  if (ids.size !== rows.length) {
    throw new Error(
      `Planning Department New Town ${options.sourceVersion} has duplicate normalised provider identifiers.`,
    )
  }
  await mkdir(dirname(resolve(options.outputFile)), { recursive: true })
  if (options.type === 'division') {
    writeDivisionParquet(resolve(options.outputFile), rows, options.sourceVersion)
  } else {
    writeDivisionAreaParquet(resolve(options.outputFile), rows, options.sourceVersion)
  }
  return { outputFile: resolve(options.outputFile), sourceFeatureCount: rows.length }
}

function isFeatureCollection(value: unknown): value is FeatureCollection {
  return (
    isRecord(value) &&
    value.type === 'FeatureCollection' &&
    Array.isArray(value.features)
  )
}

function writeDivisionParquet(
  outputFile: string,
  rows: NewTownRow[],
  sourceVersion: string,
) {
  parquetWriteFile({
    filename: outputFile,
    rowGroupSize: 1000,
    columnData: [
      stringColumn(
        'id',
        rows.map(row => canonicalDivisionId(row, sourceVersion)),
        false,
      ),
      stringColumn(
        'theme',
        rows.map(() => 'divisions'),
        false,
      ),
      stringColumn(
        'type',
        rows.map(() => 'division'),
        false,
      ),
      stringColumn(
        'country',
        rows.map(() => 'HK'),
        false,
      ),
      stringColumn(
        'region',
        rows.map(() => 'HK'),
        false,
      ),
      stringColumn(
        'planning_level',
        rows.map(() => 'newtown'),
        false,
      ),
      jsonColumn(
        'geometry',
        rows.map(row => row.geometry),
        false,
      ),
      jsonColumn(
        'bbox',
        rows.map(row => bbox(row.geometry)),
        false,
      ),
      jsonColumn(
        'identifiers',
        rows.map(row => ({ 'PLAND:NEWTOWN': row.id })),
        false,
      ),
      jsonColumn(
        'hierarchy',
        rows.map(() => []),
        false,
      ),
      jsonColumn(
        'source_cell_ids',
        rows.map(() => []),
        false,
      ),
      jsonColumn(
        'i18n',
        rows.map(row => i18nRows(row)),
        false,
      ),
      jsonColumn(
        'source_properties',
        rows.map(row => ({
          i18n: i18nRows(row),
          newtown_id: row.id,
          source_geometry: row.originalGeometry,
          source_geometry_bbox: bbox(row.originalGeometry),
          was_geometry_repaired: row.repaired,
          sourceFeature: row.sourceFeature,
        })),
        false,
      ),
      stringColumn(
        'source_schema_version',
        rows.map(() => '1.0'),
        false,
      ),
      stringColumn(
        'source_version',
        rows.map(() => sourceVersion),
        false,
      ),
    ],
  })
}

function writeDivisionAreaParquet(
  outputFile: string,
  rows: NewTownRow[],
  sourceVersion: string,
) {
  parquetWriteFile({
    filename: outputFile,
    rowGroupSize: 1000,
    columnData: [
      stringColumn(
        'id',
        rows.map(row => `PLAND:NEWTOWN:${canonicalDivisionId(row, sourceVersion)}`),
        false,
      ),
      stringColumn(
        'newtown_id',
        rows.map(row => row.id),
        false,
      ),
      stringColumn(
        'division_id',
        rows.map(row => canonicalDivisionId(row, sourceVersion)),
        false,
      ),
      stringColumn(
        'theme',
        rows.map(() => 'divisions'),
        false,
      ),
      stringColumn(
        'type',
        rows.map(() => 'divisionArea'),
        false,
      ),
      stringColumn(
        'country',
        rows.map(() => 'HK'),
        false,
      ),
      stringColumn(
        'region',
        rows.map(() => 'HK'),
        false,
      ),
      stringColumn(
        'class',
        rows.map(() => 'land'),
        false,
      ),
      booleanColumn(
        'is_land',
        rows.map(() => true),
        false,
      ),
      booleanColumn(
        'is_territorial',
        rows.map(() => true),
        false,
      ),
      jsonColumn(
        'geometry',
        rows.map(row => row.geometry),
        false,
      ),
      jsonColumn(
        'bbox',
        rows.map(row => bbox(row.geometry)),
        false,
      ),
      jsonColumn(
        'identifiers',
        rows.map(row => ({ 'PLAND:NEWTOWN': row.id })),
        false,
      ),
      jsonColumn(
        'i18n',
        rows.map(row => i18nRows(row)),
        false,
      ),
      jsonColumn(
        'sources',
        rows.map(row => [{ dataset: 'hkgov-pland-new-town', newTownId: row.id }]),
        false,
      ),
      jsonColumn(
        'source_properties',
        rows.map(row => ({
          i18n: i18nRows(row),
          newtown_id: row.id,
          source_geometry: row.originalGeometry,
          source_geometry_bbox: bbox(row.originalGeometry),
          was_geometry_repaired: row.repaired,
          sourceFeature: row.sourceFeature,
        })),
        false,
      ),
      stringColumn(
        'source_schema_version',
        rows.map(() => '1.0'),
        false,
      ),
      stringColumn(
        'source_version',
        rows.map(() => sourceVersion),
        false,
      ),
    ],
  })
}

function canonicalDivisionId(row: NewTownRow, sourceVersion: string) {
  return buildDeterministicUuidV5(
    CANONICAL_DIVISION_ID_NAMESPACE,
    `hkgov-pland-new-town:hk:planning:${sourceVersion}:${row.id}`,
  )
}

function i18nRows(row: NewTownRow) {
  return [
    { locale: 'en', name: row.names.en },
    { locale: 'zh-hant', name: row.names['zh-hant'] },
    { locale: 'zh-hans', name: row.names['zh-hans'] },
  ]
}

function normaliseFeature(value: unknown, index: number): NewTownRow {
  if (!isRecord(value) || value.type !== 'Feature') {
    throw new Error(
      `Planning Department New Town feature ${index + 1} is not a GeoJSON Feature.`,
    )
  }
  const feature = value as Feature
  if (!isRecord(feature.properties)) {
    throw new Error(
      `Planning Department New Town feature ${index + 1} has no properties.`,
    )
  }
  const properties = feature.properties as NewTownProperties
  const names = {
    en: requireName(properties.NewTown_en, 'NewTown_en', index),
    'zh-hant': requireName(properties.NewTown_Tc, 'NewTown_Tc', index),
    'zh-hans': requireName(properties.NewTown_Sc, 'NewTown_Sc', index),
  }
  const originalGeometry = requireWgs84PolygonGeometry(feature.geometry, index)
  const repairedGeometry = repairGeometryIfInvalid(originalGeometry, index)
  return {
    geometry: repairedGeometry.geometry,
    id: normaliseProviderId(names.en),
    names,
    originalGeometry,
    repaired: repairedGeometry.repaired,
    sourceFeature: feature,
  }
}

function normaliseProviderId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-')
}

function requireName(value: unknown, field: string, index: number) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(
      `Planning Department New Town feature ${index + 1} requires ${field}.`,
    )
  }
  return value.trim()
}

function requireWgs84PolygonGeometry(value: unknown, index: number): GeoJsonGeometry {
  if (!isRecord(value) || (value.type !== 'Polygon' && value.type !== 'MultiPolygon')) {
    throw new Error(
      `Planning Department New Town feature ${index + 1} must have Polygon or MultiPolygon geometry.`,
    )
  }
  const geometry = value as GeoJsonGeometry
  const positions = collectPositions(geometry)
  if (
    positions.length === 0 ||
    positions.some(position => !isWgs84Position(position))
  ) {
    throw new Error(
      `Planning Department New Town feature ${index + 1} does not contain WGS84 coordinates.`,
    )
  }
  return geometry
}

function repairGeometryIfInvalid(geometry: GeoJsonGeometry, index: number) {
  const reader = new GeoJSONReader(new GeometryFactory())
  const writer = new GeoJSONWriter()
  const parsed = reader.read(JSON.stringify(geometry))
  if (IsValidOp.isValid(parsed)) return { geometry, repaired: false }

  const repaired = BufferOp.bufferOp(parsed, 0)
  if (!IsValidOp.isValid(repaired)) {
    throw new Error(
      `Planning Department New Town feature ${index + 1} remains invalid after repair.`,
    )
  }
  const result = writer.write(repaired) as GeoJsonGeometry
  if (result.type !== 'Polygon' && result.type !== 'MultiPolygon') {
    throw new Error(
      `Planning Department New Town feature ${index + 1} repair produced unsupported ${result.type} geometry.`,
    )
  }
  return { geometry: result, repaired: true }
}

function bbox(geometry: GeoJsonGeometry): [number, number, number, number] {
  const positions = collectPositions(geometry)
  return [
    Math.min(...positions.map(position => position[0])),
    Math.min(...positions.map(position => position[1])),
    Math.max(...positions.map(position => position[0])),
    Math.max(...positions.map(position => position[1])),
  ]
}

function collectPositions(geometry: GeoJsonGeometry): GeoJsonPosition[] {
  if (geometry.type === 'Polygon') return geometry.coordinates.flat()
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat(2)
  return []
}

function isWgs84Position(position: GeoJsonPosition) {
  return (
    Number.isFinite(position[0]) &&
    Number.isFinite(position[1]) &&
    Math.abs(position[0]) <= 180 &&
    Math.abs(position[1]) <= 90
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringColumn(name: string, data: string[], nullable = true) {
  return { data, name, nullable, type: 'STRING' as const }
}

function booleanColumn(name: string, data: boolean[], nullable = true) {
  return { data, name, nullable, type: 'BOOLEAN' as const }
}

function jsonColumn<T>(name: string, data: T[], nullable = true) {
  return { data, name, nullable, type: 'JSON' as const }
}
