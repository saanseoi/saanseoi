import { expect, test } from 'bun:test'
import { parseAddressContent } from './src/parse'
import { AddressContentSchema } from './src/content'
test('shared parser preserves original evidence and produces valid separate floor/unit content', () => {
  const source = { en: 'Shop 18, G/F, Smithfield Court, 43 Smithfield' }
  const result = parseAddressContent(source)
  expect(result.source).toEqual(source)
  expect(AddressContentSchema.safeParse(result.content).success).toBe(true)
  expect(result.content.unit).toMatchObject({
    unitType: 'S',
    unitRef: '18',
    floorType: 'G',
  })
  expect(result.content.i18n.en?.formattedAddress).not.toContain('Shop 18')
  expect(result.unresolved.en).toContain('SMITHFIELD')
})

test('ambiguous units in any locale block unit selection for every locale', () => {
  const source = {
    en: 'Shop 18, Shop 19, G/F, Example Road',
    'zh-hant': '地下18舖例子道',
  }
  const parsed = parseAddressContent(source)
  expect(parsed.content.unit).toBeNull()
  expect(parsed.content.i18n.en.formattedAddress).toBe(source.en)
})

for (const [expression, floorType, floorRef] of [
  ['G/F', 'G', ''], ['UG/F', 'UG', ''], ['LG/F', 'LG', ''],
  ['B/F', 'B', ''], ['B2/F', 'B', '2'], ['P2/F', 'P', '2'],
  ['M/F', 'M', ''], ['12/F', 'F', '12'], ['地下', 'G', ''],
]) {
  test(`canonical floor reference excludes type for ${expression}`, () => {
    const parsed = parseAddressContent({ en: expression! })
    expect(parsed.content.unit).toMatchObject({ floorType, floorRef })
    expect(parsed.content.unitI18n.en?.floorExpression).toBe(expression)
  })
}

test('ground floor evidence agrees across languages', () => {
  expect(parseAddressContent({ en: 'G/F', 'zh-hant': '地下' }).content.unit)
    .toMatchObject({ floorType: 'G', floorRef: '' })
})
