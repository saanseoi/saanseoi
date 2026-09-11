import type { CanonicalStatsGeography } from '@repo/db'
import {
  recordIdentifier,
  statisticSourceGeography,
  type CanonicalStatsRows,
} from './normaliseHkgovCenstatdStatistics'
import {
  versionStatisticsDefinitions,
  hashStatisticContent,
} from './statisticsRecordIdentity'

export type RetainedSqlRow = Record<string, unknown>
export type RetainedStatisticsInput = {
  records: RetainedSqlRow[]
  fields: RetainedSqlRow[]
  fieldsI18n: RetainedSqlRow[]
  measures: RetainedSqlRow[]
  measuresI18n: RetainedSqlRow[]
  sourceVersion: string
  sourceProperties: (sourceFeatureRef: string) => Record<string, unknown>
}

/** Repack reviewed canonical values without rerunning field curation or translation. */
export function packRetainedStatistics(input: RetainedStatisticsInput) {
  const definitions = versionStatisticsDefinitions({
    fields: input.fields.map(definitionRow) as CanonicalStatsRows['fields'],
    fieldsI18n: input.fieldsI18n.map(definitionRow),
    measures: input.measures.map(definitionRow) as CanonicalStatsRows['measures'],
    measuresI18n: input.measuresI18n.map(definitionRow),
  })
  const records = new Map<string, CanonicalStatsRows['records'][number]>()
  const mappings: Array<{
    legacyId: string
    legacyVersionHash: string | null
    packedId: string
    fields: string[]
  }> = []
  for (const row of input.records) {
    const datasetCode = required(row.datasetCode, 'datasetCode')
    const sourceFeatureRef = required(row.sourceFeatureRef, 'sourceFeatureRef')
    const referencePeriodCode = required(row.referencePeriodCode, 'referencePeriodCode')
    const geography = object(row.geography) as CanonicalStatsGeography
    if (geography.kind === 'building-group' || geography.kind === 'publisher-feature') {
      const derived = statisticSourceGeography({
        datasetCode,
        sourceFeatureRef,
        sourceVersion: input.sourceVersion,
        properties: input.sourceProperties(sourceFeatureRef),
      })
      if (
        derived.kind !== geography.kind ||
        (geography.kind !== 'publisher-feature' &&
          (derived.code !== geography.code ||
            derived.class !== geography.class ||
            (geography.namespace !== undefined &&
              derived.namespace !== geography.namespace)))
      )
        throw new Error(
          `Retained geography disagrees with its source profile: ${sourceFeatureRef}.`,
        )
      if (geography.kind === 'building-group' && !derived.namespace) {
        throw new Error(
          `Retained Building Group has no source Housing Market Area: ${sourceFeatureRef}.`,
        )
      }
      Object.assign(geography, derived)
    }
    const id = recordIdentifier({ datasetCode, referencePeriodCode, geography })
    const record = records.get(id) ?? {
      id,
      datasetCode,
      referencePeriodCode,
      geography,
      divisionId: nullable(row.divisionId),
      referencePeriodStart: nullable(row.referencePeriodStart),
      referencePeriodEnd: nullable(row.referencePeriodEnd),
      referencePeriodEndYear: required(
        row.referencePeriodEndYear,
        'referencePeriodEndYear',
      ),
      referencePeriodGranularity: required(
        row.referencePeriodGranularity,
        'referencePeriodGranularity',
      ),
      sourceReleaseId: required(row.sourceReleaseId, 'sourceReleaseId'),
      sourceFeatureRef,
      fieldDefinitionHashes: {},
      fieldSources: {},
      values: {},
    }
    if (
      hashStatisticContent(record.geography) !== hashStatisticContent(geography) ||
      record.divisionId !== nullable(row.divisionId)
    ) {
      throw new Error(`Conflicting reviewed geography metadata for ${id}.`)
    }
    const values = object(row.values) as Record<string, string>
    for (const [field, value] of Object.entries(values)) {
      if (typeof value !== 'string')
        throw new Error(`Statistic ${id}/${field} is not exact text.`)
      if (Object.hasOwn(record.values, field))
        throw new Error(`Duplicate retained field ${id}/${field}.`)
      const definition = definitions.fieldDefinitionHashes.get(
        `${datasetCode}\u0000${field}`,
      )
      if (!definition)
        throw new Error(`Missing retained definition ${datasetCode}/${field}.`)
      record.values[field] = value
      record.fieldDefinitionHashes[field] = definition
      record.fieldSources[field] = {
        sourceFeatureRef,
        sourceReleaseId: record.sourceReleaseId,
      }
    }
    records.set(id, record)
    mappings.push({
      legacyId: required(row.id, 'id'),
      legacyVersionHash: nullable(row.versionHash),
      packedId: id,
      fields: Object.keys(values),
    })
  }
  const canonical: CanonicalStatsRows = {
    records: [...records.values()],
    fields: definitions.fields,
    fieldsI18n: definitions.fieldsI18n,
    measures: definitions.measures,
    measuresI18n: definitions.measuresI18n,
    dimensions: [],
    observations: [],
    values: [],
    valuesI18n: [],
  }
  return { canonical, mappings }
}

function definitionRow(row: RetainedSqlRow) {
  const {
    sourceReleaseId: _release,
    isCurrent: _current,
    createdAt: _created,
    updatedAt: _updated,
    versionHash: _version,
    measureVersionHash: _measureVersion,
    ...definition
  } = row
  for (const key of ['dimensions', 'comparability']) {
    if (typeof definition[key] === 'string')
      definition[key] = JSON.parse(definition[key])
  }
  if (definition.isTranslationVerified !== undefined)
    definition.isTranslationVerified = Boolean(definition.isTranslationVerified)
  return definition
}

function object(value: unknown): Record<string, unknown> {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('Invalid retained statistic JSON object.')
  return { ...parsed } as Record<string, unknown>
}

function nullable(value: unknown) {
  return value === null || value === undefined ? null : String(value)
}

function required(value: unknown, name: string) {
  if (typeof value !== 'string' || !value)
    throw new Error(`Missing retained statistic ${name}.`)
  return value
}
