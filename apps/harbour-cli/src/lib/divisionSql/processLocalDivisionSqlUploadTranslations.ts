import type { DatasetProcessingMessage } from '@repo/core'
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

  for await (const { rows } of readDivisionRowsWithFixtures(
    file,
    message,
    DIVISION_BATCH_SIZE,
  )) {
    for (const row of rows) {
      const normalised = normaliseDivisionRow(row, { hierarchyLookup })
      const parentDivisionId = resolveParentDivisionIdFromHierarchy(
        normalised.base.hierarchy,
      )
      recordsById.set(normalised.base.id, {
        context: {
          parentDivisionId,
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
  const existing = new Set(source.map(localised => localised.locale))
  const divisionId = source[0]?.divisionId
  if (!divisionId) return source

  return [
    ...source,
    ...localisations.flatMap(localised =>
      existing.has(localised.locale)
        ? []
        : [
            {
              divisionId,
              isLocaleInferred: false,
              locale: localised.locale,
              name: localised.name,
              nameAlts: null,
              nameProvenance:
                applications.find(
                  application => application.locale === localised.locale,
                )?.provenance ?? 'ai-translated',
              nameRules: null,
              nameVariant: [localised.name],
            } satisfies DivisionI18nPayload,
          ],
    ),
  ]
}

export function buildOvertureDivisionTranslationProcessingActions(input: {
  division: Pick<NewDivisionRow, 'id' | 'level' | 'type'>
  rawNames: unknown
  translations: DatasetTranslationApplication[]
}): ReleaseProcessingAction[] {
  return input.translations.map(translation => ({
    action:
      translation.provenance === 'human-translated'
        ? 'overture_division_name_human_translated'
        : 'overture_division_name_ai_translated',
    affectedRecordCount: 1,
    evidence: {
      canonicalDivision: {
        id: input.division.id,
        level: input.division.level,
        type: input.division.type,
      },
      sourceNames: input.rawNames ?? null,
      translation,
    },
    mode: translation.provenance === 'human-translated' ? 'manual' : 'automatic',
    summary:
      translation.provenance === 'human-translated'
        ? 'Added a human-translated division name locale.'
        : 'Added an AI-translated division name locale.',
  }))
}
