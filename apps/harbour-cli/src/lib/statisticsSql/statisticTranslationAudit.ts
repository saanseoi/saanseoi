import {
  retainObject,
  type IndividualAudit,
  type JsonRecord,
  type ProvenanceStore,
} from '@repo/core/provenance'
import { retainRegisteredRule } from '../api/retainedRule'
import { statisticLocalisationRule } from './statisticLocalisationRule'
import type { CenstatdFieldLocalisation } from './censtatdMeasureCurationTypes'

/** Only explicit translation origins are individual translation curations. */
export async function retainStatisticTranslations(
  store: ProvenanceStore,
  input: {
    datasetCode: string
    fieldMetadata: ReadonlyMap<string, unknown>
    measureMetadata?: ReadonlyMap<string, unknown>
    appliedFields: ReadonlySet<string>
    appliedMeasures: ReadonlySet<string>
  },
) {
  const individuals: IndividualAudit[] = []
  const definition = await retainRegisteredRule(
    store,
    statisticLocalisationRule.declaration,
  )
  for (const [type, metadata, applied] of [
    ['field', input.fieldMetadata, input.appliedFields],
    ['measure', input.measureMetadata ?? new Map(), input.appliedMeasures],
  ] as const) {
    for (const [key, value] of metadata) {
      if (!key.startsWith(`${input.datasetCode}\u0000`)) continue
      const entry = value as {
        localisations?: readonly CenstatdFieldLocalisation[]
        fieldName?: string
        measureCode?: string
      }
      const id = type === 'field' ? entry.fieldName : entry.measureCode
      for (const localisation of entry.localisations ?? []) {
        const origin = localisation.origin
        if (
          !origin ||
          (origin.kind !== 'machine-translated' && origin.kind !== 'human-translated')
        )
          continue
        const fixture = await retainObject(store, {
          kind: 'statistic-translation-curation',
          schemaVersion: 1,
          datasetCode: input.datasetCode,
          type,
          key,
          localisation,
        })
        individuals.push({
          id: `${type}:${key}:${localisation.locale}`,
          operation: statisticLocalisationRule.declaration.id,
          basis: 'fixture',
          outcome: id && applied.has(id) ? 'applied' : 'unmatched',
          summary: statisticLocalisationRule.declaration.summary,
          reason:
            id && applied.has(id)
              ? `Applied ${origin.kind} ${localisation.locale} localisation.`
              : 'The selected curation has no matching dictionary entry in this release.',
          definition,
          fixture: { object: fixture, pointer: '/localisation' },
          record: {
            id: id ?? key,
            names: [origin.sourceName, localisation.name],
            parents: [],
          },
          context: {
            datasetCode: input.datasetCode,
            dictionary: type,
            sourceKey: key,
            localisation,
          } as unknown as JsonRecord,
        })
      }
    }
  }
  return individuals
}
