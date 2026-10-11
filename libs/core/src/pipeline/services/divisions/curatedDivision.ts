import { curatedRecordSources } from '../sources/curatedRecordSources'
import { assertInternalSourceReferences } from '../sources/internalSourceReferences'
import { geographicDivisionClassification } from '@repo/db'
import type { GeoJsonGeometry } from '../../geojson'
import type { NewDivisionRow, DivisionI18nPayload } from '@repo/db/currentSchema'

const json = (value: unknown) => (typeof value === 'string' ? JSON.parse(value) : value)

/** A SaanSeoi archive is already curated; ingestion must not reapply upstream rules. */
export function normaliseCuratedDivision(row: Record<string, unknown>) {
  const record = json(row.record) as Record<string, unknown>
  if (!record || record.id !== row.id || typeof record.class !== 'string')
    throw new Error('Invalid curated division record.')
  if (Object.hasOwn(record, 'wikidata'))
    throw new Error('Curated Wikidata IDs must use identifiers.wikidata.id.')
  assertInternalSourceReferences(record)
  const classification = geographicDivisionClassification(record.class)
  if (!classification) throw new Error(`Unknown curated class: ${record.class}`)
  if (
    (record.level !== undefined && record.level !== classification.level) ||
    (record.category !== undefined && record.category !== classification.category)
  )
    throw new Error('Curated classification does not match its class.')
  const { names, ...base } = record
  const localisations = json(names) as Record<
    string,
    Omit<DivisionI18nPayload, 'divisionId' | 'locale'>
  >
  if (!localisations || Array.isArray(localisations))
    throw new Error('Curated names must be keyed by locale.')
  const hierarchies = structuredClone(
    json(base.hierarchies),
  ) as NewDivisionRow['hierarchies']
  if (!hierarchies || !Array.isArray(hierarchies.full))
    throw new Error('Curated division requires full ancestry.')
  for (const paths of Object.values(hierarchies)) {
    for (const path of paths ?? []) {
      for (const entry of path) {
        const source = entry as unknown as Record<string, unknown>
        if ('fullContainment' in source) {
          source.full_containment = source.fullContainment
          delete source.fullContainment
        }
        if ('containmentGeometry' in source) {
          source.containment_geometry = source.containmentGeometry
          delete source.containmentGeometry
        }
      }
    }
  }
  const now = new Date().toISOString()
  return {
    base: {
      ...base,
      ...classification,
      id: String(record.id),
      class: record.class,
      hierarchies,
      geometry: json(base.geometry) ?? null,
      bbox: json(base.bbox) ?? null,
      cartography: json(base.cartography) ?? null,
      identifiers: json(base.identifiers) ?? null,
      sources: curatedRecordSources(base.sources, String(record.id)),
      divisionCode: base.divisionCode ?? null,
      createdAt: now,
      updatedAt: now,
    } as Omit<NewDivisionRow, 'snapshotId'> & {
      level: number | null
      geometry: GeoJsonGeometry | null
    },
    i18n: Object.entries(localisations).map(([locale, value]) => ({
      ...value,
      divisionId: String(record.id),
      locale,
      nameRules: json(value.nameRules) ?? null,
      nameVariant: json(value.nameVariant) ?? null,
      isLocaleInferred: Boolean(value.isLocaleInferred),
    })) as DivisionI18nPayload[],
    overtureHongKongDivisionClassificationCorrection: null,
    overtureHongKongAreaHierarchyAssignment: null,
  }
}
