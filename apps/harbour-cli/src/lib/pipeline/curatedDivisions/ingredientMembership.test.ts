import { expect, test } from 'bun:test'
import { attachIngredientMembership } from './ingredientMembership'
const geometry = { type: 'Point', coordinates: [114.15, 22.33] }
const labels = (id: string) => [
  { divisionId: id, locale: 'en', name: 'Village' },
  { divisionId: id, locale: 'zh-hant', name: '村' },
]
test('membership uses native GEO_NAME_ID and retains GERS identity without row indexes', () => {
  const input = {
    divisions: [{ id: 'gers', geometry }],
    names: labels('gers'),
    landsd: [{ id: 'native', geometry, identifiers: { 'LANDSD:GEO_NAME_ID': '42' } }],
    landsdNames: labels('native'),
    landsdRelease: 'landsd-june',
    overtureIds: new Set(['gers']),
    overtureRelease: 'overture-august',
  }
  const result = attachIngredientMembership(input)
  expect(result.matched).toBe(1)
  expect(result.divisions[0]!.identifiers['hkgov-landsd']?.geoNameId).toBe('42')
  expect(result.divisions[0]!.sources.hkgovLandsd).toBeUndefined()
  expect(result.divisions[0]!.sources.overture[0].contributions).toEqual(['identity'])
  expect(result.divisions[0]!.sources.overture[0].recordId).toBe('gers')
  expect(
    attachIngredientMembership({
      ...input,
      landsdNames: [...input.landsdNames, ...labels('ambiguous')],
      landsd: [...input.landsd, { ...input.landsd[0]!, id: 'ambiguous' }],
    }).matched,
  ).toBe(0)
  expect(
    attachIngredientMembership({
      ...input,
      divisions: [{ id: 'gers', geometry: { type: 'Point', coordinates: [115, 23] } }],
    }).matched,
  ).toBe(0)
})

test('bilingual matches allow relocated labels within 5,000 metres but retain distance and uniqueness gates', () => {
  const input = {
    divisions: [{ id: 'curated', geometry }],
    names: labels('curated'),
    landsd: [
      {
        id: 'native',
        geometry: { type: 'Point', coordinates: [114.15, 22.33 + 4000 / 111320] },
        identifiers: { 'LANDSD:GEO_NAME_ID': '42' },
      },
    ],
    landsdNames: labels('native'),
    landsdRelease: 'landsd-june',
    overtureIds: new Set<string>(),
    overtureRelease: 'overture-august',
  }
  expect(attachIngredientMembership(input).matched).toBe(1)
  expect(
    attachIngredientMembership({
      ...input,
      landsd: [
        {
          ...input.landsd[0]!,
          geometry: { type: 'Point', coordinates: [114.15, 22.33 + 6000 / 111320] },
        },
      ],
    }).matched,
  ).toBe(0)
  expect(
    attachIngredientMembership({
      ...input,
      landsdNames: [
        { divisionId: 'native', locale: 'en', name: 'Different village' },
        labels('native')[1]!,
      ],
    }).matched,
  ).toBe(0)
  expect(
    attachIngredientMembership({
      ...input,
      divisions: [...input.divisions, { id: 'second', geometry }],
      names: [...input.names, ...labels('second')],
    }).matched,
  ).toBe(0)
})

test('membership matches curated aliases and government aliases without weakening bilingual uniqueness', () => {
  const args = {
    divisions: [{ id: 'central', geometry }],
    names: [
      {
        divisionId: 'central',
        locale: 'en',
        name: 'Central',
        nameAlts: 'Central District',
      },
      { divisionId: 'central', locale: 'zh-hant', name: '中環' },
    ],
    landsd: [
      { id: 'government', geometry, identifiers: { 'LANDSD:GEO_NAME_ID': '42' } },
    ],
    landsdNames: [
      { divisionId: 'government', locale: 'en', name: 'Central District' },
      { divisionId: 'government', locale: 'zh-hant', name: '中區', nameAlts: '中環' },
    ],
    landsdRelease: 'landsd',
    overtureRelease: 'overture',
    overtureIds: new Set<string>(),
  }
  expect(attachIngredientMembership(args).matched).toBe(1)
  expect(
    attachIngredientMembership({
      ...args,
      landsdNames: [
        args.landsdNames[0]!,
        { divisionId: 'government', locale: 'zh-hant', name: '其他' },
      ],
    }).matched,
  ).toBe(0)
  expect(
    attachIngredientMembership({
      ...args,
      landsd: [
        ...args.landsd,
        {
          ...args.landsd[0]!,
          id: 'ambiguous',
          identifiers: { 'LANDSD:GEO_NAME_ID': '43' },
        },
      ],
      landsdNames: [
        ...args.landsdNames,
        ...args.landsdNames.map(row => ({ ...row, divisionId: 'ambiguous' })),
      ],
    }).matched,
  ).toBe(0)
})

test('curated source exclusions override even an explicit native identity', () => {
  const result = attachIngredientMembership({
    divisions: [
      { id: 'curated', geometry, identifiers: { 'LANDSD:GEO_NAME_ID': '42' } },
    ],
    names: labels('curated'),
    landsd: [
      {
        id: 'LANDSD:PLACE_NAME:42',
        geometry,
        identifiers: { 'LANDSD:GEO_NAME_ID': '42' },
      },
    ],
    landsdNames: labels('LANDSD:PLACE_NAME:42'),
    landsdRelease: 'landsd',
    overtureRelease: 'overture',
    overtureIds: new Set<string>(),
    excludedSourceIds: new Set(['LANDSD:PLACE_NAME:42']),
  })
  expect(result.matched).toBe(0)
  expect(result.divisions[0]!.sources.hkgovLandsd).toBeUndefined()
})

test('deleted upstream identities do not claim current Overture membership', () => {
  const result = attachIngredientMembership({
    divisions: [{ id: 'kept', geometry }],
    names: labels('kept'),
    landsd: [],
    landsdNames: [],
    landsdRelease: 'landsd-june',
    overtureIds: new Set<string>(),
    overtureRelease: 'overture-september',
  })
  expect(result.divisions[0]!.sources.overture).toBeUndefined()
})
