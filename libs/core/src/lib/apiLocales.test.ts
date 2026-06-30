import { describe, expect, test } from 'bun:test'

import {
  defaultApiLocalesByProfile,
  isApiLocale,
  isValidRequestedApiLocales,
  parseRequestedApiLocales,
} from './apiLocales'

describe('api-locales', () => {
  test('accepts only contract API locales', () => {
    expect(isApiLocale('en')).toBe(true)
    expect(isApiLocale('zhHant')).toBe(true)
    expect(isApiLocale('zhHans')).toBe(true)
    expect(isApiLocale('zh-hk')).toBe(false)
    expect(isApiLocale('fr')).toBe(false)
  })

  test('validates requested locale query values strictly', () => {
    expect(isValidRequestedApiLocales('en,zhHant')).toBe(true)
    expect(isValidRequestedApiLocales('none')).toBe(true)
    expect(isValidRequestedApiLocales('zh-hk')).toBe(false)
    expect(isValidRequestedApiLocales('en,fr')).toBe(false)
  })

  test('parses requested locale lists and supports none', () => {
    expect(
      parseRequestedApiLocales('zhHant,en', defaultApiLocalesByProfile.default),
    ).toEqual(['zhHant', 'en'])
    expect(parseRequestedApiLocales('none', defaultApiLocalesByProfile.full)).toEqual(
      [],
    )
    expect(parseRequestedApiLocales(undefined, defaultApiLocalesByProfile.map)).toEqual(
      ['en', 'zhHant'],
    )
  })
})
