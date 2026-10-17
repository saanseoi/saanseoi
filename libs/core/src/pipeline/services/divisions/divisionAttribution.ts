import { orderSourceAttribution, type SourceAttribution } from '@repo/db'
import { readSourceAttributions } from '../sources/sourceAttribution'

export const saanseoiDivisionDataset = 'ds-hk-saanseoi-division'

/** Merge only executed contributions, without claiming ownership of upstream fields. */
export function attributeDivisionProperties(
  sources: unknown,
  id: string,
  properties: string[],
): SourceAttribution[] {
  const existing = readSourceAttributions(sources)
  if (!properties.length) return existing
  const matches = (source: SourceAttribution) =>
    source.publisher === 'saanseoi' &&
    source.dataset === saanseoiDivisionDataset &&
    source.recordId === id &&
    source.properties !== undefined
  const fields = new Set(properties)
  for (const source of existing.filter(matches))
    for (const field of source.properties!) fields.add(field)
  return [
    ...existing.filter(source => !matches(source)),
    orderSourceAttribution({
      publisher: 'saanseoi',
      dataset: saanseoiDivisionDataset,
      recordId: id,
      properties: [...fields].sort(),
    }),
  ]
}

/** These policies execute for every Overture Division, including unchanged values. */
export const normalisedDivisionProperties = [
  'class',
  'level',
  'category',
  'hierarchies',
  'cartography',
]

/** Attribute authored names only; removing upstream alternatives does not author their survivors. */
export type AttributedDivisionName = {
  locale: string
  name?: string | null
  nameAlts?: string | null
}
export function changedDivisionNameProperties(
  before: AttributedDivisionName[],
  after: AttributedDivisionName[],
): string[] {
  const original = new Map(before.map(row => [row.locale, row]))
  return after.flatMap(row => {
    const prior = original.get(row.locale)
    const fields: string[] = []
    if (row.name != null && row.name !== prior?.name)
      fields.push(`i18n.${row.locale}.name`)
    const previousAlternatives = new Set(
      prior?.nameAlts?.split('|').filter(Boolean) ?? [],
    )
    if (
      row.nameAlts
        ?.split('|')
        .filter(Boolean)
        .some(name => !previousAlternatives.has(name))
    )
      fields.push(`i18n.${row.locale}.nameAlts`)
    return fields
  })
}
