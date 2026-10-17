import { expect, test } from 'bun:test'
import {
  geographicFieldRule,
  validateGeographicRule,
} from './fieldLineageGeographicRules'
import {
  humanDivisionField,
  curatedPreparationField,
  validateHumanOperation,
} from './fieldLineageHuman'
import { divisionTaxonomy } from './divisionTaxonomy'
import { normaliseCuratedDivision } from '../../core/src/pipeline/services/divisions/curatedDivision'
import { applyCuratedRecordContract } from '../../../apps/harbour-cli/src/lib/pipeline/curatedDivisions/recordContract'

const fields = [
  'cartography',
  'category',
  'class',
  'geometry',
  'hierarchies',
  'i18n.*.nameAlts',
  'i18n.*.nameRules',
  'i18n.en.name',
  'i18n.zh-hans.name',
  'i18n.zh-hant.name',
  'identifiers.wikidata.id',
  'level',
  'sources',
  'id',
  'relationships.areas',
  'relationships.boundaries',
]
test('every geographic Division field has a retained explanation and substantive rules', () => {
  for (const field of fields) {
    const human = humanDivisionField('division', field, 'ds-hk-saanseoi-division')!
    validateHumanOperation(human)
    const rule = human.rule ?? geographicFieldRule(field, true)
    validateGeographicRule(rule)
    expect(JSON.stringify(rule)).not.toMatch(
      /input0|selectedSource|JSON.stringify|Derivation of/,
    )
  }
})
test('category and level tables agree with actual curated ingestion for every class', () => {
  for (const klass of Object.keys(divisionTaxonomy)) {
    const { base } = normaliseCuratedDivision({
      id: 'example',
      record: { id: 'example', class: klass, names: {}, hierarchies: { full: [] } },
    })
    for (const field of ['category', 'level'] as const) {
      const result = geographicFieldRule(field)!
      const rule = result.kind === 'sections' ? result.sections[0]!.rule : result
      if (rule.kind !== 'mapping') throw Error('Expected mapping')
      const rows = rule.rows.filter(row => row[0]!.split(', ').includes(klass))
      expect(rows).toHaveLength(1)
      expect(rows[0]![1]).toBe(String(base[field]))
    }
  }
})
test('cartography table agrees with the actual preparation output', () => {
  const rule = geographicFieldRule('cartography')!
  if (rule.kind !== 'mapping') throw Error('Expected mapping')
  expect(Object.fromEntries(rule.rows.map(row => [row[0], Number(row[3])]))).toEqual({
    country: 6,
    sar: 10,
    area: 12,
    district: 14,
    city: 14,
    town: 15,
    rural_area: 16,
    village: 18,
    hamlet: 19,
    macrohood: 16,
    neighbourhood: 18,
    microhood: 19,
    major_island: 14,
    minor_island: 17,
    islet: 19,
    island_group: 15,
  })
  for (const row of rule.rows) {
    expect(Number(row[3])).toBeGreaterThan(Number(row[1]))
    const input: Record<string, any> = {
      id: 'example',
      class: row[0],
      category: divisionTaxonomy[row[0] as keyof typeof divisionTaxonomy].category,
    }
    applyCuratedRecordContract([input])
    expect(input.cartography).toEqual({
      minZoom: Number(row[1]),
      prominence: Number(row[2]),
      maxZoom: Number(row[3]),
    })
  }
})
test('Wikidata trace describes the Q identifier without unrelated identifier matches', () => {
  const human = curatedPreparationField('record.identifiers.wikidata.id')
  expect(human.sources.map(source => source.datasetCode)).toEqual([
    'ds-hk-overture-division',
  ])
  expect(human.rule).toEqual(geographicFieldRule('identifiers.wikidata.id', true))
})
test('rule schema rejects malformed tables and empty choices', () => {
  for (const rule of [
    { kind: 'mapping', columns: ['Input', 'Output'], rows: [['one']] },
    { kind: 'priority', branches: [] },
    { kind: 'sequence', steps: [] },
  ])
    expect(() => validateGeographicRule(rule)).toThrow()
})

test('class lineage uses the processor mapping, without level inference', async () => {
  const { publisherClassificationRules } = await import('./fieldLineageDivisionClass')
  const { normaliseDivisionRow } = await import(
    '../../core/src/pipeline/services/divisions/division'
  )
  const rule = publisherClassificationRules('Class Classification')
  if (rule.kind !== 'mapping') throw Error('Expected class mapping')
  expect(rule.rows).toHaveLength(11)
  for (const [subtype, klass, result] of [
    ['country', '', 'country'],
    ['dependency', '', 'sar'],
    ['region', 'town', 'district'],
    ['locality', 'town', 'town'],
    ['', 'city', 'city'],
    ['unknown', 'town', 'town'],
    ['microhood', 'hamlet', 'hamlet'],
    ['locality', 'village', 'village'],
    ['neighborhood', '', 'neighbourhood'],
    ['unknown', 'macrohood', 'macrohood'],
  ] as const) {
    const row = normaliseDivisionRow({
      id: 'test',
      subtype,
      class: klass,
      names: { primary: 'Test' },
      hierarchies: [],
      geometry: null,
    })
    expect(row.base.class).toBe(result)
    expect(rule.rows.some(entry => entry[1] === result)).toBe(true)
  }
  const human = curatedPreparationField('record.class')
  expect(human.rule?.kind).toBe('mapping')
  expect(human.detailRules).toBeUndefined()
  expect(JSON.stringify(human.rule)).not.toContain('Keep the publisher class')
})
test('displayed automatic name variant agrees with the actual name processor', async () => {
  const { applyCuratedDivisionNames } = await import(
    '../../core/src/pipeline/services/divisions/curatedDivisionPolicy'
  )
  const result = applyCuratedDivisionNames('example', [
    {
      divisionId: 'example',
      locale: 'en',
      name: 'Example Tsuen',
      nameAlts: null,
      nameVariant: null,
      nameRules: null,
      meta: null,
    },
  ])
  expect(result[0]!.nameAlts).toBe('Example Village')
  expect(JSON.stringify(geographicFieldRule('i18n.*.nameAlts', true))).toContain(
    'Tsuen',
  )
  expect(JSON.stringify(geographicFieldRule('i18n.*.nameRules', true))).toContain(
    'Village',
  )
})

test('class never depends on level and level shows only the final class mapping', () => {
  const rule = geographicFieldRule('class')!
  if (rule.kind !== 'mapping') throw Error('Expected mapping')
  expect(rule.columns[0]).toBe('First matching check wins')
  expect(rule.rows.slice(0, 5).map(row => row[1])).toEqual([
    'Corrected class',
    'Assigned class (including island_group)',
    'major_island',
    'minor_island',
    'islet',
  ])
  expect(JSON.stringify(rule)).not.toContain('field-reference')
  expect(JSON.stringify(rule)).toContain('explicit SaanSeoi classification')
  expect(geographicFieldRule('level')!.kind).toBe('mapping')
})

test('source selection distinguishes ordered actions from conditions required together', async () => {
  const { withRecordSelection } = await import('./fieldLineageRecordSelection')
  const { validateGeographicRule } = await import('./fieldLineageGeographicRules')
  const [source] = withRecordSelection([
    {
      datasetCode: 'ds-hk-overture-division',
      resourceType: 'divisionArea',
      contribution: 'Territory',
    },
  ])
  const rule = source!.selection!
  validateGeographicRule(rule)
  if (rule.kind !== 'source-selection') throw Error('Expected source selection')
  expect(rule.cases).toHaveLength(2)
  expect(rule.cases[0]!.steps[0]!.all).toEqual([
    'divisionId = this Division’s ID',
    'isTerritorial = true',
  ])
  expect(() =>
    validateGeographicRule({
      kind: 'source-selection',
      cases: [{ when: 'Territory', steps: [{ action: 'Select', all: [] }] }],
    }),
  ).toThrow('Invalid source selection')
  expect(() =>
    validateGeographicRule({
      kind: 'source-selection',
      cases: [{ when: 'Territory', steps: [] }],
    }),
  ).toThrow('Invalid source selection')
})
