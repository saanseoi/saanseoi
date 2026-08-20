import { createRequire } from 'node:module'

import { readFileGeodatabaseArchive } from '../fileGeodatabase.ts'
import { unzipSafeArchive } from '../zipArchive.ts'

const require = createRequire(import.meta.url)

export const HKGOV_TD_PEDESTRIAN_STREET_LAYERS = [
  'Part_time_Pedestrian_Street',
  'Hawker_Street',
  'Market_Street',
  'Traffic_Calming_Street',
  'Full_Time_Pedestrian_Street',
] as const

export type HkgovTdPedestrianStreetLayer =
  (typeof HKGOV_TD_PEDESTRIAN_STREET_LAYERS)[number]

export type HkgovTdPedestrianStreetFeature = {
  geometry: GeoJsonGeometry | null
  properties: {
    EN_Description?: string
    End_Time?: string
    OBJECTID?: number
    Region?: string
    SC_Description?: string
    SHAPE_Area?: number
    SHAPE_Length?: number
    Start_Time?: string
    TC_Description?: string
  }
  type: 'Feature'
}

export type HkgovTdPedestrianStreetCollection = {
  features: HkgovTdPedestrianStreetFeature[]
  type: 'FeatureCollection'
}

type GeoJsonGeometry = {
  coordinates: unknown
  type: 'MultiPolygon' | 'Point' | 'Polygon'
}

export type HkgovHydStreetArchiveKind =
  | 'streetNamePlate'
  | 'sensitiveStreet'
  | 'strategicStreet'

type HkgovHydStreetFeature = {
  geometry: GeoJsonGeometry
  properties: Record<string, unknown>
  type: 'Feature'
}

type HkgovHydStreetCollection = {
  features: HkgovHydStreetFeature[]
  type: 'FeatureCollection'
}

const HKGOV_HYD_STREET_PROFILES: Record<
  HkgovHydStreetArchiveKind,
  {
    geometry: 'Point' | 'Polygon'
    layer: string
    required: string[]
  }
> = {
  streetNamePlate: {
    geometry: 'Point',
    layer: 'SNP',
    required: ['SNP_ID', 'LVL', 'ROAD_NAME'],
  },
  sensitiveStreet: {
    geometry: 'Polygon',
    layer: 'sensitive',
    required: ['LVL', 'SECT_BTWN', 'ST_ENGNM'],
  },
  strategicStreet: {
    geometry: 'Polygon',
    layer: 'STRATEGIC',
    required: ['LVL', 'SECT_BTWN', 'ST_ENGNM'],
  },
}

const PEDESTRIAN_FIELDS = [
  'OBJECTID',
  'SHAPE',
  'Region',
  'Start_Time',
  'End_Time',
  'SHAPE_Length',
  'SHAPE_Area',
  'TC_Description',
  'SC_Description',
  'EN_Description',
] as const

/**
 * Reads the five published TD pedestrian-street layers from the native File
 * Geodatabase. It intentionally does not accept CSDI's converted GeoJSON.
 */
export function readHkgovTdPedestrianStreetArchive(
  archiveBytes: Uint8Array,
): Record<HkgovTdPedestrianStreetLayer, HkgovTdPedestrianStreetCollection> {
  const entries = unzipSafeArchive(archiveBytes)
  const readTable = createNativeFgdbTableReader()
  const items = readTable(entries, 4)
  if (!isFeatureCollection(items)) {
    throw new Error('TD pedestrian archive has no readable FileGDB item catalogue.')
  }

  const layers = {} as Record<
    HkgovTdPedestrianStreetLayer,
    HkgovTdPedestrianStreetCollection
  >
  for (const layerName of HKGOV_TD_PEDESTRIAN_STREET_LAYERS) {
    const item = items.features.find(feature => {
      const properties = featureProperties(feature)
      return properties?.Name === layerName
    })
    const dsid = readDsId(featureProperties(item)?.Definition)
    if (dsid === undefined) {
      throw new Error(`TD pedestrian archive does not define ${layerName}.`)
    }

    // In FileGDB archives, the physical table is allocated from the dataset
    // ID after the nine system datasets. The catalogue definition is the
    // authoritative link; no filename or converted delivery is assumed.
    const collection = readTable(entries, dsid - 9)
    layers[layerName] = validatePedestrianLayer(layerName, collection)
  }
  return layers
}

/** Reads one native HyD FileGDB street package and validates its published layer. */
export async function readHkgovHydStreetArchive(
  kind: HkgovHydStreetArchiveKind,
  archiveBytes: Uint8Array,
): Promise<HkgovHydStreetCollection> {
  const profile = HKGOV_HYD_STREET_PROFILES[kind]
  const layers = await readFileGeodatabaseArchive(archiveBytes)
  const matches = Object.entries(layers).filter(([name]) => name === profile.layer)
  if (matches.length !== 1) {
    throw new Error(
      `HyD ${kind} archive must contain exactly one ${profile.layer} layer.`,
    )
  }
  const collection = matches[0]?.[1]
  if (!isFeatureCollection(collection) || collection.features.length === 0) {
    throw new Error(`HyD ${kind} ${profile.layer} layer has no features.`)
  }
  return {
    type: 'FeatureCollection',
    features: collection.features.map((feature, index) => {
      const candidate = feature as unknown
      if (
        !isRecord(candidate) ||
        ('type' in candidate && candidate.type !== 'Feature')
      ) {
        throw new Error(`HyD ${kind} feature ${index + 1} is invalid.`)
      }
      const properties = featureProperties(candidate)
      if (!properties)
        throw new Error(`HyD ${kind} feature ${index + 1} has no fields.`)
      for (const field of profile.required) {
        if (properties[field] === undefined || properties[field] === '') {
          throw new Error(`HyD ${kind} feature ${index + 1} requires ${field}.`)
        }
      }
      if (!isHydGeometry(candidate.geometry, profile.geometry)) {
        throw new Error(`HyD ${kind} feature ${index + 1} has an invalid SHAPE.`)
      }
      const level = optionalInteger(properties.LVL)
      if (level === undefined) {
        throw new Error(`HyD ${kind} feature ${index + 1} has an invalid LVL.`)
      }
      return {
        type: 'Feature' as const,
        geometry: candidate.geometry,
        properties: { ...properties, LVL: level === 0xffffffff ? -1 : level },
      }
    }),
  }
}

function validatePedestrianLayer(
  layerName: HkgovTdPedestrianStreetLayer,
  value: unknown,
): HkgovTdPedestrianStreetCollection {
  if (!isFeatureCollection(value) || value.features.length === 0) {
    throw new Error(`TD pedestrian ${layerName} layer has no features.`)
  }
  const features = value.features.map((feature, index) => {
    if (!isRecord(feature) || feature.type !== 'Feature') {
      throw new Error(`TD pedestrian ${layerName} feature ${index + 1} is invalid.`)
    }
    const properties = featureProperties(feature)
    if (!properties) {
      throw new Error(`TD pedestrian ${layerName} feature ${index + 1} has no fields.`)
    }
    for (const field of PEDESTRIAN_FIELDS) {
      if (field === 'SHAPE' || field === 'Start_Time' || field === 'End_Time') continue
      if (!(field in properties)) {
        throw new Error(
          `TD pedestrian ${layerName} feature ${index + 1} is missing ${field}.`,
        )
      }
    }
    const objectId = optionalInteger(properties.OBJECTID)
    if (objectId === undefined) {
      throw new Error(
        `TD pedestrian ${layerName} feature ${index + 1} has no OBJECTID.`,
      )
    }
    const geometry = feature.geometry === undefined ? null : feature.geometry
    if (!isGeometryOrNull(geometry)) {
      throw new Error(
        `TD pedestrian ${layerName} feature ${index + 1} has invalid SHAPE.`,
      )
    }
    return {
      type: 'Feature' as const,
      geometry,
      properties: {
        OBJECTID: objectId,
        Region: optionalString(properties.Region),
        Start_Time: optionalString(properties.Start_Time),
        End_Time: optionalString(properties.End_Time),
        SHAPE_Length: optionalFiniteNumber(properties.SHAPE_Length),
        SHAPE_Area: optionalFiniteNumber(properties.SHAPE_Area),
        TC_Description: optionalString(properties.TC_Description),
        SC_Description: optionalString(properties.SC_Description),
        EN_Description: optionalString(properties.EN_Description),
      },
    }
  })
  return { type: 'FeatureCollection', features }
}

/**
 * `fgdb@1` reads the geometry correctly, but predates FileGDB string defaults
 * used by this publisher package. Patch only its private field-descriptor
 * module, then load a fresh table reader. The archive is still parsed directly
 * from its native `.gdbtable` and `.gdbtablx` members.
 */
function createNativeFgdbTableReader() {
  const fieldsPath = require.resolve('fgdb/lib/fields')
  const rowsPath = require.resolve('fgdb/lib/rows')
  const readPath = require.resolve('fgdb/lib/read')
  const moduleApi = require('node:module') as {
    _nodeModulePaths(path: string): string[]
    new (
      id: string,
    ): {
      _compile(source: string, filename: string): void
      filename: string
      paths: string[]
    }
  }
  const fs = require('node:fs') as {
    readFileSync(path: string, encoding: string): string
  }
  const path = require('node:path') as { dirname(path: string): string }
  const source = fs.readFileSync(fieldsPath, 'utf8')
  const patched = source.replace(
    '    out.offset = ++offset;\n    return out;',
    [
      '    // Modern FileGDB string descriptors may carry a UTF-8 default value.',
      '    // The original reader only skipped its length byte.',
      '    var defaultLength = data.getUint8(offset++, true);',
      '    offset += defaultLength;',
      '    out.offset = offset;',
      '    return out;',
    ].join('\n'),
  )
  if (patched === source) {
    throw new Error('Installed FileGDB reader no longer has the expected descriptor.')
  }
  const patchedModule = new moduleApi(fieldsPath)
  patchedModule.filename = fieldsPath
  patchedModule.paths = moduleApi._nodeModulePaths(path.dirname(fieldsPath))
  patchedModule._compile(patched, fieldsPath)
  const cache = require.cache as Record<string, unknown>
  cache[fieldsPath] = patchedModule

  const rowsSource = fs.readFileSync(rowsPath, 'utf8')
  const patchedRows = rowsSource
    .replace(
      'var out = rowOffsets.map(function(offset){',
      'var out = rowOffsets.map(function(offset, rowIndex){',
    )
    .replace(
      "        var row = dataTypes[field.type](data, field);\n        //console.log('row',row);",
      [
        '        var row = dataTypes[field.type](data, field);',
        '        // FileGDB OID is the one-based table-index position.',
        '        if(field.type === 6 && fieldInfo.geometry){',
        '          out.properties[field.title] = rowIndex + 1;',
        '          return;',
        '        }',
        "        //console.log('row',row);",
      ].join('\n'),
    )
    .replace(
      '      if(nullGeometry){\n        return false;\n      }else{\n        return out;\n      }',
      '      return out;',
    )
  if (patchedRows === rowsSource) {
    throw new Error('Installed FileGDB reader no longer has the expected row decoder.')
  }
  const patchedRowsModule = new moduleApi(rowsPath)
  patchedRowsModule.filename = rowsPath
  patchedRowsModule.paths = moduleApi._nodeModulePaths(path.dirname(rowsPath))
  patchedRowsModule._compile(patchedRows, rowsPath)

  cache[rowsPath] = patchedRowsModule
  delete cache[readPath]
  const read = require('fgdb/lib/read') as (
    table: Uint8Array,
    tableIndex: Uint8Array,
  ) => unknown
  return (entries: Record<string, Uint8Array>, tableId: number) => {
    if (!Number.isInteger(tableId) || tableId < 0) {
      throw new Error(`Invalid FileGDB table ID ${tableId}.`)
    }
    const suffix = tableId.toString(16).padStart(8, '0')
    const table = findGdbMember(entries, `a${suffix}.gdbtable`)
    const tableIndex = findGdbMember(entries, `a${suffix}.gdbtablx`)
    if (!table || !tableIndex) {
      throw new Error(`TD pedestrian archive is missing FileGDB table ${tableId}.`)
    }
    return read(table, tableIndex)
  }
}

function findGdbMember(entries: Record<string, Uint8Array>, suffix: string) {
  const expected = suffix.toLowerCase()
  return Object.entries(entries).find(([path]) =>
    path.toLowerCase().endsWith(expected),
  )?.[1]
}

function readDsId(value: unknown) {
  if (typeof value !== 'string') return undefined
  const match = value.match(/<DSID>(\d+)<\/DSID>/)
  return match ? Number(match[1]) : undefined
}

function featureProperties(value: unknown) {
  if (!isRecord(value) || !isRecord(value.properties)) return undefined
  return value.properties
}

function isFeatureCollection(value: unknown): value is {
  features: unknown[]
  type: 'FeatureCollection'
} {
  return (
    isRecord(value) &&
    value.type === 'FeatureCollection' &&
    Array.isArray(value.features)
  )
}

function isGeometryOrNull(value: unknown): value is GeoJsonGeometry | null {
  return (
    value === null ||
    (isRecord(value) &&
      (value.type === 'Polygon' || value.type === 'MultiPolygon') &&
      'coordinates' in value)
  )
}

function isHydGeometry(
  value: unknown,
  expected: 'Point' | 'Polygon',
): value is GeoJsonGeometry {
  if (!isRecord(value) || !('coordinates' in value)) return false
  return expected === 'Point'
    ? value.type === 'Point'
    : value.type === 'Polygon' || value.type === 'MultiPolygon'
}

function optionalString(value: unknown) {
  if (typeof value !== 'string') return undefined
  // fgdb@1 decodes its byte strings as Latin-1. The publisher's Chinese source
  // text is UTF-8, so repair it before it enters the source assertion table.
  if (![...value].every(character => character.codePointAt(0)! <= 0xff)) return value
  return new TextDecoder().decode(
    Uint8Array.from(value, character => character.charCodeAt(0)),
  )
}

function optionalFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function optionalInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
