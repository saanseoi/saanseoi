import type { Json } from '@repo/core/provenance'
import { auditLabel, auditObject } from './auditDivisionPresentation'
const sections: Record<string, [string, string]> = {
  additions: [
    'Additions',
    'Places added to the division list, with their names, type and representative point.',
  ],
  bounds: [
    'Bounds',
    'Adds bounds for China because the Hong Kong extract does not include the country record needed for the hierarchy.',
  ],
  classifications: [
    'Classifications',
    'The type assigned to each place, such as a neighbourhood, village or island.',
  ],
  decisions: [
    'Hierarchy',
    'Which larger places a division belongs to, from the country down to its local area.',
  ],
  'names.nameAliasRules': [
    'Name alias rules',
    'Rules for recognising alternative forms of a name, such as Tsuen and Village.',
  ],
  names: ['Names', 'Chosen names and spelling corrections in each language.'],
  points: ['Points', 'A chosen location for labelling or locating a place on a map.'],
  islandGroups: ['Island groups', 'Which individual islands make up a named group.'],
  'geometry.features': [
    'Boundaries',
    'Boundary patches using drawn geometry or replacement source geometry.',
  ],
  'geometry.withheld': [
    'Withheld boundaries',
    'Saved drawings that are not used as output boundaries. The map previews the saved shape, not a published area.',
  ],
  'matches.entries': [
    'Source matches',
    'Links between a division and the records describing it in other sources.',
  ],
  'matches.islands': [
    'Island matches',
    'Links between island identities and their source records.',
  ],
  'matches.aliasGroups': [
    'Island aliases',
    'Different source records or names that refer to the same physical island.',
  ],
  'matches.sourceMemberships': [
    'Source membership',
    'Source records associated with each division.',
  ],
  'exclusions.entries': [
    'Exclusions',
    'Identities excluded from the assembled SaanSeoi division list, across all contributing sources.',
  ],
  'exclusions.overture': [
    'Excluded Overture divisions',
    'Overture input records omitted before assembly. These can overlap with the final identity exclusions.',
  ],
  'exclusions.landsd': [
    'Excluded LandsD places',
    'LandsD places left out of the chosen division coverage.',
  ],
  'exclusions.islandActions': [
    'Island actions',
    'Instructions to include, exclude or adjust an island during preparation.',
  ],
  'exclusions.islandDecisions': [
    'Island boundaries',
    'Accepted and rejected island boundaries. Division geometry, when patched, overrides the island boundary.',
  ],
  'selections.entries': [
    'Island boundary sources',
    'The upstream source selected for each island boundary.',
  ],
  'selections.corrections': [
    'Boundary corrections',
    'Adjustments applied to selected island shapes.',
  ],
  'updatePolicy.decisions': [
    'Edition update decisions',
    'Reviewed choices about changes from the accepted edition.',
  ],
}
export function curationSection(entry: Json) {
  const row = auditObject(entry)
  const definition = auditObject(row.definition)
  const review = auditObject(definition.review)
  if (review.field === '$record' && auditObject(review.guard).id) {
    const removed = review.before !== null && review.proposed === null
    if (row.section === 'additions')
      return {
        key: removed ? 'additions.retained' : 'additions.accepted',
        title: removed
          ? 'Removed upstream, but retained'
          : 'New upstream divisions, accepted',
        description: removed
          ? 'The new source data omits these places. A reviewed decision keeps them in SaanSeoi.'
          : 'New source records included after review.',
      }
    if (row.section === 'exclusions')
      return {
        key: removed ? 'exclusions.removed' : 'exclusions.rejected',
        title: removed
          ? 'Removed upstream, confirmed removal'
          : 'New upstream divisions, rejected',
        description: removed
          ? 'The new source data omits these places. A reviewed decision confirms their removal from SaanSeoi.'
          : 'New source records excluded after review.',
      }
  }
  if (row.section === 'selections' && row.collection === 'corrections')
    return {
      key: 'geometry.features',
      title: 'Boundaries',
      description: sections['geometry.features'][1],
    }
  const key = `${row.section}.${row.collection}`
  const [title, description] = sections[key] ??
    sections[String(row.section)] ?? [
      `${auditLabel(String(row.section))} · ${auditLabel(String(row.collection))}`,
      'The choices recorded for this part of the edition.',
    ]
  return { key, title, description }
}

export type CurationCategory = 'curations' | 'patches' | 'rules'
/** Geometry reviews belong to the area output, even in a shared preparation audit. */
export function curationMatchesResource(entry: Json, resourceType: string): boolean {
  const row = auditObject(entry)
  // The selected provider is shown inside its island boundary review.
  if (row.section === 'selections' && row.collection === 'entries') return false
  if (
    row.section === 'selections' ||
    row.section === 'geometry' ||
    (row.section === 'exclusions' && row.collection === 'islandDecisions')
  )
    return resourceType === 'divisionArea'
  return resourceType === 'division'
}
/** Classify the instruction, not the single operation that happened to retain it. */
export function curationCategory(entry: Json): CurationCategory {
  const row = auditObject(entry)
  const review = auditObject(auditObject(row.definition).review)
  if (row.section === 'geometry' && row.collection === 'features') return 'patches'
  if (review.kind === 'patch') return 'patches'
  if (review.kind === 'curation') return 'curations'
  if (row.section === 'names' && row.collection === 'nameAliasRules') return 'rules'
  if (['bounds', 'classifications', 'names', 'points'].includes(String(row.section)))
    return 'patches'
  if (row.section === 'selections' && row.collection === 'corrections') return 'patches'
  if (row.section === 'exclusions' && row.collection === 'islandDecisions')
    return 'curations'
  return 'curations'
}
export function curationOrigin(entry: Json): 'Custom' | 'Guard' {
  const review = auditObject(auditObject(auditObject(entry).definition).review)
  return typeof auditObject(review.guard).id === 'string' ? 'Guard' : 'Custom'
}
