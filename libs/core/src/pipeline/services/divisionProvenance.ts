import {
  retainAuditResult,
  retainObject,
  type BulkAudit,
  type IndividualAudit,
  type JsonRecord,
  type ProvenanceStore,
} from '../../provenance'
import { divisionClassificationFixture } from './divisionClassificationCuration'
import { divisionNormalisationRule } from './division'
import type { ReleaseProcessingAction } from '../db/processingActions'

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (!value || typeof value !== 'object') return []
  return Object.values(value).flatMap(strings)
}

/** Bulk actions discard their transient row evidence at this boundary. */
export async function retainDivisionProvenance(
  store: ProvenanceStore,
  input: {
    releaseId: string
    datasetCode: string
    actions: ReleaseProcessingAction[]
    inputCount: number
    outputCount: number
  },
) {
  const bulk: BulkAudit[] = []
  const individuals: IndividualAudit[] = []
  const translations = input.actions.filter(a =>
    /_name_(ai|human)_translated$/.test(a.action),
  )
  const translationFixture = translations.length
    ? await retainObject(store, {
        kind: 'division-translation-curations',
        schemaVersion: 1,
        datasetCode: input.datasetCode,
        entries: translations.map(a => record(a.evidence).translation),
      })
    : null
  const classifications = await retainObject(store, divisionClassificationFixture)
  const grouped = new Map<string, ReleaseProcessingAction[]>()
  for (const action of input.actions)
    grouped.set(action.action, [...(grouped.get(action.action) ?? []), action])
  grouped.set('normalise-divisions', [
    {
      action: 'normalise-divisions',
      affectedRecordCount: input.inputCount,
      evidence: null,
      mode: 'automatic',
      summary:
        'Normalise source division identities, classification, names and hierarchy for the selected dataset.',
    },
  ])
  for (const [id, actions] of grouped) {
    const translated = /_name_(ai|human)_translated$/.test(id)
    const classification = divisionClassificationFixture.entries.find(e => e.id === id)
    const individual = translated || !!classification
    const basis = individual ? ('fixture' as const) : ('code' as const)
    const summary =
      id === 'normalise-divisions' ? actions[0]!.summary : id.replaceAll('_', ' ')
    const definition = await retainObject(store, {
      kind: 'processing-rule',
      schemaVersion: 1,
      id,
      scope: individual ? 'individual' : 'bulk',
      basis,
      summary,
      inputs: ['source-divisions'],
      outputs: ['divisions'],
      parameters: {},
      implementation: {
        path: 'libs/core/src/pipeline/services/division.ts',
        symbol: 'normaliseDivisionRow',
      },
    })
    const retainedDefinition =
      id === 'normalise-divisions'
        ? await retainObject(store, divisionNormalisationRule.declaration)
        : definition
    if (!individual) {
      const affected = actions.reduce((n, a) => n + a.affectedRecordCount, 0)
      bulk.push({
        id,
        definition: retainedDefinition,
        basis,
        summary,
        outcome: affected ? 'applied' : 'not-applicable',
        counts: {
          inputs: { 'source-divisions': input.inputCount },
          outputs: id === 'normalise-divisions' ? { divisions: input.outputCount } : {},
          recordsAffected: affected,
          decisions: { applied: actions.length },
        },
        fixtures: [],
      })
      continue
    }
    for (const [ordinal, a] of actions.entries()) {
      const evidence = record(a.evidence)
      const division = record(evidence.canonicalDivision)
      const translation = record(evidence.translation)
      const context = record(translation.context)
      const recordId = String(division.id ?? evidence.divisionId ?? '')
      individuals.push({
        id: `${id}:${recordId}:${ordinal}`,
        operation: id,
        basis: 'fixture',
        outcome: 'applied',
        summary: a.summary,
        reason: classification?.reason ?? a.summary,
        definition,
        fixture: classification
          ? {
              object: classifications,
              pointer: `/entries/${divisionClassificationFixture.entries.indexOf(classification)}`,
            }
          : {
              object: translationFixture!,
              pointer: `/entries/${translations.indexOf(a)}`,
            },
        record: {
          id: recordId,
          names: classification?.names ?? [
            ...new Set([
              ...strings(evidence.sourceNames),
              ...strings(translation.translatedText),
              ...strings(translation.name),
            ]),
          ],
          parents: context.parentDivisionId
            ? [
                {
                  id: String(context.parentDivisionId),
                  names: strings(context.parentName),
                },
              ]
            : [],
        },
        context: (classification
          ? {
              expected: classification.expected,
              replacement: classification.replacement,
            }
          : translation) as JsonRecord,
      })
    }
  }
  return retainAuditResult(store, {
    releaseId: input.releaseId,
    datasetCode: input.datasetCode,
    attempt: { id: input.releaseId, status: 'completed' },
    bulk,
    individuals,
    guards: [
      {
        id: 'division-source-normalisation',
        summary:
          'Require a source identity, supported classification, resolvable hierarchy and decodable geometry.',
        consequence: 'block-ingestion',
        status: input.inputCount ? 'passed' : 'not-applicable',
        checked: input.inputCount,
        failed: 0,
        reason: 'The selected processor completed normalisation.',
      },
    ],
  })
}
