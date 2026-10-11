import names from '../../../fixtures/meta/curations/saanseoi-division/division-names.json'
import patches from '../../../fixtures/meta/patches/overture-division-classification.json'
import type { ProducerSpecification } from './fieldLineageProducer'
const core = 'libs/core/src/pipeline/services/divisions/'
const cli = 'apps/harbour-cli/src/lib/pipeline/divisions/'

export function hierarchyProducer(path: string): ProducerSpecification | null {
  if (path === 'divisionBaselineI18n')
    return {
      inputs: ['id', 'names'],
      implementation: { path: `${core}division.ts`, symbol: 'normaliseDivisionI18n' },
      expression: 'normaliseDivisionI18n(id, names)',
      steps: [
        'Resolve common/primary/rule names and inferred locales; preserve primary, aliases, variants and rules as distinct outputs.',
      ],
    }
  if (path === 'divisionAliasI18n')
    return {
      inputs: ['id', 'divisionBaselineI18n'],
      layer: 'conditional-rule',
      implementation: {
        path: `${core}curatedDivisionPolicy.ts`,
        symbol: 'applyCuratedDivisionNames',
      },
      expression:
        'For each baseline locale row, apply matching nameAliasRules by locale and name suffix; merge generated aliases without changing primary names.',
      rules: names.nameAliasRules,
      steps: [
        'Deduplicate aliases, variants and alternate name rules. The explicit curation step recomputes the combined alias/curation merge from baseline so removals and renamed primaries retain the executor ordering.',
      ],
    }
  if (path === 'divisionCuratedI18n')
    return {
      inputs: ['id', 'divisionBaselineI18n', 'divisionAliasI18n'],
      layer: 'curation',
      implementation: {
        path: `${core}curatedDivisionPolicy.ts`,
        symbol: 'applyCuratedDivisionNames',
      },
      expression: 'applyCuratedDivisionNames(id, divisionBaselineI18n)',
      document: names,
      steps: [
        'Select the exact divisionId entry and merge explicit changes with conditional aliases computed from baseline names.',
        'Remove requested locales; create a missing locale only with an explicit primary name. Replace primary, exclude primary/removed aliases, deduplicate variants and append alternate rules.',
      ],
      instructionSelector: {
        document: 'division-names',
        entryKey: 'divisionId',
        valueInput: 'id',
      },
    }
  if (path === 'effectiveI18n')
    return {
      inputs: ['id', 'divisionCuratedI18n', 'source'],
      layer: 'patch',
      implementation: {
        path: `${core}divisionNamePatch.ts`,
        symbol: 'applyDivisionNamePatch',
      },
      additionalImplementations: [
        {
          path: `${core}divisionClassificationPatch.ts`,
          symbol: 'applyDivisionClassificationPatch',
        },
      ],
      expression:
        'applyDivisionNamePatch(id, divisionCuratedI18n, the exact identity-matched classification patch replacement)',
      document: patches,
      steps: [
        'Require an Overture patch identity and valid replacement classification. Apply declared English name and English/Traditional Chinese alias replacements after curation; untouched locales/outputs pass through.',
      ],
      instructionSelector: {
        document: 'overture-division-classification',
        entryKey: 'divisionId',
        valueInput: 'id',
      },
    }
  if (path === 'divisionLookupInventory')
    return {
      inputs: ['sourceVersion', 'effectiveClass', 'effectiveLevel', 'effectiveI18n'],
      reads: {
        publisherRows: { stage: 'raw', collection: 'publisher', path: '$' },
        exclusions: {
          stage: 'audit',
          collection: 'retainedInstructions',
          path: 'overture-division-exclusions',
        },
      },
      implementation: {
        path: `${core}division.ts`,
        symbol: 'buildDivisionHierarchyLookup',
      },
      expression:
        'Map the complete publisher Division inventory to effective classification and display names, keyed by id.',
      evaluation: {
        cardinality: 'many-to-one',
        bind: 'For each publisher row rebind id/names/class/subtype/admin_level/parent_division_id for the effectiveClass/effectiveLevel/effectiveI18n producers.',
        key: 'id',
      },
      steps: [
        'Resolve the accepted source schema before reading columns; include admin_level only when it exists in that schema.',
        'Reject missing/duplicate source IDs; exclude identity-matched exclusion patches. Project canonical name rows to non-empty en and zh-hant names.',
        'Preserve a patch replacement null level; do not replace it through nullish fallback. The lookup and per-row output use the same classification candidates.',
      ],
      guards: [
        'Unknown accepted source schema and invalid source identities block ingestion.',
      ],
    }
  if (path === 'divisionSupplementedLookup')
    return {
      inputs: ['divisionLookupInventory', 'sourceVersion'],
      reads: { publisherRows: { stage: 'raw', collection: 'publisher', path: '$' } },
      implementation: {
        path: `${core}division.ts`,
        symbol: 'buildDivisionHierarchyLookup',
      },
      expression:
        'For Overture HK append missing area and city rows; normalise each using the already-built lookup with deferHierarchyGuard=true, then set its effective lookup entry.',
      steps: [
        'Only missing supplemental identities are generated. Their non-empty locale names are retained; the supplemental lookup uses normalised level ?? 0 as in the executor.',
        'The source identity duplicate guard remains on the publisher inventory; supplemental replacements have explicit final-row ordering in translation input selection.',
      ],
    }
  if (path === 'hierarchyLookup')
    return {
      inputs: [
        'divisionSupplementedLookup',
        'sourceVersion',
        'datasetCode',
        'sourceReleaseCode',
      ],
      reads: {
        translations: {
          stage: 'audit',
          collection: 'retainedInstructions',
          path: 'division-name-translations',
        },
      },
      implementation: {
        path: `${cli}processLocalDivisionSqlUploadTranslations.ts`,
        symbol: 'resolveDivisionNameTranslations',
      },
      additionalImplementations: [
        {
          path: `${cli}processLocalDivisionSqlUploadPreparation.ts`,
          symbol: 'translationsByDivisionId',
        },
        {
          path: 'apps/harbour-cli/src/lib/i18n/datasetNameTranslations.ts',
          symbol: 'resolveDatasetNameTranslationsBatch',
        },
      ],
      expression:
        'Resolve translations from the final canonical record inventory and merge returned localisations into existing lookup entries by Division id.',
      steps: [
        'Read publisher plus supplemental rows with fixture replacement order; exclude patched exclusions. Build one translation record per final id, with parent id/names from the base lookup.',
        'Resolve only missing required locales using the retained dataset translation instructions and exact source/context hashes. Generation is a preparation-time operation; release explanation uses the captured applications, never a new translation request.',
        'For each existing lookup entry, spread previous i18n then translated locale names. Do not add absent lookup identities. Hierarchy references consume this final lookup.',
      ],
      audit: { category: 'translations', scope: 'individual', retention: 'decision' },
    }
  return null
}
