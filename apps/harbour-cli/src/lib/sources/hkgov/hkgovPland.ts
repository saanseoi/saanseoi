import { writeFileSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { parquetWriteBuffer } from 'hyparquet-writer'
import shp from 'shpjs'
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import GeoJSONWriter from 'jsts/org/locationtech/jts/io/GeoJSONWriter.js'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import type Geometry from 'jsts/org/locationtech/jts/geom/Geometry.js'
import BufferOp from 'jsts/org/locationtech/jts/operation/buffer/BufferOp.js'
import UnionOp from 'jsts/org/locationtech/jts/operation/union/UnionOp.js'
import IsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js'

import { buildDeterministicUuidV5 } from '@repo/db'
import type { GeoJsonGeometry, GeoJsonPosition } from '@repo/core/pipeline/geojson'

const HKGOV_PLAND_SOURCE = 'hkgov-pland-pu'
// UUIDv5 namespace derived once from the repository's canonical-division
// namespace.  Provider codes, rather than a release year or geometry, are the
// stable input so a Planning Unit retains its canonical ID across snapshots.
const CANONICAL_DIVISION_ID_NAMESPACE = '68cfb529-cbcb-58c9-bdf1-ff9c8e5b9c7c'
// Observed CSDI GeoJSON field shapes, not an upstream-declared schema version.
const HKGOV_PLAND_SOURCE_SCHEMA_VERSION_BY_RELEASE: Record<string, string> = {
  '2001': '1.0',
  '2006': '1.0',
  '2011': '1.0',
  '2016': '1.0',
  '2021': '2.0',
}
const EXPECTED_SOURCE_FEATURE_COUNTS: Record<string, number> = {
  '2001': 4636,
  '2006': 4800,
  '2011': 4815,
  '2016': 4863,
  '2021': 4916,
}
const EXPECTED_NATIVE_SOURCE_FEATURE_COUNTS: Record<string, readonly number[]> = {
  '2001': [4815],
  '2006': [4977],
  '2011': [4993],
  '2016': [5034],
  // The archived 2021 package carries duplicate cells; current source
  // packages already omit them.
  '2021': [4916, 5088],
}
const EXPECTED_NATIVE_NORMALISED_SOURCE_FEATURE_COUNTS: Record<
  string,
  readonly number[]
> = {
  // 2001 has one all-zero polygon sentinel; the remaining duplicate cells are
  // intentionally retained for geometry union at their planning level.
  '2001': [4814],
  '2006': [4977],
  '2011': [4993],
  '2016': [5034],
  '2021': [4916, 5088],
}

export type HkgovPlandUploadType = 'division' | 'divisionArea'

export type PrepareHkgovPlandTpuOptions = {
  inputFile: string
  outputFile: string
  sourceVersion: string
  type: HkgovPlandUploadType
}

export type PreparedHkgovPlandTpuResult = {
  divisionCount: number
  invalidSourceFeatureCount: number
  outputFile: string
  sourceFeatureCount: number
}

type FeatureCollection = {
  features?: unknown
  type?: unknown
}

type SourceFeature = {
  geometry?: unknown
  properties?: unknown
  type?: unknown
}

type SourceProperties = {
  PPU?: unknown
  SB_VC?: unknown
  SPU?: unknown
  Subunit?: unknown
  TPU?: unknown
}

type PlanningLevel = 'ppu' | 'spu' | 'tpu' | 'subunit'

type PlanningCell = {
  geometry: GeoJsonGeometry
  originalFeature: SourceFeature
  originalGeometry: GeoJsonGeometry
  ppu: string
  repaired: boolean
  sourceRecordId: string
  spu: string
  subunit: string
  tpu: string
}

type PlanningDivision = {
  bbox: [number, number, number, number]
  cellIds: string[]
  geometry: GeoJsonGeometry
  hierarchy: Array<{ division_id: string; domain: 'planning' }>
  id: string
  identifiers: Record<string, string>
  level: PlanningLevel
  repairedSourceFeatureIds: string[]
  sourceProperties: Record<string, unknown>
}

/**
 * Converts a CSDI TPU-and-subunit GeoJSON delivery into one of the two parquet
 * shapes accepted by `saanseoi upload`.  The file API has already transformed
 * the publisher's EPSG:2326 service geometry into EPSG:4326 GeoJSON.
 *
 * Each source cell is preserved under `sourceFeature`; only six known source
 * cells (ring self-intersections) use the explicit buffer(0) repair policy for
 * canonical geometry and aggregation.
 */
export async function prepareHkgovPlandTpuParquet(
  options: PrepareHkgovPlandTpuOptions,
): Promise<PreparedHkgovPlandTpuResult> {
  const payload = JSON.parse(
    await readFile(resolve(options.inputFile), 'utf8'),
  ) as FeatureCollection
  return prepareHkgovPlandTpuFeatureCollection(options, payload)
}

/**
 * Reads a mirrored publisher SHP ZIP directly. CSDI's historical TPU packages
 * retain duplicate cells that were absent from the former GeoJSON hand-off;
 * only exact provider-cell keys and the all-zero sentinel are removed.
 */
export async function prepareHkgovPlandTpuNativeShpZip(
  options: PrepareHkgovPlandTpuOptions,
): Promise<PreparedHkgovPlandTpuResult> {
  return prepareHkgovPlandTpuFeatureCollection(
    options,
    await readHkgovPlandTpuNativeShpZip(options.inputFile, options.sourceVersion),
    EXPECTED_NATIVE_NORMALISED_SOURCE_FEATURE_COUNTS[options.sourceVersion],
  )
}

export async function readHkgovPlandTpuNativeShpZip(
  inputFile: string,
  sourceVersion: string,
) {
  const parsed = await shp((await readFile(resolve(inputFile))).buffer)
  return normaliseNativeTpuFeatureCollection(
    selectNativeFeatureCollection(parsed, 'TPU'),
    sourceVersion,
  )
}

async function prepareHkgovPlandTpuFeatureCollection(
  options: PrepareHkgovPlandTpuOptions,
  payload: FeatureCollection,
  expectedSourceFeatureCounts: readonly number[] = [
    EXPECTED_SOURCE_FEATURE_COUNTS[options.sourceVersion] ?? -1,
  ],
): Promise<PreparedHkgovPlandTpuResult> {
  if (!EXPECTED_SOURCE_FEATURE_COUNTS[options.sourceVersion]) {
    throw new Error(
      `No registered ${HKGOV_PLAND_SOURCE} TPU parser profile exists for source version ${options.sourceVersion}.`,
    )
  }

  if (payload.type !== 'FeatureCollection' || !Array.isArray(payload.features)) {
    throw new Error(
      'Planning Department TPU input must be a GeoJSON FeatureCollection.',
    )
  }
  if (!expectedSourceFeatureCounts.includes(payload.features.length)) {
    throw new Error(
      `Planning Department TPU ${options.sourceVersion} must contain ${expectedSourceFeatureCounts.join(' or ')} source features; found ${payload.features.length}.`,
    )
  }

  const cells = payload.features.map((feature, index) =>
    normalisePlanningCell(feature, index, options.sourceVersion),
  )
  const divisions = buildPlanningDivisions(cells, options.sourceVersion)
  await mkdir(dirname(resolve(options.outputFile)), { recursive: true })

  if (options.type === 'division') {
    writeDivisionParquet(resolve(options.outputFile), divisions, options.sourceVersion)
  } else {
    writeDivisionAreaParquet(
      resolve(options.outputFile),
      divisions,
      options.sourceVersion,
    )
  }

  return {
    divisionCount: divisions.length,
    invalidSourceFeatureCount: cells.filter(cell => cell.repaired).length,
    outputFile: resolve(options.outputFile),
    sourceFeatureCount: cells.length,
  }
}

function selectNativeFeatureCollection(
  value: unknown,
  layer: string,
): FeatureCollection {
  const collections = Array.isArray(value) ? value : [value]
  const collection = collections.find(isFeatureCollection)
  if (!collection || collections.filter(isFeatureCollection).length !== 1) {
    throw new Error(
      `Planning Department ${layer} SHP archive must contain exactly one feature layer.`,
    )
  }
  return collection
}

function normaliseNativeTpuFeatureCollection(
  payload: FeatureCollection,
  sourceVersion: string,
): FeatureCollection {
  const expectedRawCounts = EXPECTED_NATIVE_SOURCE_FEATURE_COUNTS[sourceVersion]
  if (!expectedRawCounts) {
    throw new Error(
      `No registered ${HKGOV_PLAND_SOURCE} native-SHP parser profile exists for source version ${sourceVersion}.`,
    )
  }
  if (payload.type !== 'FeatureCollection' || !Array.isArray(payload.features)) {
    throw new Error('Planning Department TPU SHP input must be a FeatureCollection.')
  }
  if (!expectedRawCounts.includes(payload.features.length)) {
    throw new Error(
      `Planning Department TPU ${sourceVersion} native SHP must contain ${expectedRawCounts.join(' or ')} source features; found ${payload.features.length}.`,
    )
  }

  const features: unknown[] = []
  for (const [index, feature] of payload.features.entries()) {
    if (!isRecord(feature) || !isRecord(feature.properties)) {
      throw new Error(
        `Planning Department native TPU feature ${index + 1} has no properties.`,
      )
    }
    const properties = feature.properties as SourceProperties
    const values = [
      properties.PPU,
      properties.SPU,
      properties.TPU,
      sourceVersion === '2021' ? properties.Subunit : properties.SB_VC,
    ].map(value => String(value ?? '').trim())
    if (values.every(value => value === '0')) continue
    if (values.some(value => !value)) {
      throw new Error(
        `Planning Department native TPU feature ${index + 1} has an incomplete planning-cell key.`,
      )
    }
    features.push(feature)
  }

  return { features, type: 'FeatureCollection' }
}

function isFeatureCollection(value: unknown): value is FeatureCollection {
  return (
    isRecord(value) &&
    value.type === 'FeatureCollection' &&
    Array.isArray(value.features)
  )
}

function normalisePlanningCell(
  value: unknown,
  index: number,
  sourceVersion: string,
): PlanningCell {
  if (!isRecord(value) || value.type !== 'Feature') {
    throw new Error(
      `Planning Department feature ${index + 1} is not a GeoJSON Feature.`,
    )
  }
  const feature = value as SourceFeature
  const properties = isRecord(feature.properties)
    ? (feature.properties as SourceProperties)
    : null
  if (!properties) {
    throw new Error(`Planning Department feature ${index + 1} has no properties.`)
  }
  const originalGeometry = requirePolygonGeometry(feature.geometry, index)
  const repairedGeometry = repairGeometryIfRequired(originalGeometry, index)
  const ppu = requireCode(properties.PPU, 'PPU', index)
  const spu = requireCode(properties.SPU, 'SPU', index)
  const tpu = requireCode(properties.TPU, 'TPU', index)
  const subunit = requireCode(
    sourceVersion === '2021' ? properties.Subunit : properties.SB_VC,
    sourceVersion === '2021' ? 'Subunit' : 'SB_VC',
    index,
  )

  return {
    geometry: repairedGeometry.geometry,
    originalFeature: feature,
    originalGeometry,
    ppu,
    repaired: repairedGeometry.repaired,
    // Archived TPU deliveries have repeated planning-cell codes and no
    // publisher feature identifier. The delivery row ordinal distinguishes
    // those separate native assertions without changing canonical grouping.
    sourceRecordId: `${sourceCellId({ ppu, spu, tpu, subunit })}:${index + 1}`,
    spu,
    subunit,
    tpu,
  }
}

function buildPlanningDivisions(
  cells: PlanningCell[],
  sourceVersion: string,
): PlanningDivision[] {
  const divisions: PlanningDivision[] = []
  const groups: Record<PlanningLevel, Map<string, PlanningCell[]>> = {
    subunit: new Map(),
    tpu: new Map(),
    spu: new Map(),
    ppu: new Map(),
  }

  for (const cell of cells) {
    addGroup(groups.subunit, subunitKey(cell), cell)
    addGroup(groups.tpu, cell.tpu, cell)
    addGroup(groups.spu, cell.spu, cell)
    addGroup(groups.ppu, cell.ppu, cell)
  }

  for (const level of ['ppu', 'spu', 'tpu', 'subunit'] as const) {
    const levelGroups = groups[level]
    for (const [key, members] of [...levelGroups.entries()].sort(([left], [right]) =>
      left.localeCompare(right, 'en', { numeric: true }),
    )) {
      divisions.push(buildPlanningDivision(level, key, members, sourceVersion))
    }
  }

  return divisions
}

function buildPlanningDivision(
  level: PlanningLevel,
  key: string,
  cells: PlanningCell[],
  sourceVersion: string,
): PlanningDivision {
  const first = cells[0]
  if (!first) {
    throw new Error(`Cannot build an empty ${level} planning division.`)
  }
  const id = divisionId(level, key, first)
  const geometry = unionGeometries(
    cells.map(cell => cell.geometry),
    sourceVersion === '2021',
  )
  const hierarchy = resolveHierarchy(level, first)
  const repairedSourceFeatureIds = cells
    .filter(cell => cell.repaired)
    .map(cell => sourceCellId(cell))
    .sort()

  return {
    bbox: calculateBbox(geometry),
    cellIds: cells.map(sourceCellId).sort(),
    geometry,
    hierarchy,
    id,
    identifiers: identifiersFor(level, first),
    level,
    repairedSourceFeatureIds,
    sourceProperties: {
      sourceFeatureCount: cells.length,
      sourceRelease: `${HKGOV_PLAND_SOURCE}-${sourceVersion}`,
      sourceLevel: level,
      ...(level === 'subunit'
        ? {
            // Every native feature is carried through the division hand-off so
            // the source layer can retain publisher evidence rather than a
            // canonical subunit projection.
            sourceFeatures: cells.map(cell => ({
              ppuCode: cell.ppu,
              spuCode: cell.spu,
              subunitCode: cell.subunit,
              tpuCode: cell.tpu,
              rawProperties: cell.originalFeature.properties ?? null,
              repairedGeometry: cell.repaired ? cell.geometry : null,
              sourceGeometry: cell.originalGeometry,
              sourceRecordId: cell.sourceRecordId,
              wasGeometryRepaired: cell.repaired,
            })),
          }
        : {}),
    },
  }
}

function writeDivisionParquet(
  outputFile: string,
  rows: PlanningDivision[],
  sourceVersion: string,
) {
  writeParquetFile(outputFile, {
    rowGroupSize: 5000,
    // hyparquet 1.26 cannot read the GeoParquet column-statistics metadata
    // emitted by hyparquet-writer for GEOMETRY columns. The geometry data and
    // its logical type remain intact without optional column statistics.
    statistics: false,
    columnData: [
      stringColumn(
        'id',
        rows.map(row => row.id),
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
        rows.map(row => row.level),
        false,
      ),
      geometryColumn(
        'geometry',
        rows.map(row => row.geometry),
        false,
      ),
      jsonColumn(
        'bbox',
        rows.map(row => row.bbox),
        false,
      ),
      jsonColumn(
        'identifiers',
        rows.map(row => row.identifiers),
        false,
      ),
      jsonColumn(
        'hierarchy',
        rows.map(row => row.hierarchy),
        false,
      ),
      jsonColumn(
        'source_cell_ids',
        rows.map(row => row.cellIds),
        false,
      ),
      jsonColumn(
        'repaired_source_feature_ids',
        rows.map(row => row.repairedSourceFeatureIds),
        false,
      ),
      jsonColumn(
        'source_properties',
        rows.map(row => row.sourceProperties),
        false,
      ),
      stringColumn(
        'source_schema_version',
        rows.map(() => sourceSchemaVersion(sourceVersion)),
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
  rows: PlanningDivision[],
  sourceVersion: string,
) {
  writeParquetFile(outputFile, {
    rowGroupSize: 5000,
    // Keep the generated GeoParquet readable by the upload inspector; see
    // the matching division writer above.
    statistics: false,
    columnData: [
      stringColumn(
        'id',
        rows.map(row => `PLAND:${row.id}`),
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
        'division_id',
        rows.map(row => row.id),
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
      stringColumn(
        'planning_level',
        rows.map(row => row.level),
        false,
      ),
      geometryColumn(
        'geometry',
        rows.map(row => row.geometry),
        false,
      ),
      jsonColumn(
        'bbox',
        rows.map(row => row.bbox),
        false,
      ),
      jsonColumn(
        'identifiers',
        rows.map(row => row.identifiers),
        false,
      ),
      jsonColumn(
        'source_cell_ids',
        rows.map(row => row.cellIds),
        false,
      ),
      jsonColumn(
        'repaired_source_feature_ids',
        rows.map(row => row.repairedSourceFeatureIds),
        false,
      ),
      jsonColumn(
        'source_properties',
        rows.map(row => row.sourceProperties),
        false,
      ),
      stringColumn(
        'source_schema_version',
        rows.map(() => sourceSchemaVersion(sourceVersion)),
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

function repairGeometryIfRequired(geometry: GeoJsonGeometry, index: number) {
  const reader = new GeoJSONReader(new GeometryFactory())
  const writer = new GeoJSONWriter()
  const parsed = reader.read(JSON.stringify(geometry))
  if (IsValidOp.isValid(parsed)) {
    return { geometry, repaired: false }
  }

  const repaired = BufferOp.bufferOp(parsed, 0)
  if (!IsValidOp.isValid(repaired)) {
    throw new Error(
      `Planning Department feature ${index + 1} remains invalid after repair.`,
    )
  }
  const result = writer.write(repaired) as GeoJsonGeometry
  if (result.type !== 'Polygon' && result.type !== 'MultiPolygon') {
    throw new Error(
      `Planning Department feature ${index + 1} repair produced unsupported ${result.type} geometry.`,
    )
  }
  return { geometry: result, repaired: true }
}

function unionGeometries(geometries: GeoJsonGeometry[], canonicaliseAggregate = false) {
  const factory = new GeometryFactory()
  const reader = new GeoJSONReader(factory)
  const writer = new GeoJSONWriter()
  const parsed = geometries
    .map(geometry => reader.read(JSON.stringify(geometry)))
    .sort((left, right) =>
      left.getEnvelopeInternal().compareTo(right.getEnvelopeInternal()),
    )
  const unioned = canonicaliseAggregate
    ? BufferOp.bufferOp(factory.createGeometryCollection(parsed), 0)
    : unionBalanced(parsed)
  const result = removeDegenerateInteriorRings(writer.write(unioned) as GeoJsonGeometry)
  if (
    (result.type !== 'Polygon' && result.type !== 'MultiPolygon') ||
    !IsValidOp.isValid(unioned)
  ) {
    throw new Error(
      'Planning Department aggregate union did not produce valid polygonal geometry.',
    )
  }
  return result
}

/**
 * JSTS considers zero-area holes valid after polygon unions, but the canonical
 * geometry validator correctly rejects them. Keep each exterior ring and drop
 * only those degenerate interior rings from the aggregate geometry.
 */
function removeDegenerateInteriorRings(geometry: GeoJsonGeometry): GeoJsonGeometry {
  if (geometry.type === 'Polygon') {
    return {
      ...geometry,
      coordinates: removeDegenerateInteriorRingsFromPolygon(geometry.coordinates),
    }
  }
  if (geometry.type === 'MultiPolygon') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map(removeDegenerateInteriorRingsFromPolygon),
    }
  }
  return geometry
}

function removeDegenerateInteriorRingsFromPolygon(rings: GeoJsonPosition[][]) {
  return rings.filter((ring, index) => index === 0 || ringArea(ring) !== 0)
}

function ringArea(ring: GeoJsonPosition[]) {
  let total = 0
  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index]
    const next = ring[index + 1]
    if (!current || !next) continue
    total += current[0] * next[1] - next[0] * current[1]
  }
  return total / 2
}

function unionBalanced(geometries: Geometry[]): Geometry {
  if (geometries.length === 0) {
    throw new Error('Cannot union an empty geometry collection.')
  }
  let current = geometries
  while (current.length > 1) {
    const next: Geometry[] = []
    for (let index = 0; index < current.length; index += 2) {
      const left = current[index]
      const right = current[index + 1]
      next.push(right ? UnionOp.union(left, right) : left)
    }
    current = next
  }
  const result = current[0]
  if (!result) throw new Error('Planning Department aggregate union is empty.')
  return result
}

function resolveHierarchy(level: PlanningLevel, cell: PlanningCell) {
  const parent =
    level === 'spu'
      ? divisionId('ppu', cell.ppu, cell)
      : level === 'tpu'
        ? divisionId('spu', cell.spu, cell)
        : level === 'subunit'
          ? divisionId('tpu', cell.tpu, cell)
          : null
  return parent ? [{ division_id: parent, domain: 'planning' as const }] : []
}

function identifiersFor(level: PlanningLevel, cell: PlanningCell) {
  return {
    'PLAND:PPU': cell.ppu,
    ...(level === 'spu' || level === 'tpu' || level === 'subunit'
      ? { 'PLAND:SPU': cell.spu }
      : {}),
    ...(level === 'tpu' || level === 'subunit' ? { 'PLAND:TPU': cell.tpu } : {}),
    ...(level === 'subunit' ? { 'PLAND:SUBUNIT': cell.subunit } : {}),
  }
}

function divisionId(level: PlanningLevel, key: string, cell: PlanningCell) {
  return buildDeterministicUuidV5(
    CANONICAL_DIVISION_ID_NAMESPACE,
    hkgovPlanningDivisionId(level, key, cell),
  )
}

function hkgovPlanningDivisionId(
  level: PlanningLevel,
  key: string,
  cell: PlanningCell,
) {
  if (level === 'subunit') {
    return `${HKGOV_PLAND_SOURCE}:hk:planning:subunit:${cell.tpu}-${cell.subunit}`
  }
  return `${HKGOV_PLAND_SOURCE}:hk:planning:${level}:${key}`
}

function sourceCellId(cell: Pick<PlanningCell, 'ppu' | 'spu' | 'tpu' | 'subunit'>) {
  return `PLAND:${cell.ppu}:${cell.spu}:${cell.tpu}:${cell.subunit}`
}

function subunitKey(cell: PlanningCell) {
  return `${cell.tpu}:${cell.subunit}`
}

function addGroup(
  groups: Map<string, PlanningCell[]>,
  key: string,
  cell: PlanningCell,
) {
  const values = groups.get(key) ?? []
  values.push(cell)
  groups.set(key, values)
}

function requirePolygonGeometry(value: unknown, index: number): GeoJsonGeometry {
  if (!isRecord(value) || (value.type !== 'Polygon' && value.type !== 'MultiPolygon')) {
    throw new Error(
      `Planning Department feature ${index + 1} must have Polygon or MultiPolygon geometry.`,
    )
  }
  const geometry = value as GeoJsonGeometry
  const positions = collectPositions(geometry)
  if (
    positions.length === 0 ||
    positions.some(position => !isWgs84Position(position))
  ) {
    throw new Error(
      `Planning Department feature ${index + 1} does not contain valid WGS84 longitude/latitude coordinates.`,
    )
  }
  return geometry
}

function calculateBbox(geometry: GeoJsonGeometry): [number, number, number, number] {
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

function requireCode(value: unknown, field: string, index: number) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return String(value)
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return value.trim()
  }
  throw new Error(`Planning Department feature ${index + 1} requires numeric ${field}.`)
}

function sourceSchemaVersion(sourceVersion: string) {
  const schemaVersion = HKGOV_PLAND_SOURCE_SCHEMA_VERSION_BY_RELEASE[sourceVersion]
  if (!schemaVersion) {
    throw new Error(
      `No Planning Department TPU schema profile exists for ${sourceVersion}.`,
    )
  }
  return schemaVersion
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

function geometryColumn(name: string, data: GeoJsonGeometry[], nullable = true) {
  return { data, name, nullable, type: 'GEOMETRY' as const }
}

function writeParquetFile(
  outputFile: string,
  options: Parameters<typeof parquetWriteBuffer>[0],
) {
  writeFileSync(outputFile, new Uint8Array(parquetWriteBuffer(options)))
}
