import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { GeoJsonGeometry } from '@repo/core/pipeline/geojson'
import type { ParsedArgs } from '../../../harbour-cli/src/lib/cli/options.ts'
import { simplifyPolygonCoverage } from '../../../harbour-cli/src/lib/geometry/simplifyPolygonCoverage.ts'

export async function runGeometrySimplifyCoverageCommand(
  args: ParsedArgs,
  printUsage: () => void,
) {
  const inputPath = args.positionals[0]
  const outputPath = args.options.output
  const toleranceMetres = args.options['tolerance-metres']
  if (
    !inputPath ||
    args.positionals.length !== 1 ||
    typeof outputPath !== 'string' ||
    typeof toleranceMetres !== 'string' ||
    !Number.isFinite(Number(toleranceMetres)) ||
    Number(toleranceMetres) <= 0
  ) {
    printUsage()
    throw new Error(
      'geometry:simplify-coverage requires <input.json>, --output PATH and a positive --tolerance-metres value.',
    )
  }
  const input = await readFile(resolve(inputPath), 'utf8')
  const payload = parseInput(input)
  const result = await simplifyPolygonCoverage(
    payload.geometries,
    Number(toleranceMetres),
  )
  await writeFile(resolve(outputPath), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
}

function parseInput(value: string): { geometries: GeoJsonGeometry[] } {
  let payload: unknown
  try {
    payload = JSON.parse(value)
  } catch {
    throw new Error('geometry:simplify-coverage input must be JSON.')
  }
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    !('geometries' in payload) ||
    !Array.isArray(payload.geometries) ||
    payload.geometries.some(geometry => !isGeoJsonGeometry(geometry))
  ) {
    throw new Error(
      'geometry:simplify-coverage input requires a GeoJSON geometry array in its geometries field.',
    )
  }
  return { geometries: payload.geometries }
}

function isGeoJsonGeometry(value: unknown): value is GeoJsonGeometry {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'type' in value &&
    typeof value.type === 'string'
  )
}
