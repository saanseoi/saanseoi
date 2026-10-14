import { expect, test } from 'bun:test'
import { curatedNameExamples } from './curatedNames.fixtures'
const inventory = { divisions: curatedNameExamples }
import {
  applyCuratedDivisionNames,
  curatedDivisionClassification,
  curatedDivisionPolicy,
} from './curatedDivisionPolicy'
test('village suffix curations retain the place name and discard standalone suffix variants', () => {
  for (const [id, en, zh] of [
    ['1b0fd737-1ab6-4ae9-a4ce-b48cacb4d221', 'Tui Min Hoi', '對面海'],
    ['378e8ec0-8a13-4c3d-ac26-9c0be601dc60', 'Fui Yiu Ha', '灰窰下'],
    ['5334af4f-7c40-43e8-bbfc-f4d6128d38b0', 'Sha Ha', '沙下'],
  ] as const) {
    const source = [
      ['en', en, 'Village'],
      ['zh-hant', zh, '村'],
    ].map(([locale, base, suffix]) => ({
      divisionId: id,
      locale: locale!,
      name: suffix!,
      nameAlts: base!,
      nameVariant: [suffix!, base!],
      nameRules: [{ value: suffix!, variant: 'alternate' }],
      meta: { isLocaleInferred: false },
    }))
    const result = applyCuratedDivisionNames(id, source)
    expect(result.map(row => row.name)).toEqual([`${en} Village`, `${zh}村`])
    for (const [index, suffix] of ['Village', '村'].entries()) {
      expect(result[index]!.nameVariant).not.toContain(suffix)
      expect(result[index]!.nameAlts).toBe(index === 0 ? en : zh)
      expect(result[index]!.nameRules).toBeNull()
    }
    expect(applyCuratedDivisionNames(id, result)).toEqual(result)
  }
})
function names(english: string) {
  const division = inventory.divisions.find(row => row.names.en === english)!
  return applyCuratedDivisionNames(
    division.id,
    Object.entries(division.names).map(([locale, name]) => ({
      divisionId: division.id,
      locale,
      name: name!,
      nameAlts: null,
      nameVariant: null,
      nameRules: null,
      meta: { isLocaleInferred: false },
    })),
  )
}
test('curated names retain requested bilingual aliases and Tsuen variants', () => {
  const cases = [
    ['Morrison Hill', 'zh-hant', '摩理臣山'],
    ['Central', 'en', 'Central District'],
    ['Central', 'zh-hant', '中區'],
    ['Chai Wan', 'zh-hant', '柴灣區'],
    ['Mid-Levels', 'zh-hant', '半山區'],
    ['Wong Chuk Hang San Wai', 'en', 'Wong Chuk Hang San Wai Village'],
    ['Wong Chuk Hang San Wai', 'zh-hant', '黃竹坑新圍村'],
    ['Hok Tsui Tsuen', 'en', 'Hok Tsui Village'],
    ['Stanley', 'en', 'Chek Chue'],
    ['Stanley Village', 'en', 'Chek Chue Village'],
    ['Yau Yat Chuen', 'en', 'Yau Yat Tsuen'],
  ]
  for (const [name, locale, alias] of cases)
    expect(
      names(name!)
        .find(row => row.locale === locale)
        ?.nameAlts?.split('|'),
    ).toContain(alias!)
  for (const division of inventory.divisions.filter(row =>
    row.names.en?.endsWith(' Tsuen'),
  ))
    expect(
      names(division.names.en!)
        .find(row => row.locale === 'en')
        ?.nameAlts?.split('|'),
    ).toContain(division.names.en!.replace(/ Tsuen$/, ' Village'))
  expect(names('Chai Wan').find(row => row.locale === 'zh-hant')?.name).toBe('柴灣')
})
test('Pak Kan is a curated level-six microhood with a native marker and drawing pending', () => {
  const division = inventory.divisions.find(row => row.names.en === 'Pak Kan')!
  expect(curatedDivisionClassification(division.id)).toMatchObject({
    class: 'microhood',
    category: 'hood',
    level: 6,
  })
  expect(division.point).toEqual([114.21345858231945, 22.216898082936954])
  const override = curatedDivisionPolicy.overrides.entries.find(
    row => row.divisionId === division.id,
  )!
  expect(override).toMatchObject({
    identifiers: { 'hkgov-landsd': { geoNameId: '3038' } },
    geometryReview: 'draw-required',
  })
})

test('Mid-Levels resolves its curated LandsD identity with its curated district alias', () => {
  const division = inventory.divisions.find(row => row.names.en === 'Mid-Levels')!
  expect(
    curatedDivisionPolicy.overrides.entries.find(row => row.divisionId === division.id),
  ).toMatchObject({ identifiers: { 'hkgov-landsd': { geoNameId: '1111' } } })
  const chinese = names('Mid-Levels').find(row => row.locale === 'zh-hant')!
  expect(chinese.name).toBe('半山')
  expect(chinese.nameAlts?.split('|') ?? []).toContain('半山區')
})

test('dedicated aliases preserve source alternatives and apply idempotently', () => {
  for (const [primary, locale, alias] of [
    ['West Kowloon', 'en', 'West Kowloon Reclamation'],
    ['Starstreet', 'en', 'Starstreet Precinct'],
  ]) {
    const entry = curatedDivisionPolicy.aliases.entries.find(entry =>
      Object.values(entry.names).some(
        change =>
          typeof change === 'object' &&
          change !== null &&
          'aliases' in change &&
          Array.isArray(change.aliases) &&
          change.aliases.includes(alias!),
      ),
    )!
    const source = [
      {
        divisionId: entry.divisionId,
        locale: locale!,
        name: primary!,
        nameAlts: 'Existing alias',
        nameVariant: [primary!, 'Existing alias'],
        nameRules: [{ value: 'Existing alias', variant: 'alternate' }],
        meta: { isLocaleInferred: false },
      },
    ]
    const once = applyCuratedDivisionNames(entry.divisionId, source)
    expect(once[0]!.name).toBe(primary!)
    expect(once[0]!.nameAlts?.split('|')).toEqual(['Existing alias', alias!])
    expect(once[0]!.nameRules).toContainEqual({ value: alias!, variant: 'alternate' })
    expect(applyCuratedDivisionNames(entry.divisionId, once)).toEqual(once)
    expect(source[0]!.nameAlts).toBe('Existing alias')
  }
})

test('Kwun Chung excludes Jordan aliases from every name representation', () => {
  const id = '1aae385b-4843-4ea9-b8b3-d3726764daf3'
  const result = applyCuratedDivisionNames(id, [
    {
      divisionId: id,
      locale: 'en',
      name: 'Kwun Chung',
      nameAlts: 'Jordan|佐敦 Jordan|佐敦|Retained',
      nameVariant: ['Kwun Chung', 'Jordan', '佐敦 Jordan', '佐敦', 'Retained'],
      nameRules: [
        { value: 'Jordan', variant: 'alternate' },
        { value: 'Retained', variant: 'alternate' },
      ],
      meta: { isLocaleInferred: false },
    },
  ])[0]!
  expect(result.nameAlts).toBe('Retained')
  expect(result.nameVariant).toEqual(['Kwun Chung', 'Retained'])
  expect(result.nameRules).toEqual([{ value: 'Retained', variant: 'alternate' }])
})
