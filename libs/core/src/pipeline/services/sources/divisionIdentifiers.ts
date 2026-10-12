import { canonicalIdentifiers as divisionIdentifiers } from './canonicalIdentifiers'
export { canonicalIdentifiers as divisionIdentifiers } from './canonicalIdentifiers'
export type {
  CanonicalIdentifierValue as DivisionIdentifierValue,
  CanonicalIdentifiers as DivisionIdentifiers,
} from './canonicalIdentifiers'

/** Apply the identifier contract to authored SaanSeoi source properties. */
export function divisionIdentifierProperties(properties: Record<string, unknown>) {
  return 'identifiers' in properties
    ? { ...properties, identifiers: divisionIdentifiers(properties.identifiers) }
    : properties
}

/** Retain the publisher's Wikidata link as a grouped external identifier. */
export function divisionIdentifiersWithWikidata(value: unknown, wikidata: unknown) {
  const identifiers = divisionIdentifiers(value)
  if (wikidata == null || wikidata === '') return identifiers
  if (typeof wikidata !== 'string' || !/^Q[1-9][0-9]*$/.test(wikidata))
    throw new Error('Invalid Division Wikidata identifier.')
  const existing = identifiers?.wikidata?.id
  if (existing !== undefined && existing !== wikidata)
    throw new Error('Conflicting division identifier: wikidata.id')
  return { ...identifiers, wikidata: { ...identifiers?.wikidata, id: wikidata } }
}
