import { parquetMetadataAsync, parquetRead, parquetSchema } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'
import { asyncBufferFromFile } from 'hyparquet/src/node.js'

import type { UploadPlan } from '@repo/core'

type TrackedColumn = 'country' | 'theme' | 'type' | 'region' | 'norms'

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
]

export async function checkOvertureUploadAssumptions(
  filePath: string,
  plan: UploadPlan,
) {
  if (plan.source !== 'overture' || plan.type !== 'division') {
    return []
  }

  const summary = await summarizeDivisionAssumptionColumns(filePath)
  return evaluateDivisionAssumptions(summary)
}

export function evaluateDivisionAssumptions(summary: DivisionAssumptionSummary) {
  const warnings: string[] = []

  const country = summary.country
  if (country && country.distinctValues.length !== 1) {
    warnings.push(
      `Dropped field \`country\` is no longer single-valued; found ${country.distinctValues.length} distinct non-null values.`,
    )
  }

  const theme = summary.theme
  if (theme && theme.distinctValues.length !== 1) {
    warnings.push(
      `Dropped field \`theme\` is no longer single-valued; found ${theme.distinctValues.length} distinct non-null values.`,
    )
  }

  const type = summary.type
  if (type && type.distinctValues.length !== 1) {
    warnings.push(
      `Dropped field \`type\` is no longer single-valued; found ${type.distinctValues.length} distinct non-null values.`,
    )
  }

  const region = summary.region
  if (region && region.nonNullCount > 0) {
    warnings.push(
      `Dropped field \`region\` is no longer all null; found ${region.nonNullCount} non-null rows.`,
    )
  }

  const norms = summary.norms
  if (norms && norms.distinctValues.length > 1) {
    warnings.push(
      `Dropped field \`norms\` is no longer effectively uniform; found ${norms.distinctValues.length} distinct non-null values.`,
    )
  }

  return warnings
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
  const summaries = new Map<TrackedColumn, { distinct: Set<string>; nonNullCount: number }>(
    columns.map(column => [column, { distinct: new Set<string>(), nonNullCount: 0 }]),
  )

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
