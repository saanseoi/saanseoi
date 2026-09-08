import {
  retainAuditResult,
  retainObject,
  type AuditGuard,
  type BulkAudit,
  type ProvenanceStore,
} from '@repo/core/provenance'
import { populationThousandsRule } from '@repo/core/pipeline/services/statisticRules'
import { statisticNormalisationRule } from './normaliseHkgovCenstatdStatistics'
import { retainRegisteredRule } from '../api/retainedRule'
import type {
  CanonicalStatsRows,
  HkgovCenstatdStatisticSourceRow,
} from './normaliseHkgovCenstatdStatistics'

/** Bulk normalisation retains declarations and execution counts, never publisher rows or outputs. */
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
  const { releaseId, datasetCode, source, canonical } = input
  const fields = [...input.fieldMetadata]
    .filter(([key]) => key.startsWith(datasetCode + '\u0000'))
    .map(([key, metadata]) => ({ sourceField: key.split('\u0000')[1], metadata }))
  const fixture = await retainObject(store, {
    kind: 'statistic-field-curations',
    schemaVersion: 1,
    datasetCode,
    fields,
  })
  const bulk: BulkAudit[] = []
  const add = async (
    id: string,
    summary: string,
    inputs: string[],
    outputs: string[],
    affected: number,
    basis: 'code' | 'fixture' = 'code',
  ) => {
    bulk.push({
      id,
      basis,
      summary,
      outcome: source.length ? 'applied' : 'not-applicable',
      definition: await retainObject(store, {
        kind: 'processing-rule',
        schemaVersion: 1,
        id,
        scope: 'bulk',
        basis,
        summary,
        inputs,
        outputs,
        parameters: {},
        implementation: {
          path: 'apps/harbour-cli/src/lib/statisticsSql/normaliseHkgovCenstatdStatistics.ts',
          symbol: 'normaliseHkgovCenstatdStatistics',
        },
      }),
      counts: {
        inputs: { 'publisher-properties': source.length },
        outputs: {},
        recordsAffected: affected,
        decisions: { applied: affected },
      },
      fixtures:
        basis === 'fixture' ? [{ type: 'statistic-fields', object: fixture }] : [],
    })
  }
  await add(
    'normalise-censtatd-statistics',
    'Select observation fields, interpret publisher literals and derive reference periods; group values by source feature, period and reviewed dimensions.',
    ['publisher-properties'],
    ['statsRecords'],
    source.length,
  )
  bulk[0]!.counts.outputs = { statsRecords: canonical.records.length }
  bulk[0]!.definition = await retainRegisteredRule(
    store,
    statisticNormalisationRule.declaration,
  )
  bulk[0]!.summary = statisticNormalisationRule.declaration.summary
  await add(
    'curate-statistic-fields',
    'Apply reviewed field names, dimensions, units, aggregations and localisations.',
    ['publisher-properties'],
    ['statsFields'],
    canonical.fields.length,
    'fixture',
  )
  bulk[1]!.counts.outputs = { statsFields: canonical.fields.length }
  const dictionaries = [
    'fields',
    'fieldsI18n',
    'measures',
    'measuresI18n',
    'valuesI18n',
  ] as const
  await add(
    'materialise-statistic-dictionaries',
    'Materialise the field, measure and localisation dictionaries selected by the reviewed definitions.',
    ['statistic-field-curations'],
    ['statsFields', 'statsMeasures', 'statsValuesI18n'],
    canonical.fields.length,
  )
  bulk[2]!.counts.outputs = Object.fromEntries(
    dictionaries.map(key => [key, canonical[key].length]),
  )
  const scaling = populationThousandsRule.declaration
  const scaled = canonical.observations.filter(
    o => o.sourceField === scaling.parameters.sourceField && o.numericValue !== null,
  ).length
  bulk.push({
    id: scaling.id,
    basis: scaling.basis,
    summary: scaling.summary,
    outcome: scaled ? 'applied' : 'not-applicable',
    definition: await retainRegisteredRule(store, scaling),
    counts: {
      inputs: { observations: canonical.observations.length },
      outputs: { observations: scaled },
      recordsAffected: scaled,
      decisions: { scaled },
    },
    fixtures: [],
  })
  const sourceRefs = new Set(source.map(s => s.sourceFeatureRef))
  const duplicateSources = source.length - sourceRefs.size
  const orphanOutputs = canonical.records.filter(
    r => !sourceRefs.has(r.sourceFeatureRef),
  ).length
  const guard = (
    id: string,
    summary: string,
    checked: number,
    failed: number,
  ): AuditGuard => ({
    id,
    summary,
    consequence: 'block-ingestion',
    status: failed ? 'failed' : 'passed',
    checked,
    failed,
    reason: failed
      ? failed + ' checks failed.'
      : 'All checked records satisfy the requirement.',
  })
  const guards = [
    ...(canonical.auditGuards ?? []),
    guard(
      'unique-statistic-source-identities',
      'Publisher feature references must be unique within the release.',
      source.length,
      duplicateSources,
    ),
    guard(
      'statistic-output-source-link',
      'Every canonical statistic must resolve to an input publisher feature.',
      canonical.records.length,
      orphanOutputs,
    ),
  ]
  const failed = guards.some(g => g.status === 'failed')
  return retainAuditResult(store, {
    releaseId,
    datasetCode,
    attempt: { id: releaseId, status: failed ? 'failed' : 'completed' },
    bulk,
    guards,
    individuals: [],
  })
}
