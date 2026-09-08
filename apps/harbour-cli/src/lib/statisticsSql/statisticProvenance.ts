import {
  hashValue,
  recordApplications,
  retainObject,
  retainProcessingResult,
  type Collection,
  type JsonRecord,
  type ObservedApplication,
  type ProvenanceStore,
} from '@repo/core/provenance'
import apiFields from '../../../../../fixtures/meta/apiFields/api-stats-v0.1@censtatd-v1.json'
import type {
  CanonicalStatsRows,
  HkgovCenstatdStatisticSourceRow,
} from './normaliseHkgovCenstatdStatistics'

const pointer = (value: string) => value.replaceAll('~', '~0').replaceAll('/', '~1')

/** Capture the actual canonical payload; timestamps and SCD bookkeeping are not data effects. */
export async function retainStatisticProvenance(
  store: ProvenanceStore,
  input: {
    releaseId: string
    datasetCode: string
    source: HkgovCenstatdStatisticSourceRow[]
    canonical: CanonicalStatsRows
    fieldMetadata: ReadonlyMap<string, unknown>
  },
) {
  const { releaseId, datasetCode, canonical } = input
  const declarations = apiFields.fields.filter(
    field => field.sourceDatasetCode === datasetCode,
  )
  const projection = await retainObject(store, {
    schemaVersion: 1,
    kind: 'api-field-declarations',
    fields: declarations,
  })
  const normalisation = await retainObject(store, {
    schemaVersion: 1,
    kind: 'processing-definition',
    operation: 'normalise-censtatd-statistics',
    operationVersion: 1,
    summary:
      'Convert publisher literals into dimension-grouped canonical statistic records.',
    rules: [
      'Keep identifier properties as geography and reference-period inputs, not observations.',
      'Ignore null publisher values. Retain source literals in input evidence.',
      'Preserve decimal numeric strings; multiply MYPOPN_LAND numeric literals by 1000.',
      'Map ** to suppressed; map -, N.A. and NA to unavailable; preserve other categorical literals.',
      'Use the retained reviewed field names, dimensions, units, aggregations and localisations.',
      'Group values by source feature, reference period and reviewed dimensions; reject duplicate fields.',
      'Use the retained geography resolution and area companion; do not query a current bridge on replay.',
      'Record IDs are retained effects, not instructions to invoke an identity generator.',
    ],
  })
  const dictionaries = [
    ['statsFields', canonical.fields],
    ['statsFieldsI18n', canonical.fieldsI18n],
    ['statsMeasures', canonical.measures],
    ['statsMeasuresI18n', canonical.measuresI18n],
    ['statsValuesI18n', canonical.valuesI18n],
  ] as const
  const collections: Collection[] = [
    {
      id: 'publisher-properties',
      layer: 'source',
      datasetCode,
      releaseId,
      snapshotId: null,
      schema: 'censtatd-publisher-properties/1',
    },
    ...['statsRecords', ...dictionaries.map(([name]) => name)].map(id => ({
      id,
      layer: 'canonical' as const,
      datasetCode,
      releaseId,
      snapshotId: null,
      schema: `${id}-payload/1`,
    })),
  ]
  const bySource = new Map<string, CanonicalStatsRows['records']>()
  for (const record of canonical.records) {
    const records = bySource.get(record.sourceFeatureRef) ?? []
    records.push(record)
    bySource.set(record.sourceFeatureRef, records)
  }
  const seen = new Set<string>()
  async function* observations(): AsyncGenerator<ObservedApplication> {
    for (const source of input.source) {
      if (seen.has(source.sourceFeatureRef))
        throw new Error('Duplicate statistic provenance source reference.')
      seen.add(source.sourceFeatureRef)
      const records = bySource.get(source.sourceFeatureRef) ?? []
      bySource.delete(source.sourceFeatureRef)
      const fields = canonical.fields.filter(
        field =>
          field.datasetCode === source.datasetCode &&
          Object.hasOwn(source.properties, field.sourceField),
      )
      yield {
        id: `normalise:${source.sourceFeatureRef}`,
        operation: 'normalise-censtatd-statistics',
        operationVersion: 1,
        outcome: 'applied',
        summary: records.length
          ? `Materialised ${records.length} dimension-grouped statistic records from ${source.sourceFeatureRef}.`
          : `No observation records from ${source.sourceFeatureRef}.`,
        reason:
          'Applied the retained field definitions, publisher-literal conversion rules and geography resolution.',
        decision: {
          id: 'normalise-censtatd-statistics',
          revision: 1,
          origin: 'rule',
          review: 'unreviewed',
          definition: normalisation,
        },
        inputs: [
          {
            collection: 'publisher-properties',
            id: source.sourceFeatureRef,
            value: source.properties as JsonRecord,
          },
        ],
        effects: records.map(record => ({
          target: { collection: 'statsRecords', id: record.id },
          before: null,
          after: record as unknown as JsonRecord,
        })),
        evidence: [{ object: projection, role: 'api-field-declarations', pointer: '' }],
        evidenceValues: [
          {
            role: 'applied-field-and-geography-resolution',
            value: {
              fields: fields as unknown as JsonRecord[],
              sourceVersion: source.sourceVersion,
              divisionId: source.divisionId ?? null,
              geography: (source.geography as unknown as JsonRecord) ?? null,
              areaCompanionByReferencePeriod:
                source.areaCompanionByReferencePeriod ?? null,
              excludedProperties: Object.keys(source.properties).filter(
                key => !fields.some(field => field.sourceField === key),
              ),
            },
          },
        ],
        fields: records.length
          ? [
              ...fields.map(field => ({
                output: {
                  collection: 'statsRecords',
                  path: `/values/${pointer(field.fieldName)}`,
                },
                inputs: [
                  {
                    collection: 'publisher-properties',
                    path: `/${pointer(field.sourceField)}`,
                  },
                ],
                apiFields: declarations.some(
                  d => d.apiField === 'statistic.attributes.values',
                )
                  ? ['statistic.attributes.values']
                  : [],
              })),
              ...['geography', 'dimensions', 'referencePeriodCode', 'divisionId'].map(
                path => ({
                  output: { collection: 'statsRecords', path: `/${path}` },
                  inputs: [{ collection: 'publisher-properties', path: '' }],
                  apiFields: [],
                }),
              ),
            ]
          : [],
      }
    }
    if (bySource.size)
      throw new Error('Canonical statistic has no guarded publisher source.')
    for (const [collection, rows] of dictionaries) {
      for (const row of rows) {
        const value = row as unknown as JsonRecord
        const id = await hashValue(value)
        const sourceField =
          typeof value.sourceField === 'string' ? value.sourceField : null
        const reviewed =
          collection === 'statsFields' && sourceField !== null
            ? input.fieldMetadata.get(`${datasetCode}\u0000${sourceField}`)
            : undefined
        const definition =
          reviewed === undefined
            ? normalisation
            : await retainObject(store, {
                schemaVersion: 1,
                kind: 'curation-definition',
                operation: 'curate-statistic-field',
                datasetCode,
                sourceField,
                metadata: reviewed,
              })
        yield {
          id: `${collection}:${id}`,
          operation:
            reviewed === undefined
              ? 'materialise-statistic-dictionary'
              : 'curate-statistic-field',
          operationVersion: 1,
          outcome: 'applied',
          summary: `Materialised ${collection} dictionary entry.`,
          reason: 'Retained the resolved dictionary payload used by this release.',
          decision: {
            id: `dictionary:${id}`,
            revision: 1,
            origin: reviewed === undefined ? 'rule' : 'human',
            review: reviewed === undefined ? 'unreviewed' : 'approved',
            definition,
          },
          inputs: [],
          effects: [{ target: { collection, id }, before: null, after: value }],
          evidence: [
            { object: projection, role: 'api-field-declarations', pointer: '' },
          ],
          fields: [],
        }
      }
    }
  }
  return retainProcessingResult(store, {
    releaseId,
    collections,
    applications: recordApplications(store, observations()),
  })
}
