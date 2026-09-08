import {
  retainAuditResult,
  retainObject,
  type BulkAudit,
  type IndividualAudit,
  type JsonRecord,
  type ProvenanceStore,
  type RuleDeclaration,
  type ObjectRef,
  type AuditGuard,
} from '../../provenance'
import { divisionClassificationFixture } from './divisionClassificationCuration'
import { divisionNormalisationRule } from './division'
import { requireDefined } from '../../requireDefined'
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
    curationDocuments?: Array<{ type: string; document: unknown }>
    normalisation?: RuleDeclaration
    retainDeclaration?: (declaration: RuleDeclaration) => Promise<ObjectRef>
    guards?: AuditGuard[]
  },
) {
  const bulk: BulkAudit[] = []
  const normalisation = input.normalisation ?? divisionNormalisationRule.declaration
  const retainDeclaration =
    input.retainDeclaration ??
    ((declaration: RuleDeclaration) => retainObject(store, declaration))
  const individuals: IndividualAudit[] = []
  const individualDocuments = (input.curationDocuments ?? []).filter(
    f => f.type === 'division-translations',
  )
  const individualFixtures = await Promise.all(
    individualDocuments.map(async f => ({
      type: f.type,
      object: await retainObject(store, f.document),
    })),
  )
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
  grouped.set(normalisation.id, [
    {
      action: normalisation.id,
      affectedRecordCount: input.inputCount,
      evidence: null,
      mode: 'automatic',
      summary: normalisation.summary,
    },
  ])
  for (const [id, actions] of grouped) {
    const translated = /_name_(ai|human)_translated$/.test(id)
    const classification = divisionClassificationFixture.entries.find(e => e.id === id)
    const individual = translated || !!classification
    const basis = individual ? ('fixture' as const) : ('code' as const)
    const summary =
      id === normalisation.id
        ? requireDefined(actions[0]).summary
        : id.replaceAll('_', ' ')
    const definition = await retainDeclaration({
      kind: 'processing-rule',
      schemaVersion: 1,
      id,
      scope: individual ? 'individual' : 'bulk',
      basis,
      summary,
      inputs: normalisation.inputs,
      outputs: normalisation.outputs,
      parameters: {},
      implementation: {
        path: 'libs/core/src/pipeline/services/division.ts',
        symbol: 'normaliseDivisionRow',
      },
    })
    const retainedDefinition =
      id === normalisation.id ? await retainDeclaration(normalisation) : definition
    if (!individual) {
      const affected = actions.reduce((n, a) => n + a.affectedRecordCount, 0)
      bulk.push({
        id,
        definition: retainedDefinition,
        basis,
        summary,
        outcome: affected ? 'applied' : 'not-applicable',
        counts: {
          inputs: { [requireDefined(normalisation.inputs[0])]: input.inputCount },
          outputs:
            id === normalisation.id
              ? { [requireDefined(normalisation.outputs[0])]: input.outputCount }
              : {},
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
      let selectedFixture = classification
        ? {
            object: classifications,
            pointer: `/entries/${divisionClassificationFixture.entries.indexOf(classification)}`,
          }
        : {
            object: requireDefined(translationFixture),
            pointer: `/entries/${translations.indexOf(a)}`,
          }
      if (translated) {
        const documentIndex =
          individualDocuments.findIndex(f => f.type === 'division-translations') ?? -1
        if (documentIndex >= 0) {
          const document = record(individualDocuments[documentIndex]?.document)
          const entries = Array.isArray(document.entries) ? document.entries : []
          const index = entries.findIndex(value => {
            const e = record(value)
            return (
              e.contextHash === translation.contextHash &&
              e.sourceLocale === translation.sourceLocale &&
              e.sourceTextHash === translation.sourceTextHash &&
              e.targetLocale === translation.locale &&
              e.text === translation.name
            )
          })
          if (index < 0)
            throw new Error(
              'Applied division translation does not match its retained fixture.',
            )
          selectedFixture = {
            object: requireDefined(individualFixtures[documentIndex]).object,
            pointer: `/entries/${index}`,
          }
        }
      }
      const recordId = String(division.id ?? evidence.divisionId ?? '')
      individuals.push({
        id: `${id}:${recordId}:${ordinal}`,
        operation: id,
        basis: 'fixture',
        outcome: 'applied',
        summary: a.summary,
        reason: classification?.reason ?? a.summary,
        definition,
        fixture: selectedFixture,
        record: {
          id: recordId,
          names: classification?.names ?? [
            ...new Set([
              ...strings(evidence.sourceNames),
              ...strings(translation.translatedText),
              ...strings(translation.name),
            ]),
          ],
          parents: Array.isArray(evidence.parents)
            ? (evidence.parents as Array<{ id: string; names: string[] }>)
            : context.parentDivisionId
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
  const identityDocuments = (input.curationDocuments ?? []).filter(
    f => f.type === 'identity-mappings',
  )
  if (identityDocuments.length) {
    const id = 'curate-division-identities'
    const summary =
      'Apply the reviewed source-to-canonical identity mappings for this geography cohort.'
    bulk.push({
      id,
      summary,
      basis: 'fixture',
      outcome: input.outputCount ? 'applied' : 'not-applicable',
      definition: await retainDeclaration({
        kind: 'processing-rule',
        schemaVersion: 1,
        id,
        summary,
        scope: 'bulk',
        basis: 'fixture',
        inputs: normalisation.inputs,
        outputs: normalisation.outputs,
        parameters: {},
        implementation: {
          path: 'apps/harbour-cli/src/lib/identityCurations.ts',
          symbol: 'resolveIdentityCuration',
        },
      }),
      counts: {
        inputs: { 'source-geometry': input.inputCount },
        outputs: { 'canonical-geometries': input.outputCount },
        recordsAffected: input.outputCount,
        decisions: { mapped: input.outputCount },
      },
      fixtures: await Promise.all(
        identityDocuments.map(async f => ({
          type: f.type,
          object: await retainObject(store, f.document),
        })),
      ),
    })
  }
  return retainAuditResult(store, {
    releaseId: input.releaseId,
    datasetCode: input.datasetCode,
    attempt: { id: input.releaseId, status: 'completed' },
    bulk,
    individuals,
    individualFixtures,
    guards: [
      ...(input.guards ?? []),
      {
        id:
          normalisation.id === 'normalise-planning-divisions'
            ? 'planning-prepared-divisions'
            : normalisation.id === 'normalise-division-area-geometry'
              ? 'division-area-geometry'
              : normalisation.id === 'normalise-division-boundary-geometry'
                ? 'division-boundary-geometry'
                : 'division-source-normalisation',
        summary:
          normalisation.id === 'normalise-planning-divisions'
            ? 'Require expected Planning record coverage, unique identities and parent-before-child hierarchy.'
            : normalisation.id.includes('geometry')
              ? 'Require geometry identities, supported geometry types and configured geometry validity checks.'
              : 'Require a source identity, supported classification, resolvable hierarchy and decodable geometry.',
        consequence: 'block-ingestion',
        status: input.inputCount ? 'passed' : 'not-applicable',
        checked: input.inputCount,
        failed: 0,
        reason: 'The selected processor completed normalisation.',
      },
    ],
  })
}
