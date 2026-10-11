import additions from '../../../fixtures/meta/curations/saanseoi-division/division-additions.json'
import classifications from '../../../fixtures/meta/curations/saanseoi-division/division-classifications.json'
import names from '../../../fixtures/meta/curations/saanseoi-division/division-names.json'
import patches from '../../../fixtures/meta/patches/overture-division-classification.json'
import { geographicDivisionClassification } from './divisionTaxonomy'
import type { LineageDefinition, Node, Operation } from './fieldLineageTypes'

type RetainOperation = (
  code: string,
  specification: Record<string, unknown>,
  inputs: Node['inputs'],
) => Operation

/** Candidates mirror the current Overture executor; reviewed archive import bypasses them. */
export function divisionOverrideNodes(args: {
  baseline: Node
  apiField: string
  sourceScope: string
  preparedScope: string
  operation: RetainOperation
  retain: (document: unknown) => string
  addGroup: (group: LineageDefinition['resolutionGroups'][number]) => void
}): Node[] {
  const { baseline, apiField, sourceScope, preparedScope, operation } = args
  const field = apiField.replace(/^attributes\./, '')
  const localeField = /^i18n\.([^.]+)\.(name|nameAlts|nameVariant|nameRules)$/.exec(
    field,
  )
  const classification = ['class', 'level', 'category'].includes(field)
  if (!classification && !localeField) return []
  const inputs: Node['inputs'] = {
    baseline: { node: baseline.id, role: 'value' },
    recordId: baseline.inputs.id ?? {
      stage: 'prepared',
      scope: preparedScope,
      collection: 'rows',
      path: 'id',
      role: 'join-key',
    },
    selectedSource: baseline.inputs.selectedSource!,
  }
  if (localeField)
    inputs.publisherNames = baseline.inputs.names ?? {
      stage: 'prepared',
      scope: preparedScope,
      collection: 'rows',
      path: 'names',
      role: 'value',
    }
  if (localeField?.[1] === '*')
    inputs.locale = {
      stage: 'registry',
      scope: 'registry',
      collection: 'lineageContext',
      path: 'selectorBindings.locale',
      role: 'selection',
    }
  const result: Node[] = []
  const classEntries = new Map([
    ...additions.entries.map(entry => [entry.id, entry.class] as const),
    ...classifications.entries.map(entry => [entry.divisionId, entry.class] as const),
  ])
  const mapping = classification
    ? Object.fromEntries(
        [...classEntries].map(([id, value]) => [
          id,
          field === 'class'
            ? value
            : geographicDivisionClassification(value)![field as 'level' | 'category'],
        ]),
      )
    : null
  const curation = operation(
    'division-field-curation',
    {
      apiField,
      ...(mapping
        ? {
            mapping,
            expression: 'mapping[recordId]',
            documents: {
              additions: args.retain(additions),
              classifications: args.retain(classifications),
            },
          }
        : {
            document: args.retain(names),
            locale: localeField![1],
            output: localeField![2],
            expression:
              'Normalise publisherNames into baseline locale rows, then applyCuratedDivisionNames(recordId, rows); select the declared locale output.',
            applicability:
              'An explicit names entry for this record and selected locale declares this output.',
            steps: [
              'Collect the explicit locale changes and matching suffix aliases.',
              'Remove a locale when remove is set; create a missing locale only if a primary name is supplied.',
              'Replace a declared primary name; merge aliases, excluding the primary name and removeAliases.',
              'Deduplicate variants and append alternate rules for new aliases.',
            ],
          }),
      implementation: {
        path: 'libs/core/src/pipeline/services/divisions/curatedDivisionPolicy.ts',
        symbol: classification
          ? 'curatedDivisionClassification'
          : 'applyCuratedDivisionNames',
      },
    },
    inputs,
  )
  if (curation.kind !== 'resolver') throw new Error('Expected retained curation.')
  const curated: Node = {
    ...baseline,
    id: `${baseline.id}-curation`,
    inputs,
    layer: 'curation',
    audit: {
      category: 'curations',
      scope: 'individual',
      retention: 'decision',
      binding: {
        owner: sourceScope,
        recordKeyInputs: ['recordId'],
        outputSelector: field,
        evidenceContract: 'processing-audit',
      },
    },
    when: {
      kind: 'all',
      conditions: [
        baseline.when,
        {
          kind: 'compare',
          input: 'recordId',
          operator: 'in',
          value: mapping
            ? Object.keys(mapping)
            : names.entries
                .filter(entry => {
                  const changes = entry.names as unknown as Record<
                    string,
                    {
                      name?: string
                      remove?: boolean
                      aliases?: string[]
                      removeAliases?: string[]
                    }
                  >
                  const change = changes[localeField![1]!]
                  if (!change) return false
                  return localeField![2] === 'name'
                    ? Boolean(change.name || change.remove)
                    : Boolean(
                        change.name ||
                          change.remove ||
                          change.aliases?.length ||
                          change.removeAliases?.length,
                      )
                })
                .map(entry => entry.divisionId),
        },
      ],
    },
    operation: curation,
  }
  if (localeField?.[1] === '*')
    curated.when = {
      kind: 'all',
      conditions: [
        baseline.when,
        {
          kind: 'predicate',
          definition: { ...curation.definition, branchId: 'applicability' },
          arguments: { recordId: 'recordId', locale: 'locale' },
        },
      ],
    }
  if (localeField && localeField[2] !== 'name') {
    const rules = names.nameAliasRules.filter(
      rule => localeField[1] === '*' || rule.locale === localeField[1],
    )
    if (rules.length) {
      const alias = operation(
        'division-name-alias-rule',
        {
          apiField,
          rules,
          locale: localeField[1],
          additionalImplementations: [
            {
              path: 'libs/core/src/pipeline/services/divisions/division.ts',
              symbol: 'normaliseDivisionI18n',
            },
          ],
          expression:
            'For matching baseline locale/name suffixes, append name.slice(0, -suffix.length) + replacement; deduplicate aliases, variants and alternate name rules with applyCuratedDivisionNames.',
          applicability:
            'Normalise publisherNames using normaliseDivisionI18n; a row has the declared locale and its primary name endsWith one of the retained suffixes.',
          implementation: {
            path: 'libs/core/src/pipeline/services/divisions/curatedDivisionPolicy.ts',
            symbol: 'applyCuratedDivisionNames',
          },
        },
        inputs,
      )
      if (alias.kind !== 'resolver') throw new Error('Expected retained alias rule.')
      result.push({
        ...baseline,
        id: `${baseline.id}-alias-rule`,
        inputs,
        layer: 'conditional-rule',
        audit: { category: 'rules', scope: 'bulk', retention: 'counts' },
        when: {
          kind: 'all',
          conditions: [
            baseline.when,
            {
              kind: 'predicate',
              definition: { ...alias.definition, branchId: 'applicability' },
              arguments: {
                publisherNames: 'publisherNames',
                recordId: 'recordId',
                ...(localeField[1] === '*' ? { locale: 'locale' } : {}),
              },
            },
          ],
        },
        operation: alias,
      })
    }
  }
  result.push(curated)
  // A patch declares classification and optional locale outputs. Unrelated fields never compete.
  const applicable = patches.entries.filter(entry => {
    if (classification) return true
    const replacement = entry.replacement as Record<string, unknown>
    const locale = localeField![1],
      name = localeField![2]
    if (name === 'nameRules') return false
    if (locale === '*')
      return Boolean(
        replacement.nameEn || replacement.nameAltsEn || replacement.nameAltsZhHant,
      )
    if (locale === 'en')
      return name === 'name'
        ? Boolean(replacement.nameEn)
        : Boolean(replacement.nameEn || replacement.nameAltsEn)
    return (
      locale === 'zh-hant' && name !== 'name' && Boolean(replacement.nameAltsZhHant)
    )
  })
  if (!applicable.length) return result
  const effectiveGroup = `${baseline.id}-before-patch`
  args.addGroup({
    id: effectiveGroup,
    output: baseline.output,
    candidates: [baseline.id, ...result.map(node => node.id)],
    evaluation: 'per-record',
    keyInputs: [
      {
        stage: 'prepared',
        scope: preparedScope,
        collection: 'rows',
        path: 'id',
        role: 'join-key',
      },
    ],
  })
  const patchInputs: Node['inputs'] = {
    ...inputs,
    curated: { group: effectiveGroup, role: 'value' },
  }
  const patch = operation(
    'division-field-patch',
    {
      apiField,
      document: args.retain(patches),
      entryKey: 'divisionId',
      output: field,
      ...(localeField ? { locale: localeField[1], localeField: localeField[2] } : {}),
      expression: classification
        ? field === 'category'
          ? 'geographicDivisionClassification(entry.replacement.class).category'
          : `entry.replacement.${field}`
        : 'applyDivisionNamePatch(recordId, effective curated locale rows, entry.replacement); select the declared locale output.',
      ...(localeField
        ? {
            curationDocument: args.retain(names),
            baselineLocalisation: 'normaliseDivisionI18n(recordId, publisherNames)',
            lowerLayer: 'applyCuratedDivisionNames(recordId, baselineLocalisation)',
          }
        : {}),
      guards: [
        'The matched patch identity must belong to Overture; a mismatch blocks ingestion.',
        'Validate the replacement class/level against the retained taxonomy; null level remains null.',
      ],
      implementation: {
        path: `libs/core/src/pipeline/services/divisions/${classification ? 'divisionClassificationPatch' : 'divisionNamePatch'}.ts`,
        symbol: classification
          ? 'applyDivisionClassificationPatch'
          : 'applyDivisionNamePatch',
      },
      auditLookup: {
        fixture: 'fixtures/meta/patches/overture-division-classification.json',
        entryArray: '/entries',
        key: 'divisionId',
        valueInput: 'recordId',
      },
    },
    patchInputs,
  )
  result.push({
    ...baseline,
    id: `${baseline.id}-patch`,
    layer: 'patch',
    inputs: patchInputs,
    when: {
      kind: 'all',
      conditions: [
        baseline.when,
        {
          kind: 'compare',
          input: 'recordId',
          operator: 'in',
          value: applicable.map(entry => entry.divisionId),
        },
        ...(localeField?.[1] === '*' && patch.kind === 'resolver'
          ? [
              {
                kind: 'predicate' as const,
                definition: { ...patch.definition, branchId: 'applicability' },
                arguments: { recordId: 'recordId', locale: 'locale' },
              },
            ]
          : []),
      ],
    },
    operation: patch,
    audit: {
      category: 'patches',
      scope: 'individual',
      retention: 'decision',
      binding: {
        owner: sourceScope,
        recordKeyInputs: ['recordId'],
        outputSelector: field,
        evidenceContract: 'processing-audit',
      },
    },
  })
  return result
}
