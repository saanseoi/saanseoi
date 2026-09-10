import { requireDefined } from '@repo/core/requireDefined'
import { retainStatisticTranslations } from './statisticTranslationAudit'
import { statisticFieldCurationRule } from './statisticFieldCurationRule'
import { identityCurationRule } from '../identityCurations'
import apiFieldDeclarations from '../../../../../fixtures/meta/apiFields/api-stats-v0.1@censtatd-v1.json'
import {
  retainAuditResult,
  retainObject,
  type AuditGuard,
  type BulkAudit,
  type ProvenanceStore,
  type RuleDeclaration,
} from '@repo/core/provenance'
import { populationThousandsRule } from '@repo/core/pipeline/services/statisticRules'
import { statisticNormalisationRule } from './normaliseHkgovCenstatdStatistics'
import { retainRegisteredRule } from '../api/retainedRule'
import { curationDocumentsFor, type CurationDocument } from '../curationDocuments'
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
    measureMetadata?: ReadonlyMap<string, unknown>
    geographyFixtures?: CurationDocument[]
    additionalRules?: Array<{ declaration: RuleDeclaration; count: number }>
  },
) {
  const { releaseId, datasetCode, source, canonical } = input
  const apiFields = await retainObject(store, {
    kind: 'api-field-declarations',
    schemaVersion: 1,
    fields: apiFieldDeclarations.fields.filter(
      f => f.sourceDatasetCode === datasetCode,
    ),
  })
  const fields = [...input.fieldMetadata]
    .filter(([key]) => key.startsWith(`${datasetCode}\u0000`))
    .map(([key, metadata]) => ({ sourceField: key.split('\u0000')[1], metadata }))
  const fixture = await retainObject(store, {
    kind: 'statistic-field-curations',
    schemaVersion: 1,
    datasetCode,
    fields,
  })
  const documents = [
    ...curationDocumentsFor(input.fieldMetadata, input.measureMetadata).filter(
      f => (f.document as { datasetCode?: string }).datasetCode === datasetCode,
    ),
    ...(input.geographyFixtures ?? []),
  ]
  const bulk: BulkAudit[] = []
  const add = async (declaration: RuleDeclaration, affected: number) => {
    const { id, summary, basis } = declaration
    bulk.push({
      id,
      basis,
      summary,
      outcome: source.length ? 'applied' : 'not-applicable',
      definition: await retainRegisteredRule(store, declaration),
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
  await add(statisticNormalisationRule.declaration, source.length)
  requireDefined(bulk[0]).counts.outputs = {
    statsRecords: canonical.records.length,
    statsFields: canonical.fields.length,
    statsFieldsI18n: canonical.fieldsI18n.length,
    statsMeasures: canonical.measures.length,
    statsMeasuresI18n: canonical.measuresI18n.length,
    statsValuesI18n: canonical.valuesI18n.length,
  }
  await add(statisticFieldCurationRule.declaration, canonical.fields.length)
  requireDefined(bulk[1]).counts.outputs = { statsFields: canonical.fields.length }
  requireDefined(bulk[1]).counts.inputs = { 'field-definitions': fields.length }
  for (const document of documents.filter(f => f.type !== 'identity-mappings'))
    requireDefined(bulk[1]).fixtures.push({
      type: document.type,
      object: await retainObject(store, document.document),
    })
  const identities = documents.filter(f => f.type === 'identity-mappings')
  if (identities.length) {
    const { id, summary } = identityCurationRule.declaration
    const linked = source.filter(
      row => row.divisionId !== null && row.divisionId !== undefined,
    ).length
    bulk.push({
      id,
      summary,
      basis: 'fixture',
      outcome: source.length ? 'applied' : 'not-applicable',
      definition: await retainRegisteredRule(store, identityCurationRule.declaration),
      counts: {
        inputs: { 'publisher-properties': source.length },
        outputs: { 'geography-links': linked },
        recordsAffected: linked,
        decisions: { linked, unresolved: source.length - linked },
      },
      fixtures: await Promise.all(
        identities.map(async f => ({
          type: f.type,
          object: await retainObject(store, f.document),
        })),
      ),
    })
  }
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
  for (const { declaration, count } of input.additionalRules ?? []) {
    if (bulk.some(rule => rule.id === declaration.id))
      throw new Error(`Duplicate audit rule: ${declaration.id}.`)
    await add(declaration, count)
    const rule = requireDefined(bulk.at(-1))
    if (declaration.inputs.includes('identity-mappings')) {
      rule.fixtures = await Promise.all(
        identities.map(async document => ({
          type: document.type,
          object: await retainObject(store, document.document),
        })),
      )
    }
    rule.outcome = count ? 'applied' : 'not-applicable'
    rule.counts.inputs = { [requireDefined(declaration.inputs[0])]: count }
    rule.counts.outputs = { [requireDefined(declaration.outputs[0])]: count }
  }
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
      ? `${failed} checks failed.`
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
    apiFields,
    releaseId,
    datasetCode,
    attempt: { id: releaseId, status: failed ? 'failed' : 'completed' },
    bulk,
    guards,
    individuals: await retainStatisticTranslations(store, {
      ...input,
      appliedFields: new Set(canonical.fields.map(field => field.fieldName)),
      appliedMeasures: new Set(canonical.measures.map(measure => measure.measureCode)),
    }),
  })
}
