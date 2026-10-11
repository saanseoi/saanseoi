import { expect, test } from 'bun:test'
import { landsdPlaceNameSourceFields } from './landsdPlaceNameSourceSchema'

test('all schema levels have localised descriptions with the same field contract', () => {
  const english = landsdPlaceNameSourceFields()
  for (const locale of ['zh-Hant', 'zh-Hans']) {
    const fields = landsdPlaceNameSourceFields(locale)
    expect(Object.keys(fields)).toEqual(Object.keys(english))
    for (const key of Object.keys(fields)) {
      expect(fields[key]!.description).not.toBe(english[key]!.description)
      expect(fields[key]!.type).toBe(english[key]!.type)
    }
    const names = fields.placeNames!.items!
    expect(names.required).toEqual(['nameEn', 'nameZhHant', 'nameStatus'])
    expect(names.properties!.nameZhHant!.nullable).toBe(true)
    expect(names.properties!.nameStatus!.enum).toEqual(['Official', 'Alias'])
    expect(names.description).not.toBe(english.placeNames!.items!.description)
  }
})
