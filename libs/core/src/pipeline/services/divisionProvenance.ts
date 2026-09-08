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
import {
  divisionClassificationFixture,
  divisionClassificationRule,
} from './divisionClassificationPatch'
import { divisionTranslationRule } from './divisionTranslationRule'
import { divisionNormalisationRule } from './division'
import { requireDefined } from '../../requireDefined'
import type { ReleaseProcessingAction } from '../db/processingActions'
import { retainFixturePartitions } from '../../provenance/fixtures'
import {
  kowloonRestorationDeclaration,
  kowloonRestorationFixture,
} from './kowloonRestoration'

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
    branchCounts?: import('../../provenance').BranchCounts
    curationDocuments?: Array<{ type: string; document: unknown }>
    normalisation?: RuleDeclaration
    retainDeclaration?: (declaration: RuleDeclaration) => Promise<ObjectRef>
    guards?: AuditGuard[]
    identityCurationDefinition?: RuleDeclaration
    actionDeclarations?: Record<string, RuleDeclaration>
    actionCounts?: Record<
      string,
      Pick<import('../../provenance').AuditCounts, 'inputs' | 'outputs'>
    >
  },
) {
  const bulk: BulkAudit[] = []
  const normalisation = input.normalisation ?? divisionNormalisationRule.declaration
  if (input.branchCounts) {
    const ids = new Set(normalisation.branches?.map(branch => branch.id))
    if (Object.keys(input.branchCounts).some(id => !ids.has(id)))
      throw new Error('Branch counts require matching retained branch definitions.')
  }
  const retainDeclaration =
    input.retainDeclaration ??
    ((declaration: RuleDeclaration) => retainObject(store, declaration))
  const individuals: IndividualAudit[] = []
  const usedTranslationEntries = new Set<string>()
  const individualDocuments = (input.curationDocuments ?? []).filter(
    f => f.type === 'division-translations',
  )
  const documentPartitions = await Promise.all(
    individualDocuments.map(f => retainFixturePartitions(store, f.document, 'entries')),
  )
  const individualFixtures = documentPartitions.flatMap((parts, index) =>
    parts.map(part => ({
      type: requireDefined(individualDocuments[index]).type,
      object: part.object,
    })),
  )
  const translations = input.actions.filter(a =>
    /_name_(ai|human)_translated$/.test(a.action),
  )
  const translationFixture = translations.length
    ? await retainFixturePartitions(
        store,
        {
          kind: 'division-translation-curations',
          schemaVersion: 1,
          datasetCode: input.datasetCode,
          entries: translations.map(a => record(a.evidence).translation),
        },
        'entries',
      )
    : null
  const classifications = await retainObject(store, divisionClassificationFixture)
  function translationReference(index: number) {
    const part = requireDefined(
      translationFixture?.find(
        p => index >= p.firstOrdinal && index < p.firstOrdinal + p.count,
      ),
    )
    return { object: part.object, pointer: `/entries/${index - part.firstOrdinal}` }
  }
  const grouped = new Map<string, ReleaseProcessingAction[]>()
  for (const action of input.actions) {
    if (action.action === kowloonRestorationFixture.id) {
      const evidence = record(action.evidence)
      individuals.push({
        id: `${action.action}:${kowloonRestorationFixture.divisionId}`,
        operation: action.action,
        review: { kind: 'patch' },
        basis: 'fixture',
        outcome: 'applied',
        summary: action.summary,
        reason: kowloonRestorationFixture.reason,
        definition: await retainDeclaration(kowloonRestorationDeclaration),
        fixture: {
          object: await retainObject(store, kowloonRestorationFixture),
          pointer: '',
        },
        record: {
          id: kowloonRestorationFixture.divisionId,
          names: kowloonRestorationFixture.names,
          parents: [],
        },
        context: evidence as JsonRecord,
      })
      continue
    }
    grouped.set(action.action, [...(grouped.get(action.action) ?? []), action])
  }
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
    // Substep counters belong to the registered processor; they are not separate,
    // independently authored rule declarations.
    if (!individual && id !== normalisation.id && !input.actionDeclarations?.[id])
      continue
    const declaration = classification
      ? divisionClassificationRule.declaration
      : translated
        ? divisionTranslationRule.declaration
        : (input.actionDeclarations?.[id] ?? normalisation)
    const { basis, summary } = declaration
    const definition = await retainDeclaration(declaration)
    if (!individual) {
      const affected = actions.reduce((n, a) => n + a.affectedRecordCount, 0)
      bulk.push({
        id,
        definition,
        basis,
        summary,
        outcome: affected ? 'applied' : 'not-applicable',
        counts: {
          ...(id === normalisation.id && input.branchCounts
            ? { branches: input.branchCounts }
            : {}),
          inputs:
            input.actionCounts?.[id]?.inputs ??
            ({ [requireDefined(normalisation.inputs[0])]: input.inputCount } as Record<
              string,
              number
            >),
          outputs:
            input.actionCounts?.[id]?.outputs ??
            (id === normalisation.id
              ? { [requireDefined(normalisation.outputs[0])]: input.outputCount }
              : {}),
          recordsAffected: affected,
          decisions:
            id === normalisation.id
              ? Object.fromEntries([
                  ['normalised', input.outputCount],
                  ...[...grouped]
                    .filter(
                      ([key]) =>
                        key !== normalisation.id &&
                        !/_name_(ai|human)_translated$/.test(key) &&
                        !divisionClassificationFixture.entries.some(
                          e => e.id === key,
                        ) &&
                        !input.actionDeclarations?.[key],
                    )
                    .map(([key, values]) => [
                      key,
                      values.reduce((n, a) => n + a.affectedRecordCount, 0),
                    ]),
                ])
              : { applied: affected },
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
        : translationReference(translations.indexOf(a))
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
          usedTranslationEntries.add(`${documentIndex}:${index}`)
          const part = requireDefined(
            documentPartitions[documentIndex]?.find(
              p => index >= p.firstOrdinal && index < p.firstOrdinal + p.count,
            ),
          )
          selectedFixture = {
            object: part.object,
            pointer: `/entries/${index - part.firstOrdinal}`,
          }
        }
      }
      const recordId = String(division.id ?? evidence.divisionId ?? '')
      individuals.push({
        id: `${id}:${recordId}:${ordinal}`,
        operation: id,
        ...(declaration.review ? { review: declaration.review } : {}),
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
  for (const [documentIndex, document] of individualDocuments.entries()) {
    const entries = record(document.document).entries
    if (!Array.isArray(entries)) continue
    const definition = await retainDeclaration(divisionTranslationRule.declaration)
    for (const [index, value] of entries.entries()) {
      if (usedTranslationEntries.has(`${documentIndex}:${index}`)) continue
      const entry = record(value)
      const context = record(entry.context)
      const part = requireDefined(
        documentPartitions[documentIndex]?.find(
          p => index >= p.firstOrdinal && index < p.firstOrdinal + p.count,
        ),
      )
      individuals.push({
        id: `unused-translation:${documentIndex}:${index}`,
        operation: divisionTranslationRule.declaration.id,
        ...(divisionTranslationRule.declaration.review
          ? { review: divisionTranslationRule.declaration.review }
          : {}),
        basis: 'fixture',
        outcome: 'skipped',
        summary: 'Retained translation instruction was not applied in this attempt.',
        reason:
          'No applied translation selected this entry; the source text, context or required locale may differ, or the locale is already present.',
        definition,
        fixture: {
          object: part.object,
          pointer: `/entries/${index - part.firstOrdinal}`,
        },
        record: {
          id: strings(entry.recordIds).join(', ') || `${documentIndex}:${index}`,
          names: [...strings(entry.sourceText), ...strings(entry.text)],
          parents: context.parentDivisionId
            ? [
                {
                  id: String(context.parentDivisionId),
                  names: strings(context.parentName),
                },
              ]
            : [],
        },
        context: entry as JsonRecord,
      })
    }
  }
  const identityDocuments = (input.curationDocuments ?? []).filter(
    f => f.type === 'identity-mappings',
  )
  if (identityDocuments.length) {
    const declaration = requireDefined(input.identityCurationDefinition)
    const { id, summary } = declaration
    bulk.push({
      id,
      summary,
      basis: 'fixture',
      outcome: input.outputCount ? 'applied' : 'not-applicable',
      definition: await retainDeclaration(declaration),
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
