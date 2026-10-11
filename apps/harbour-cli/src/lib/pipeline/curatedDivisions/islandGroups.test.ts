import { expect, test } from 'bun:test'
import { assembleCuratedDivisions } from './assemble'
import { divisionCuration } from '@repo/core/pipeline/services/divisions/curationInventory'
import definitions from '../../../../../../fixtures/meta/curations/saanseoi-division/island-groups.json'
import { curatedDivisionPolicy } from '@repo/core/pipeline/services/divisions/curatedDivisionPolicy'
import { applyDivisionExclusionPatch } from '@repo/core/pipeline/services/divisions/divisionExclusionPatch'
const exclusions = divisionCuration.exclusions
const groups = [
  ...divisionCuration.additions.entries.filter(row => row.class === 'island_group'),
  {
    id: '13363714-2649-4066-935d-c24757ff2a86',
    class: 'island_group',
    names: { en: 'Po Toi Islands', 'zh-hant': '蒲台群島' },
  },
  {
    id: '15de4c83-f54a-4eaa-b002-c88de1f8c310',
    class: 'island_group',
    names: { en: 'Soko Islands', 'zh-hant': '索罟群島' },
  },
].map(row => ({ ...row, category: 'landform', level: null }))
test('five curated groups retain official identities and null landform levels', () => {
  expect(groups.map(row => row.names.en).sort()).toEqual([
    'Ninepin Group',
    'Po Toi Islands',
    'Soko Islands',
    'The Brothers',
    'Ung Kong Group',
  ])
  for (const group of groups) {
    expect(group.category).toBe('landform')
    expect(group.level).toBeNull()
    expect(group.names['zh-hant']).toBeTruthy()
    expect(exclusions.entries.some(row => row.divisionId === group.id)).toBe(false)
    expect(
      definitions.entries.find(row => row.divisionId === group.id)?.seedMemberIds
        .length,
    ).toBeGreaterThan(1)
  }
  for (const [name, geoNameId] of [
    ['Ninepin Group', '3180'],
    ['Po Toi Islands', '3181'],
    ['Soko Islands', '3182'],
    ['The Brothers', '3183'],
  ] as const) {
    const group = groups.find(row => row.names.en === name)!
    const override = curatedDivisionPolicy.overrides.entries.find(
      row => row.divisionId === group.id,
    )!
    expect(override.identifiers).toEqual({ 'hkgov-landsd': { geoNameId } })
  }
  for (const id of [
    '13363714-2649-4066-935d-c24757ff2a86',
    '15de4c83-f54a-4eaa-b002-c88de1f8c310',
  ])
    expect(
      applyDivisionExclusionPatch({
        id,
        admin_level: null,
        class: null,
        subtype: 'macrohood',
      }),
    ).toBeNull()
})

test('group membership has unique seeds and scoped Ung Kong peripheral members', () => {
  for (const group of definitions.entries) {
    expect(group.include).toEqual(
      group.divisionId === 'ss-1df48b7f-e05d-5529-8e89-3b3edbf77146'
        ? [
            'LANDSD:PLACE_NAME:732',
            'BASEMAP:ISLAND:20237d751b5fe16d',
            'BASEMAP:ISLAND:ad777e9a7bc9fd4c',
          ]
        : [],
    )
    expect(group.exclude).toEqual([])
    expect(new Set(group.seedMemberIds).size).toBe(group.seedMemberIds.length)
  }
})

test('assembly preserves a reclassified group without publishing an individual-island polygon', () => {
  const group = groups.find(row => row.names.en === 'Ung Kong Group')!
  const sourceId = 'BASEMAP:ISLAND:00e285208161a7e1'
  const island = {
    id: sourceId,
    name: 'Ung Kong Group',
    areaKm2: 9,
    point: [114.35, 22.32] as [number, number],
  }
  const input = {
    divisions: [
      { id: group.id, class: 'island_group', category: 'landform', level: null },
    ],
    names: [],
    areas: [],
    estimatedAreas: { features: [] },
    hierarchy: { entries: [] },
    islands: [island],
    islandReview: {
      entries: [{ ...island, decision: 'rejected' }],
      curationPolicy: {
        version: 1,
        aliasGroups: [],
        actions: [
          { id: sourceId, action: 'reclassify' as const, class: 'island_group' },
        ],
      },
    },
  }
  const result = assembleCuratedDivisions(input)
  expect(result.divisions.map(row => row.id)).toEqual([group.id])
  expect(result.islandCount).toBe(0)
  expect(result.areas).toEqual([])
  expect(JSON.parse(result.divisions[0]!.sources).saanseoi[0].recordId).toBe(sourceId)
  expect(
    assembleCuratedDivisions({ ...input, excludedIds: [group.id] }).divisions,
  ).toEqual([])
  expect(assembleCuratedDivisions({ ...input, divisions: [] }).divisions).toEqual([])
})

test('Ninepin and Soko seed envelopes retain peripheral islands', () => {
  const ninepin = definitions.entries.find(
    g => g.divisionId === 'ss-8b76fa2a-3216-5845-9eae-3aa4b6936047',
  )!
  const soko = definitions.entries.find(
    g => g.divisionId === '15de4c83-f54a-4eaa-b002-c88de1f8c310',
  )!
  expect(ninepin.seedMemberIds).toEqual(
    expect.arrayContaining([
      'LANDSD:PLACE_NAME:1582',
      'LANDSD:PLACE_NAME:2060',
      'LANDSD:PLACE_NAME:532',
      'BASEMAP:ISLAND:c90503aaaf585437',
    ]),
  )
  expect(soko.seedMemberIds).toEqual(
    expect.arrayContaining([
      'LANDSD:PLACE_NAME:1010',
      'LANDSD:PLACE_NAME:159',
      'LANDSD:PLACE_NAME:2291',
      'LANDSD:PLACE_NAME:714',
    ]),
  )
})
