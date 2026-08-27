import { resolve } from 'node:path'

import type { GeoJsonGeometry } from '@repo/core/pipeline/geojson'

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const SIMPLIFIER_SCRIPT = resolve(
  REPO_ROOT,
  'apps/harbour-dataops/simplifyPolygonCoverage.py',
)
const DEFAULT_PYTHON = resolve(REPO_ROOT, 'apps/harbour-dataops/.venv/bin/python')

type SimplifiedCoverage = {
  engine: string
  engineVersion: string
  geometries: GeoJsonGeometry[]
  inputValidationRepairIndexes: number[]
}

/**
 * Simplifies a WGS84 polygon coverage with Shapely/GEOS. The Python helper
 * keeps WGS84 at its interface and only uses a local metre plane internally to
 * apply the requested tolerance.
 */
export async function simplifyPolygonCoverage(
  geometries: GeoJsonGeometry[],
  toleranceMetres: number,
): Promise<SimplifiedCoverage> {
  const python = process.env.SAANSEOI_GEOMETRY_PYTHON ?? DEFAULT_PYTHON
  const child = Bun.spawn([python, SIMPLIFIER_SCRIPT], {
    cwd: REPO_ROOT,
    stderr: 'pipe',
    stdin: new Blob([JSON.stringify({ geometries, toleranceMetres })]),
    stdout: 'pipe',
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (exitCode !== 0) {
    throw new Error(
      `Shapely coverage simplification failed: ${
        stderr.trim() || `exit code ${exitCode}`
      }. Ensure the UV geometry runtime is installed with \`uv sync --project apps/harbour-dataops --python 3.12\`.`,
    )
  }

  let output: unknown
  try {
    output = JSON.parse(stdout)
  } catch {
    throw new Error('Shapely coverage simplification returned invalid JSON.')
  }
  if (!isSimplifiedCoverage(output) || output.geometries.length !== geometries.length) {
    throw new Error(
      'Shapely coverage simplification returned an invalid geometry result.',
    )
  }
  return output
}

function isSimplifiedCoverage(value: unknown): value is SimplifiedCoverage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Partial<SimplifiedCoverage>
  return (
    typeof candidate.engine === 'string' &&
    typeof candidate.engineVersion === 'string' &&
    Array.isArray(candidate.geometries) &&
    candidate.geometries.every(isGeoJsonGeometry) &&
    Array.isArray(candidate.inputValidationRepairIndexes) &&
    candidate.inputValidationRepairIndexes.every(
      index => typeof index === 'number' && Number.isInteger(index) && index >= 0,
    )
  )
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
