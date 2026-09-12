import { createHash } from 'node:crypto'
import { stableJsonStringify } from '@repo/core/pipeline/utils'

type Row = Record<string, unknown>
type Field = Row & { datasetCode: string; fieldName: string; measureCode: string }
type Measure = Row & { datasetCode: string; measureCode: string }

const assertionColumns = new Set([
  'createdAt',
  'updatedAt',
  'validFrom',
  'validTo',
  'isCurrent',
  'sourceReleaseId',
  'sourceFeatureRef',
  'versionHash',
  'measureVersionHash',
])

/** Canonical content hashes do not depend on object insertion order. */
export function hashStatisticContent(value: unknown) {
  const serialised = stableJsonStringify(value)
  if (typeof serialised !== 'string')
    throw new Error('Invalid canonical statistic content.')
  return createHash('sha256').update(serialised).digest('hex')
}

/** Retain the exact field meaning and localisations used by each packed value. */
export function versionStatisticsDefinitions<
  F extends Field,
  M extends Measure,
>(input: { fields: F[]; fieldsI18n: Row[]; measures: M[]; measuresI18n: Row[] }) {
  const measureVersions = new Map<string, string>()
  const measures = input.measures.map(measure => {
    const versionHash = hashStatisticContent({
      measure: definition(measure),
      localisations: localisations(
        input.measuresI18n,
        measure.datasetCode,
        'measureCode',
        measure.measureCode,
      ),
    })
    measureVersions.set(
      `${measure.datasetCode}\u0000${measure.measureCode}`,
      versionHash,
    )
    return { ...measure, versionHash }
  })
  const fieldDefinitionHashes = new Map<string, string>()
  const fields = input.fields.map(field => {
    const measureVersionHash = requiredVersion(
      measureVersions,
      field.datasetCode,
      field.measureCode,
    )
    const versionHash = hashStatisticContent({
      field: definition(field),
      localisations: localisations(
        input.fieldsI18n,
        field.datasetCode,
        'fieldName',
        field.fieldName,
      ),
      measureVersionHash,
    })
    fieldDefinitionHashes.set(
      `${field.datasetCode}\u0000${field.fieldName}`,
      versionHash,
    )
    return { ...field, measureVersionHash, versionHash }
  })
  return {
    fields,
    fieldsI18n: input.fieldsI18n.map(row => ({
      ...row,
      versionHash: requiredVersion(
        fieldDefinitionHashes,
        row.datasetCode,
        row.fieldName,
      ),
    })),
    measures,
    measuresI18n: input.measuresI18n.map(row => ({
      ...row,
      versionHash: requiredVersion(measureVersions, row.datasetCode, row.measureCode),
    })),
    fieldDefinitionHashes,
  }
}

function definition(row: Row) {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !assertionColumns.has(key)),
  )
}

function localisations(
  rows: Row[],
  datasetCode: string,
  identityColumn: string,
  identity: string,
) {
  return rows
    .filter(row => row.datasetCode === datasetCode && row[identityColumn] === identity)
    .map(definition)
    .sort((left, right) => String(left.locale).localeCompare(String(right.locale)))
}

function requiredVersion(
  versions: Map<string, string>,
  dataset: unknown,
  code: unknown,
) {
  const version = versions.get(`${dataset}\u0000${code}`)
  if (!version) throw new Error(`Missing statistics definition for ${dataset}/${code}.`)
  return version
}
