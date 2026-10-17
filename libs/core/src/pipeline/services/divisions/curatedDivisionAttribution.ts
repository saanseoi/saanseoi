import {
  attributeDivisionProperties,
  changedDivisionNameProperties,
  normalisedDivisionProperties,
  saanseoiDivisionDataset,
} from './divisionAttribution'
import { curatedRecordSources } from '../sources/curatedRecordSources'
import { stableJsonStringify } from '../../utils'

type LocalisedName = { locale: string; name?: string | null; nameAlts?: string | null }
type RecordContent = {
  id: string
  sources?: unknown
  divisionCode?: unknown
  geometry?: unknown
  cartography?: unknown
}
const decoded = (value: unknown) =>
  typeof value === 'string' ? JSON.parse(value) : value

/** Compare final authored content with the native ingredient, never with another release. */
export function curatedDivisionAttribution(
  row: RecordContent,
  names: LocalisedName[],
  upstream?: { geometry?: unknown; names: LocalisedName[] },
) {
  const properties = normalisedDivisionProperties.filter(
    field => field !== 'cartography' || row.cartography != null,
  )
  if (row.divisionCode) properties.push('divisionCode')
  properties.push(...changedDivisionNameProperties(upstream?.names ?? [], names))
  if (
    row.geometry != null &&
    stableJsonStringify(decoded(row.geometry)) !==
      stableJsonStringify(decoded(upstream?.geometry ?? null))
  )
    properties.push('geometry')
  // Assembly references retain detailed curation evidence in the preparation audit.
  // The canonical entry identifies the authored record and its actual fields.
  const sources = curatedRecordSources(row.sources, row.id).filter(
    source =>
      !(source.publisher === 'saanseoi' && source.dataset === saanseoiDivisionDataset),
  )
  return attributeDivisionProperties(sources, row.id, properties)
}
