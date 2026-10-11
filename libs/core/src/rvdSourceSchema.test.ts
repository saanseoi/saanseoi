import { expect, test } from 'bun:test'
import { rvdSourceFields } from './rvdSourceSchema'

test('RVD definitions describe every extracted field and nested value in all supported languages', () => {
  const english = rvdSourceFields()
  expect(Object.keys(english)).toEqual([
    'areaCode',
    'districtCode',
    'includedIn',
    'kind',
    'names',
    'page',
    'rawNames',
    'tertiaryPlanningUnits',
  ])
  for (const locale of ['en', 'zh-Hant', 'zh-Hans']) {
    const fields = rvdSourceFields(locale)
    expect(Object.keys(fields)).toEqual(Object.keys(english))
    for (const [key, field] of Object.entries(fields)) {
      expect(field.description).toBeTruthy()
      expect(field.type).toBe(english[key]!.type)
      if (locale !== 'en') expect(field.description).not.toBe(english[key]!.description)
    }
    expect(fields.kind!.enum).toEqual([
      'area',
      'district',
      'subdistrict',
      'included-locality',
    ])
    expect(fields.names!.properties!['zh-hant']!.description).toBeTruthy()
    expect(fields.rawNames!.properties!.en!.description).toBeTruthy()
    expect(fields.tertiaryPlanningUnits!.items!.type).toBe('string')
  }
  expect(english.areaCode!.description).toContain('Not a publisher-assigned identifier')
  expect(english.rawNames!.description).toContain('spacing repairs')
})
