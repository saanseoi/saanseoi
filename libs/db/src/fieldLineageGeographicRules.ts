import { divisionClassRules } from './fieldLineageDivisionClass'
import names from '../../../fixtures/meta/curations/saanseoi-division/division-names.json'
import { divisionTaxonomy, divisionCartography } from './divisionTaxonomy'

/** Retained, declarative rules rendered as tables or ordered choices. */
export type GeographicRule =
  | {
      kind: 'sections'
      sections: Array<{ title: string; description: string; rule: GeographicRule }>
    }
  | { kind: 'mapping'; columns: string[]; rows: string[][] }
  | { kind: 'priority'; branches: Array<{ when: string; value: string }> }
  | { kind: 'sequence'; steps: string[] }

const mapping = (columns: string[], rows: string[][]): GeographicRule => ({
  kind: 'mapping',
  columns,
  rows,
})
const priority = (...branches: Array<[string, string]>): GeographicRule => ({
  kind: 'priority',
  branches: branches.map(([when, value]) => ({ when, value })),
})
const sequence = (...steps: string[]): GeographicRule => ({ kind: 'sequence', steps })
function taxonomyMapping(field: 'category' | 'level') {
  const groups = new Map<string, string[]>()
  for (const [klass, value] of Object.entries(divisionTaxonomy)) {
    const key = String(value[field])
    groups.set(key, [...(groups.get(key) ?? []), klass])
  }
  return mapping(
    ['Class', field === 'category' ? 'Category' : 'Level'],
    [...groups].map(([value, classes]) => [classes.join(', '), value]),
  )
}

/** Geographic Division rules only; other domains retain their own vocabulary. */
export function geographicFieldRule(
  field: string,
  preparation = false,
): GeographicRule | undefined {
  field = field
    .replace(/^attributes\./, '')
    .replace(/^record\./, '')
    .replace(/^names\./, 'i18n.')
  if (field === 'category' || field === 'level') return taxonomyMapping(field)
  if (field === 'class') return divisionClassRules()
  if (field === 'cartography')
    return mapping(
      ['Class', 'Min zoom', 'Prominence', 'Max zoom'],
      Object.entries(divisionCartography).map(
        ([klass, [zoom, prominence, maxZoom]]) => [
          klass,
          String(zoom),
          String(prominence),
          String(maxZoom),
        ],
      ),
    )
  if (field === 'geometry')
    return preparation
      ? priority(
          ['Point or core-point override exists', 'Curated Override'],
          ['Selected island with a LandsD location', 'Use the LandsD point'],
          [
            'Otherwise, accepted Overture point exists',
            'Overture representative point',
          ],
          [
            'Only selected polygon geometry is available',
            'Calculate a point inside the polygon',
          ],
          ['Otherwise', 'null'],
        )
      : undefined
  if (field === 'hierarchies')
    return preparation
      ? sequence(
          'Final Division area, or its point when no area exists',
          'Find eligible parents with overlapping areas',
          'Build separate ancestor paths for each covered part',
          'Preserve explicit ancestors without area geometry; calculate full containment',
        )
      : mapping(
          ['Output', 'Rule'],
          [
            ['administrative', 'Administrative ancestors'],
            ['landform', 'Landform ancestors'],
            ['locality', 'Ancestors in the locality or hood categories'],
            [
              'full',
              'Combined ancestor path; omit city and the Hong Kong Island landform',
            ],
            [
              'fullContainment',
              'Whether the ancestor area covers the entire Division area',
            ],
          ],
        )
  if (field.endsWith('.nameAlts'))
    return sequence(
      'Publisher alternatives + SaanSeoi curated aliases',
      ...names.nameAliasRules.map(
        rule =>
          `${rule.locale}: name ending “${rule.suffix.trim()}” → add “${rule.replacement.trim()}” alternative`,
      ),
      'Remove the primary name and explicitly removed aliases',
      'Remove duplicates',
      'Alternative names for this language',
    )
  if (field.endsWith('.nameRules'))
    return sequence(
      'Publisher name rules',
      'Remove explicitly removed values',
      'Add SaanSeoi curated aliases as alternate rules',
      ...names.nameAliasRules.map(
        rule =>
          `${rule.locale}: “${rule.suffix.trim()}” → “${rule.replacement.trim()}” alternate`,
      ),
      'Rules for this language',
    )
  if (field.endsWith('.nameVariant'))
    return sequence(
      'Publisher name variants + primary name + aliases',
      'Remove excluded values and duplicates',
      'Variants for this language',
    )
  if (field.startsWith('i18n.') && field.endsWith('.name')) {
    if (field.includes('.zh-hans.'))
      return priority(
        ['Explicit publisher Simplified Chinese name', 'Keep the supplied name'],
        [
          'No explicit Simplified Chinese name',
          'Do not infer or convert another language',
        ],
      )
    return priority(
      ['Curated name exists for this language', 'Use the curated name'],
      ['Selected island has an official LandsD name', 'Use the official LandsD name'],
      ['Otherwise, accepted Overture name exists', 'Overture name for this language'],
      ['Otherwise, selected Protomaps name exists', 'Protomaps name for this language'],
      ['Otherwise', 'No name for this language'],
    )
  }
  if (field === 'identifiers.wikidata.id')
    return sequence(
      'Accepted publisher or SaanSeoi curated Wikidata link',
      'Keep the Q identifier',
      'identifiers.wikidata.id',
    )
  if (field === 'identifiers')
    return sequence(
      'Accepted publisher identifiers + SaanSeoi curated identity matches',
      'Group by publisher; retain Wikidata under wikidata.id',
      'Add LandsD identifier for a unique accepted match',
    )
  if (field === 'sources')
    return mapping(
      ['Contribution', 'Retained source reference'],
      [
        [
          'Identity, names, classification, hierarchy',
          'Publisher record or SaanSeoi curated decision supplying that property',
        ],
        ['Geometry', 'Selected geometry source or SaanSeoi curated replacement'],
        ['Division code', 'SaanSeoi curated geographic code assignment'],
        ['Membership-only attribution', 'Omitted from public source contributions'],
      ],
    )
  if (field === 'id')
    return priority(
      ['Matched Overture identity', 'Keep the accepted Overture identity'],
      ['SaanSeoi curated alias', 'Use its canonical identity'],
      [
        'New SaanSeoi curated Division',
        'Create a stable identity from its SaanSeoi curated source identity',
      ],
    )
  if (field === 'divisionCode')
    return priority(
      ['SaanSeoi curated geographic code assignment', 'Use the assigned code'],
      ['Otherwise, publisher code exists', 'Publisher code'],
      ['Otherwise', 'null'],
    )
  if (field === 'relationships.areas')
    return sequence(
      'This Division ID',
      'Areas with matching divisionId in the pinned collections',
      'Area resource IDs',
    )
  if (field === 'relationships.boundaries')
    return sequence(
      'This Division ID',
      'Boundaries with matching leftDivisionId or rightDivisionId',
      'Boundary resource IDs',
    )
  if (field === 'createdAt' || field === 'updatedAt')
    return sequence(
      'Timestamp of the selected retained content version',
      `API ${field}`,
    )
  if (field === 'snapshotId')
    return sequence('Release-pinned Division snapshot', 'Snapshot ID')
}

export function validateGeographicRule(
  value: unknown,
): asserts value is GeographicRule {
  const rule = value as GeographicRule
  if (rule?.kind === 'sections') {
    if (!Array.isArray(rule.sections) || !rule.sections.length)
      throw Error('Invalid geographic rule sections')
    for (const section of rule.sections) {
      if (
        !section ||
        typeof section.title !== 'string' ||
        !section.title.trim() ||
        typeof section.description !== 'string'
      )
        throw Error('Invalid geographic rule section')
      validateGeographicRule(section.rule)
    }
    return
  }
  const strings = (v: unknown): v is string[] =>
    Array.isArray(v) && v.length > 0 && v.every(s => typeof s === 'string' && s.trim())
  if (
    !rule ||
    (rule.kind === 'mapping'
      ? !strings(rule.columns) ||
        !Array.isArray(rule.rows) ||
        !rule.rows.length ||
        rule.rows.some(row => !strings(row) || row.length !== rule.columns.length)
      : rule.kind === 'sequence'
        ? !strings(rule.steps)
        : rule.kind === 'priority'
          ? !Array.isArray(rule.branches) ||
            !rule.branches.length ||
            rule.branches.some(
              branch => !branch || !strings([branch.when, branch.value]),
            )
          : true)
  )
    throw Error('Invalid geographic rule diagram')
}
