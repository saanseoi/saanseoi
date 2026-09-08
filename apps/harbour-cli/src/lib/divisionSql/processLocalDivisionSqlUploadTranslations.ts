import type { DatasetProcessingMessage } from '@repo/core'
import { divisionTranslationRule } from '@repo/core/pipeline/services/divisionTranslationRule'
import type { DivisionI18nPayload, NewDivisionRow } from '@repo/db/currentSchema'
import type { ReleaseProcessingAction } from '@repo/core/pipeline/db/processingActions'
import {
  type buildDivisionHierarchyLookup,
  normaliseDivisionRow,
} from '@repo/core/pipeline/services/division'
import { readDivisionRowsWithFixtures } from '@repo/core/pipeline/services/divisionFixtures'
import {
  resolveDatasetNameTranslationsBatch,
  type DatasetTranslationApplication,
} from '../i18n/datasetNameTranslations.ts'
import { DIVISION_BATCH_SIZE } from './processLocalDivisionSqlUploadConfig.ts'
import { resolveParentDivisionIdFromHierarchy } from './processLocalDivisionSqlUploadPreparation.ts'

export async function resolveDivisionNameTranslations(
  file: Parameters<typeof buildDivisionHierarchyLookup>[0],
  message: DatasetProcessingMessage,
  hierarchyLookup: Awaited<ReturnType<typeof buildDivisionHierarchyLookup>>,
  sourceRelease: string,
  allowGeneration: boolean,
) {
  // Supplemental division rows are emitted after source rows so they can replace an
  // identically keyed Overture point with its corrective area record. Resolve one
  // translation input per final canonical division, preserving that last-row-wins
  // ordering while retaining the duplicate-ID guard in the generic resolver.
  const recordsById = new Map<
    string,
    {
      context: Record<string, string | null>
      localisations: Array<{ locale: string; name: string }>
      recordId: string
    }
  >()

  for await (const { rows, replacedDivisionIds } of readDivisionRowsWithFixtures(
    file,
    message,
    DIVISION_BATCH_SIZE,
  )) {
    for (const row of rows) {
      const normalised = normaliseDivisionRow(row, {
        hierarchyLookup,
        source: message,
        deferHierarchyGuard: replacedDivisionIds.has(String(row.id)),
      })
      const parentDivisionId = resolveParentDivisionIdFromHierarchy(
        normalised.base.hierarchy,
      )
      recordsById.set(normalised.base.id, {
        context: {
          parentDivisionId,
          ...Object.fromEntries(
            Object.entries(
              parentDivisionId
                ? (hierarchyLookup.get(parentDivisionId)?.i18n ?? {})
                : {},
            ).flatMap(([locale, value]) =>
              value?.name ? [[`parentName.${locale.toLowerCase()}`, value.name]] : [],
            ),
          ),
          parentName: parentDivisionId
            ? (hierarchyLookup.get(parentDivisionId)?.i18n.en?.name ?? null)
            : null,
        },
        localisations: normalised.i18n.flatMap(localised =>
          localised.name ? [{ locale: localised.locale, name: localised.name }] : [],
        ),
        recordId: normalised.base.id,
      })
    }
  }

  const datasetCode = message.datasetCode
  if (!datasetCode) {
    throw new Error('Division i18n fixtures require a dataset code.')
  }

  return resolveDatasetNameTranslationsBatch({
    allowGeneration,
    datasetCode,
    records: [...recordsById.values()],
    sourceRelease,
  })
}

export function mergeDivisionI18nTranslations(
  source: DivisionI18nPayload[],
  localisations: Array<{ locale: string; name: string }>,
  applications: DatasetTranslationApplication[],
) {
  return divisionTranslationRule.execute({ source, localisations, applications })
}

export function divisionAuditParents(
  hierarchy: unknown,
): Array<{ id: string; names: string[] }> {
  if (!Array.isArray(hierarchy)) return []
  return hierarchy.flatMap(parent => {
    if (!parent || typeof parent !== 'object' || typeof parent.division_id !== 'string')
      return []
    const localisations =
      parent.i18n && typeof parent.i18n === 'object' ? Object.values(parent.i18n) : []
    return [
      {
        id: parent.division_id,
        names: localisations.flatMap(value =>
          value &&
          typeof value === 'object' &&
          'name' in value &&
          typeof value.name === 'string'
            ? [value.name]
            : [],
        ),
      },
    ]
  })
}

export function buildDivisionTranslationProcessingActions(input: {
  division: Pick<NewDivisionRow, 'id' | 'level' | 'type'>
  rawNames: unknown
  translations: DatasetTranslationApplication[]
  parents?: Array<{ id: string; names: string[] }>
}): ReleaseProcessingAction[] {
  return input.translations.map(translation => ({
    action:
      translation.provenance === 'human-translated'
        ? 'division_name_human_translated'
        : 'division_name_ai_translated',
    affectedRecordCount: 1,
    evidence: {
      canonicalDivision: {
        id: input.division.id,
        level: input.division.level,
        type: input.division.type,
      },
      sourceNames: input.rawNames ?? null,
      translation,
      parents: input.parents ?? [],
    },
    mode: translation.provenance === 'human-translated' ? 'manual' : 'automatic',
    summary:
      translation.provenance === 'human-translated'
        ? 'Added a human-translated division name locale.'
        : 'Added an AI-translated division name locale.',
  }))
}
