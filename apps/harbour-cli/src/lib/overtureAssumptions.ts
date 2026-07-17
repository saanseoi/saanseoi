import { parquetMetadataAsync, parquetRead, parquetSchema } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'
import { asyncBufferFromFile } from 'hyparquet/src/node.js'

import type { UploadPlan } from '@repo/core'

type TrackedColumn = 'country' | 'theme' | 'type' | 'region' | 'norms' | 'perspectives'

type ColumnSummary = {
  distinctValues: string[]
  nonNullCount: number
}

type DivisionAssumptionSummary = Partial<Record<TrackedColumn, ColumnSummary>>

const DIVISION_ASSUMPTION_COLUMNS: TrackedColumn[] = [
  'country',
  'theme',
  'type',
  'region',
  'norms',
  'perspectives',
]

export async function checkOvertureUploadAssumptions(
  filePath: string,
  plan: UploadPlan,
) {
  if (
    plan.source !== 'overture' ||
    !['division', 'divisionArea', 'divisionBoundary'].includes(plan.type)
  ) {
    return []
  }

  const summary = await summarizeDivisionAssumptionColumns(filePath)
  return evaluateDivisionAssumptions(summary, plan.type, plan.regionCode)
}

export function evaluateDivisionAssumptions(
  summary: DivisionAssumptionSummary,
  resourceType: UploadPlan['type'] = 'division',
  regionCode: UploadPlan['regionCode'] = 'hk',
) {
  const warnings: string[] = []
  const isHkDivisionGeometry =
    regionCode === 'hk' &&
    (resourceType === 'divisionArea' || resourceType === 'divisionBoundary')

  const country = summary.country
  const expectedGeometryCountries = new Set(['"CN"', '"HK"'])
  if (
    country &&
    (isHkDivisionGeometry
      ? country.distinctValues.some(value => !expectedGeometryCountries.has(value))
      : country.distinctValues.length !== 1)
  ) {
    warnings.push(
      formatAssumptionWarning(
        'country',
        'single-valued',
        `${country.distinctValues.length} distinct non-null values`,
      ),
    )
  }

  const theme = summary.theme
  if (theme && theme.distinctValues.length !== 1) {
    warnings.push(
      formatAssumptionWarning(
        'theme',
        'single-valued',
        `${theme.distinctValues.length} distinct non-null values`,
      ),
    )
  }

  const type = summary.type
  if (type && type.distinctValues.length !== 1) {
    warnings.push(
      formatAssumptionWarning(
        'type',
        'single-valued',
        `${type.distinctValues.length} distinct non-null values`,
      ),
    )
  }

  const region = summary.region
  const expectedGeometryRegions = new Set(['"CN-GD"'])
  if (
    region &&
    (isHkDivisionGeometry
      ? region.distinctValues.some(value => !expectedGeometryRegions.has(value))
      : region.nonNullCount > 0)
  ) {
    warnings.push(
      formatAssumptionWarning(
        'region',
        'all null',
        `${region.nonNullCount} non-null rows`,
      ),
    )
  }

  const norms = summary.norms
  if (norms && norms.distinctValues.length > 1) {
    warnings.push(
      formatAssumptionWarning(
        'norms',
        'effectively uniform',
        `${norms.distinctValues.length} distinct non-null values`,
      ),
    )
  }

  if (resourceType === 'divisionBoundary') {
    const perspectives = summary.perspectives
    if (perspectives && perspectives.nonNullCount > 0) {
      warnings.push(
        formatAssumptionWarning(
          'perspectives',
          'empty',
          `${perspectives.nonNullCount} non-null rows`,
        ),
      )
    }
  }

  return warnings
}

function formatAssumptionWarning(
  field: TrackedColumn,
  expected: string,
  actual: string,
) {
  return `${yellowText('⚠')} Dropped field ${cyanText(`\`${field}\``)} should be ${greenText(expected)}; found ${redText(actual)}.`
}

function cyanText(value: string) {
  return `\u001B[36m${value}\u001B[39m`
}

function greenText(value: string) {
  return `\u001B[32m${value}\u001B[39m`
}

function redText(value: string) {
  return `\u001B[31m${value}\u001B[39m`
}

function yellowText(value: string) {
  return `\u001B[33m${value}\u001B[39m`
}

async function summarizeDivisionAssumptionColumns(filePath: string) {
  const file = await asyncBufferFromFile(filePath)
  const metadata = await parquetMetadataAsync(file)
  const schema = parquetSchema(metadata)
  const availableColumns = new Set(
    schema.children.map(child => String(child.element.name)),
  )
  const columns = DIVISION_ASSUMPTION_COLUMNS.filter(column =>
    availableColumns.has(column),
  )
  const summaries = new Map<
    TrackedColumn,
    { distinct: Set<string>; nonNullCount: number }
  >(columns.map(column => [column, { distinct: new Set<string>(), nonNullCount: 0 }]))

  if (columns.length === 0) {
    return {}
  }

  await parquetRead({
    file,
    columns,
    compressors,
    onChunk({ columnName, columnData }) {
      const summary = summaries.get(columnName as TrackedColumn)

      if (!summary) {
        return
      }

      for (const value of Array.from(columnData as ArrayLike<unknown>)) {
        if (value === null || value === undefined) {
          continue
        }

        summary.nonNullCount += 1
        summary.distinct.add(stableStringify(value))
      }
    },
  })

  return Object.fromEntries(
    [...summaries.entries()].map(([column, summary]) => [
      column,
      {
        distinctValues: [...summary.distinct].sort(),
        nonNullCount: summary.nonNullCount,
      } satisfies ColumnSummary,
    ]),
  ) as DivisionAssumptionSummary
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value))
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue)
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, sortJsonValue(nestedValue)]),
    )
  }

  return value
}
