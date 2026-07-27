import {
  parquetMetadataAsync,
  parquetRead,
  parquetSchema,
  type AsyncBuffer,
} from 'hyparquet'
import { compressors } from 'hyparquet-compressors'

import type { UploadInspection } from '../types'

/**
 * Reads a parquet buffer, extracts its schema, and collects distinct values
 * for the small set of classification columns used during upload planning.
 */
export async function inspectParquetFromBuffer(
  file: AsyncBuffer | ArrayBuffer,
): Promise<UploadInspection> {
  const metadata = await parquetMetadataAsync(file)
  const schema = extractSchema(metadata)
  const availableColumns = new Set(schema.map(field => field.name))
  const distinctByColumn = {
    theme: new Set<string>(),
    type: new Set<string>(),
    country: new Set<string>(),
    region: new Set<string>(),
  }
  const columns = Object.keys(distinctByColumn).filter(column =>
    availableColumns.has(column),
  )

  if (columns.length > 0) {
    await parquetRead({
      file,
      columns,
      compressors,
      onChunk({ columnName, columnData }) {
        const values = distinctByColumn[columnName as keyof typeof distinctByColumn]
        if (!values) {
          return
        }

        for (const value of Array.from(columnData as ArrayLike<unknown>)) {
          if (value !== null && value !== undefined) {
            values.add(String(value))
          }
        }
      },
    })
  }

  return {
    rowCount: Number(metadata.num_rows),
    schema,
    distinctThemeValues: [...distinctByColumn.theme].sort(),
    distinctTypeValues: [...distinctByColumn.type].sort(),
    distinctCountryValues: [...distinctByColumn.country].sort(),
    distinctRegionValues: [...distinctByColumn.region].sort(),
  }
}

/**
 * Converts hyparquet metadata into the simplified schema shape exposed by Harbour.
 */
function extractSchema(metadata: Awaited<ReturnType<typeof parquetMetadataAsync>>) {
  const schema = parquetSchema(metadata)

  return schema.children.map(child => ({
    name: String(child.element.name),
    type: formatFieldType(child),
    nullable: isNullableField(child),
  }))
}

type SchemaElementLike = {
  name?: string
  type?: unknown
  converted_type?: unknown
  convertedType?: unknown
  logicalType?: unknown
  logical_type?: unknown
  repetition_type?: unknown
  repetitionType?: unknown
}

type SchemaTreeLike = {
  element: SchemaElementLike
  children?: Array<unknown>
}

/**
 * Normalises a parquet schema node into a human-readable field type string.
 */
export function formatFieldType(node: SchemaTreeLike) {
  const logicalType = extractLogicalType(node.element)

  if (logicalType) {
    return normaliseLogicalType(logicalType)
  }

  const convertedType = node.element.converted_type ?? node.element.convertedType
  if (convertedType) {
    return String(convertedType).toLowerCase()
  }

  const primitiveType = node.element.type
  if (primitiveType) {
    return normalisePrimitiveType(String(primitiveType))
  }

  if ((node.children?.length ?? 0) > 0) {
    return 'struct'
  }

  return 'unknown'
}

/**
 * Extracts a logical type name from the schema element when one is present.
 */
function extractLogicalType(element: SchemaElementLike) {
  const logicalType = element.logicalType ?? element.logical_type

  if (typeof logicalType === 'string') {
    return logicalType.toLowerCase()
  }

  if (logicalType && typeof logicalType === 'object') {
    const type = (logicalType as { type?: unknown }).type

    if (typeof type === 'string') {
      return type.toLowerCase()
    }

    const keys = Object.keys(logicalType)
    if (keys.length > 0) {
      return keys[0]?.toLowerCase() ?? null
    }
  }

  return null
}

/**
 * Parquet logical types are represented in two shapes by hyparquet: legacy
 * annotations use their type name as an object key, while newer PyArrow files
 * use `{ type: 'STRING' }`. Normalise both to the Harbour schema vocabulary.
 */
export function normaliseLogicalType(logicalType: string) {
  switch (logicalType.toLowerCase()) {
    case 'string':
      return 'utf8'
    case 'list':
      return 'list'
    case 'map':
      return 'map'
    default:
      // Geometry and extension logical types do not have a more specific
      // Harbour schema representation.
      return 'type'
  }
}

function normalisePrimitiveType(primitiveType: string) {
  switch (primitiveType.toUpperCase()) {
    case 'INT32':
      return 'int_32'
    case 'INT64':
      return 'int_64'
    default:
      return primitiveType.toLowerCase()
  }
}

/**
 * Treats non-`REQUIRED` parquet fields as nullable for upload schema checks.
 */
function isNullableField(node: { element: SchemaElementLike }) {
  const repetitionType = node.element.repetition_type ?? node.element.repetitionType

  if (typeof repetitionType === 'string') {
    return repetitionType.toUpperCase() !== 'REQUIRED'
  }

  return true
}
