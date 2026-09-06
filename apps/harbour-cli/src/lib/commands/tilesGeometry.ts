import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { note } from '@clack/prompts'
import ArrayList from 'jsts/java/util/ArrayList.js'
import Coordinate from 'jsts/org/locationtech/jts/geom/Coordinate.js'
import Envelope from 'jsts/org/locationtech/jts/geom/Envelope.js'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import type Geometry from 'jsts/org/locationtech/jts/geom/Geometry.js'
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import STRtree from 'jsts/org/locationtech/jts/index/strtree/STRtree.js'
import GeoJSONWriter from 'jsts/org/locationtech/jts/io/GeoJSONWriter.js'
import PointLocator from 'jsts/org/locationtech/jts/algorithm/PointLocator.js'
import OverlayOp from 'jsts/org/locationtech/jts/operation/overlay/OverlayOp.js'
import IsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js'
import Polygonizer from 'jsts/org/locationtech/jts/operation/polygonize/Polygonizer.js'
import UnionOp from 'jsts/org/locationtech/jts/operation/union/UnionOp.js'
import UnaryUnionOp from 'jsts/org/locationtech/jts/operation/union/UnaryUnionOp.js'
import {
  REGION_BOUNDARY_RELATIONS,
  type BoundaryGeometry,
  type CoastlineGeometry,
  type OsmBoundary,
  type PreparedSource,
  type Region,
} from './tilesTypes.ts'
import type { prepareRegionClip } from './tilesSources.ts'
import { OUTPUT_ROOT, SOURCES_ROOT } from './tilesConfig.ts'
import { commandSucceeds, run, runQuiet } from './tilesExecution.ts'
import { archiveMetadata, writeJson } from './tilesStorage.ts'

/**
 * Build coastline-accurate earth, water, and shoreline layers for the exact release area.
 *
 * Coastline ways are clipped to the regional footprint and combined with the footprint
 * boundary to polygonise local faces. OSM coastline direction identifies land as the
 * face on the line's left. The footprint edges close fills only and are never emitted
 * in the public coastline line layer.
 */
export async function buildRegionalCoastline(
  region: Region,
  version: string,
  clip: Awaited<ReturnType<typeof prepareRegionClip>>,
  source: PreparedSource,
) {
  const landName = `${region.name}-${version}.coastline-land.geojson`
  const waterName = `${region.name}-${version}.coastline-water.geojson`
  const lineName = `${region.name}-${version}.coastline.geojson`
  const borderName = `${region.name}-${version}.regional-border.geojson`
  const landPath = resolve(OUTPUT_ROOT, region.code, landName)
  const waterPath = resolve(OUTPUT_ROOT, region.code, waterName)
  const linePath = resolve(OUTPUT_ROOT, region.code, lineName)
  const borderPath = resolve(OUTPUT_ROOT, region.code, borderName)
  note(`Building source-local coastline layers for ${region.description}.`, 'COASTLINE')
  const coastlinePath = resolve(
    OUTPUT_ROOT,
    region.code,
    `${region.name}-${version}.osm-coastline.geojson`,
  )
  const coastlinePbfPath = resolve(SOURCES_ROOT, `${region.code}.osm-coastline.pbf`)
  await run([
    'osmium',
    'tags-filter',
    source.path,
    'w/natural=coastline',
    '--output',
    coastlinePbfPath,
    '--overwrite',
  ])
  await run([
    'osmium',
    'export',
    coastlinePbfPath,
    '--geometry-types=linestring',
    '--output',
    coastlinePath,
    '--overwrite',
  ])
  const coastline = await readCoastlineFeatures(coastlinePath, clip.geojson)
  const border = await buildRegionalLandBorder(
    region,
    source.borderSourcePath ?? source.path,
    clip.geojson,
  )
  await writeJson(linePath, coastline.lines)
  await writeJson(landPath, coastline.land)
  await writeJson(waterPath, coastline.water)
  if (border) await writeJson(borderPath, border)
  return {
    land: { path: landPath, metadata: await archiveMetadata(landPath) },
    water: { path: waterPath, metadata: await archiveMetadata(waterPath) },
    line: { path: linePath, metadata: await archiveMetadata(linePath) },
    ...(border
      ? { border: { path: borderPath, metadata: await archiveMetadata(borderPath) } }
      : {}),
  }
}

/**
 * Polygonise the source coastline with the regional footprint only as temporary
 * closing geometry, then return public source-only shoreline lines and complementary
 * land/water fills.
 *
 * @param coastlinePath GeoJSON exported from the exact OSM PBF used for tiles.
 * @param clipGeojson Regional administrative footprint.
 * @returns GeoJSON ready for Planetiler's regional base layers.
 */
async function readCoastlineFeatures(
  coastlinePath: string,
  clipGeojson: ReturnType<typeof boundariesToClipGeoJson>,
) {
  const source = JSON.parse(await readFile(coastlinePath, 'utf8')) as {
    type?: string
    features?: Array<{ geometry?: unknown }>
  }
  if (source.type !== 'FeatureCollection' || !Array.isArray(source.features)) {
    throw new Error('OSM coastline export did not produce a GeoJSON FeatureCollection.')
  }

  return polygoniseCoastlineFeatures(source.features, clipGeojson)
}

/**
 * Build non-overlapping land and water faces from source coastline linework.
 *
 * Exported to keep the nested-island coverage invariant directly testable.
 */
export function polygoniseCoastlineFeatures(
  sourceFeatures: Array<{ geometry?: unknown }>,
  clipGeojson: ReturnType<typeof boundariesToClipGeoJson>,
) {
  const factory = new GeometryFactory()
  const reader = new GeoJSONReader(factory)
  const writer = new GeoJSONWriter()
  const clip = reader.read(JSON.stringify(clipGeojson.geometry)) as CoastlineGeometry
  const coastlineLines: CoastlineGeometry[] = []

  for (const feature of sourceFeatures) {
    if (!feature.geometry) continue
    const geometry = reader.read(JSON.stringify(feature.geometry)) as CoastlineGeometry
    if (geometry.isEmpty()) continue
    // Preserve only source coastline inside the release footprint for publication.
    coastlineLines.push(
      ...lineComponents(OverlayOp.intersection(geometry, clip) as CoastlineGeometry),
    )
  }

  if (coastlineLines.length === 0) {
    throw new Error('No OSM coastline intersects the regional footprint.')
  }

  // Noding the temporary footprint boundary with source lines gives Polygonizer closed faces.
  const constructionLines = new ArrayList([])
  for (const line of [...coastlineLines, ...lineComponents(clip.getBoundary())]) {
    constructionLines.add(line)
  }
  // Unary union both nodes crossings and preserves the footprint's outer face.
  // GeometryNoder can leave that large face invalid for detailed, multi-island
  // administrative boundaries, which incorrectly turns the residual mainland into water.
  const nodedLinework = new ArrayList([])
  for (const line of lineComponents(UnaryUnionOp.union(constructionLines))) {
    nodedLinework.add(line)
  }
  const polygonizer = new Polygonizer()
  polygonizer.add(nodedLinework)
  const faces = polygonizer.getPolygons().toArray() as CoastlineGeometry[]
  if (faces.length === 0) {
    throw new Error('OSM coastline could not polygonise any regional faces.')
  }

  // OSM's coastline direction places land on its left, so that side selects land faces.
  // Polygonizer represents an enclosing water area and its island faces as nested
  // polygons rather than a disjoint partition. Choose the smallest face containing
  // the left-side point to identify the local face instead of marking every enclosing
  // polygon as land.
  const pointLocator = new PointLocator()
  const facesByEnvelope = new STRtree()
  for (const face of faces) {
    facesByEnvelope.insert(face.getEnvelopeInternal(), face)
  }
  const landFaces = new Set<CoastlineGeometry>()
  for (const line of coastlineLines) {
    const face = leftSideFace(line, facesByEnvelope, pointLocator)
    if (face) landFaces.add(face)
  }
  if (landFaces.size === 0) {
    throw new Error(
      'OSM coastline did not produce complementary regional land and water.',
    )
  }

  // Polygonizer produces nested faces rather than a partition: the outer water
  // face still geometrically contains every island face. Publishing that face
  // directly would render ocean over the islands because the water layer sits
  // above earth. Derive water from the exact footprint minus all land faces so
  // its interior rings preserve every island.
  const land = unionBalanced([...landFaces]) as CoastlineGeometry
  const water = OverlayOp.difference(clip, land) as CoastlineGeometry
  const waterFaces = polygonComponents(water)
  if (waterFaces.length === 0) {
    throw new Error(
      'OSM coastline did not produce complementary regional land and water.',
    )
  }

  return {
    lines: geojsonFeatureCollection(writer, coastlineLines),
    land: geojsonFeatureCollection(writer, [...landFaces]),
    water: geojsonFeatureCollection(writer, waterFaces),
  }
}

/**
 * Extract the source relation members that form the regional footprint's non-maritime boundary.
 *
 * @param region Regional tile release being built.
 * @param sourcePath Complete OSM context used to resolve the boundary relation.
 * @param clipGeojson Dissolved regional footprint used to exclude internal GBA borders.
 * @returns Source-local linework for the intentional landward regional border layer.
 */
async function buildRegionalLandBorder(
  region: Region,
  sourcePath: string,
  clipGeojson: ReturnType<typeof boundariesToClipGeoJson>,
) {
  const relationPbfPath = resolve(
    SOURCES_ROOT,
    `${region.code}.regional-border.osm.pbf`,
  )
  const relationGeojsonPath = resolve(
    SOURCES_ROOT,
    `${region.code}.regional-border.geojson`,
  )
  const extract = await runQuiet([
    'osmium',
    'getid',
    '-r',
    '--output',
    relationPbfPath,
    '--overwrite',
    sourcePath,
    ...REGION_BOUNDARY_RELATIONS[region.code].map(id => `r${id}`),
  ])
  if (extract.exitCode !== 0) {
    note(
      `The date-matched source does not contain the regional boundary relation; omitting the optional regional_border layer.`,
      'REGIONAL BORDER',
    )
    return undefined
  }
  await run([
    'osmium',
    'export',
    relationPbfPath,
    '--geometry-types=linestring',
    '--output',
    relationGeojsonPath,
    '--overwrite',
  ])

  const source = JSON.parse(await readFile(relationGeojsonPath, 'utf8')) as {
    type?: string
    features?: Array<{ geometry?: unknown; properties?: Record<string, unknown> }>
  }
  if (source.type !== 'FeatureCollection' || !Array.isArray(source.features)) {
    throw new Error('OSM boundary export did not produce a GeoJSON FeatureCollection.')
  }

  const factory = new GeometryFactory()
  const reader = new GeoJSONReader(factory)
  const writer = new GeoJSONWriter()
  const clip = reader.read(JSON.stringify(clipGeojson.geometry)) as CoastlineGeometry
  const landBorderLines: CoastlineGeometry[] = []
  for (const feature of source.features) {
    if (
      !feature.geometry ||
      feature.properties?.boundary !== 'administrative' ||
      feature.properties?.natural === 'coastline' ||
      feature.properties?.maritime === 'yes'
    ) {
      continue
    }
    const geometry = reader.read(JSON.stringify(feature.geometry)) as CoastlineGeometry
    landBorderLines.push(
      ...lineComponents(
        OverlayOp.intersection(geometry, clip.getBoundary()) as CoastlineGeometry,
      ),
    )
  }
  if (landBorderLines.length === 0) return undefined
  return geojsonFeatureCollection(writer, landBorderLines)
}

/** Return each LineString component without exposing construction-only polygon edges. */
function lineComponents(geometry: CoastlineGeometry): CoastlineGeometry[] {
  if (geometry.isEmpty()) return []
  const type = geometry.getGeometryType()
  if (type === 'LineString' || type === 'LinearRing') return [geometry]
  if (type !== 'MultiLineString' && type !== 'GeometryCollection') return []
  const lines: CoastlineGeometry[] = []
  for (let index = 0; index < geometry.getNumGeometries(); index += 1) {
    const component = geometry.getGeometryN(index) as CoastlineGeometry
    lines.push(...lineComponents(component))
  }
  return lines
}

/** Return every Polygon component, including polygons held in a collection. */
function polygonComponents(geometry: CoastlineGeometry): CoastlineGeometry[] {
  if (geometry.isEmpty()) return []
  const type = geometry.getGeometryType()
  if (type === 'Polygon') return [geometry]
  if (type !== 'MultiPolygon' && type !== 'GeometryCollection') return []
  const polygons: CoastlineGeometry[] = []
  for (let index = 0; index < geometry.getNumGeometries(); index += 1) {
    const component = geometry.getGeometryN(index) as CoastlineGeometry
    polygons.push(...polygonComponents(component))
  }
  return polygons
}

/** Return the smallest local face containing a point infinitesimally left of a coastline. */
function leftSideFace(
  line: CoastlineGeometry,
  facesByEnvelope: STRtree,
  pointLocator: PointLocator,
): CoastlineGeometry | undefined {
  const coordinates = line.getCoordinates()
  for (let index = 1; index < coordinates.length; index += 1) {
    const previous = coordinates[index - 1]
    const current = coordinates[index]
    if (!previous || !current) continue
    const deltaX = current.x - previous.x
    const deltaY = current.y - previous.y
    const length = Math.hypot(deltaX, deltaY)
    if (length === 0) continue
    const midpointX = (previous.x + current.x) / 2
    const midpointY = (previous.y + current.y) / 2
    const offset = Math.min(length / 10, 0.000001)
    const point = new Coordinate(
      midpointX - (deltaY / length) * offset,
      midpointY + (deltaX / length) * offset,
    )
    const faces = facesByEnvelope
      .query(new Envelope(point))
      .toArray()
      .filter((face: unknown): face is CoastlineGeometry =>
        pointLocator.intersects(point, face as CoastlineGeometry),
      )
      .sort(
        (left: CoastlineGeometry, right: CoastlineGeometry) =>
          left.getArea() - right.getArea(),
      ) as CoastlineGeometry[]
    const face = faces[0]
    if (face) return face
  }
  return undefined
}

/** Serialise geometries as a GeoJSON FeatureCollection for Planetiler's GeoJSON source. */
function geojsonFeatureCollection(
  writer: GeoJSONWriter,
  geometries: CoastlineGeometry[],
) {
  return {
    type: 'FeatureCollection' as const,
    features: geometries
      .filter(geometry => !geometry.isEmpty())
      .map(geometry => ({
        type: 'Feature' as const,
        properties: {},
        geometry: writer.write(geometry),
      })),
  }
}

/** Assemble the requested administrative relations from the exact source PBF. */
export async function getRegionBoundaries(
  region: Region,
  sourcePath: string,
): Promise<OsmBoundary[]> {
  if (!(await commandSucceeds(['osmium', '--version']))) {
    throw new Error(
      'Boundary preparation requires osmium on PATH. Install osmium-tool and retry.',
    )
  }
  const relationIds = REGION_BOUNDARY_RELATIONS[region.code]
  const relationsPath = resolve(
    SOURCES_ROOT,
    `${region.code}.boundary-relations.osm.pbf`,
  )
  const geojsonPath = resolve(SOURCES_ROOT, `${region.code}.boundary-relations.geojson`)
  const extracted = await runQuiet([
    'osmium',
    'getid',
    '-r',
    '--output',
    relationsPath,
    '--overwrite',
    sourcePath,
    ...relationIds.map(id => `r${id}`),
  ])
  if (extracted.exitCode !== 0) {
    throw new Error(
      `Could not extract ${region.description} boundary relations from the source PBF.`,
    )
  }
  await run([
    'osmium',
    'export',
    relationsPath,
    '--geometry-types=polygon',
    '--add-unique-id=type_id',
    '--output',
    geojsonPath,
    '--overwrite',
  ])
  const exported = JSON.parse(await readFile(geojsonPath, 'utf8')) as {
    type?: string
    features?: Array<{
      id?: unknown
      geometry?: unknown
      properties?: Record<string, unknown>
    }>
  }
  if (exported.type !== 'FeatureCollection' || !Array.isArray(exported.features)) {
    throw new Error('OSM boundary export did not produce a GeoJSON FeatureCollection.')
  }
  const boundaries = relationIds.flatMap(id => {
    const feature = exported.features?.find(
      candidate => candidate.id === `a${id * 2 + 1}`,
    )
    if (!feature?.geometry || feature.properties?.boundary !== 'administrative')
      return []
    const geometry = feature.geometry as BoundaryGeometry
    if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') return []
    return [{ osm_id: id, geojson: geometry }]
  })
  const found = new Set(boundaries.map(boundary => boundary.osm_id))
  const missing = relationIds.filter(id => !found.has(id))
  if (missing.length > 0) {
    throw new Error(
      `Could not resolve ${region.description} boundary relations from the source PBF: ${missing.join(', ')}`,
    )
  }

  return relationIds.map(id => {
    const boundary = boundaries.find(candidate => candidate.osm_id === id)
    if (!boundary) throw new Error(`Missing boundary relation ${id}.`)
    return boundary
  })
}

export function boundariesToOsmiumPolygon(boundaries: OsmBoundary[]) {
  const rings: string[] = []
  let ringIndex = 0

  for (const boundary of boundaries) {
    const polygons =
      boundary.geojson.type === 'Polygon'
        ? [boundary.geojson.coordinates]
        : boundary.geojson.coordinates

    for (const polygon of polygons) {
      for (const [index, ring] of polygon.entries()) {
        if (ring.length < 4 || ring.some(point => point.length < 2)) {
          throw new Error(`Invalid polygon ring for OSM relation ${boundary.osm_id}`)
        }
        ringIndex += 1
        rings.push(
          `${index === 0 ? '' : '!'}${ringIndex}\n${ring
            .map(([longitude, latitude]) => `${longitude} ${latitude}`)
            .join('\n')}\nEND`,
        )
      }
    }
  }

  return `gba\n${rings.join('\n')}\nEND\n`
}

export function boundariesToClipGeoJson(boundaries: OsmBoundary[]) {
  if (boundaries.length === 0)
    throw new Error('Cannot create a clip from no boundaries.')

  const factory = new GeometryFactory()
  const reader = new GeoJSONReader(factory)
  const writer = new GeoJSONWriter()
  const geometries = boundaries
    .map(boundary => reader.read(JSON.stringify(boundary.geojson)))
    .sort((left, right) =>
      left.getEnvelopeInternal().compareTo(right.getEnvelopeInternal()),
    )
  const unioned = unionBalanced(geometries)
  if (!IsValidOp.isValid(unioned)) {
    throw new Error('Region boundary union did not produce a valid clipping geometry.')
  }
  const geometry = writer.write(unioned) as BoundaryGeometry
  if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') {
    throw new Error('Region boundary union produced unsupported geometry.')
  }
  return { type: 'Feature' as const, properties: {}, geometry }
}

function unionBalanced(geometries: Geometry[]): Geometry {
  let current = geometries
  while (current.length > 1) {
    const next: Geometry[] = []
    for (let index = 0; index < current.length; index += 2) {
      const left = current[index]
      const right = current[index + 1]
      if (!left) throw new Error('Region boundary union is empty.')
      next.push(right ? UnionOp.union(left, right) : left)
    }
    current = next
  }
  const result = current[0]
  if (!result) throw new Error('Region boundary union is empty.')
  return result
}
