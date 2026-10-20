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
