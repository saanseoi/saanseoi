import { describe, expect, test } from 'bun:test'

import {
  defaultApiLocalesByProfile,
  getRequestedApiLocalesValidationError,
  isApiLocale,
  isValidRequestedApiLocales,
  parseRequestedApiLocales,
} from './apiLocales'

describe('api-locales', () => {
  test('accepts only contract API locales', () => {
    expect(isApiLocale('en')).toBe(true)
    expect(isApiLocale('zh-hant')).toBe(true)
    expect(isApiLocale('zh-hans')).toBe(true)
    expect(isApiLocale('zhHant')).toBe(false)
    expect(isApiLocale('fr')).toBe(false)
  })

  test('validates requested locale query values structurally', () => {
    expect(isValidRequestedApiLocales('en,zh-hant')).toBe(true)
    expect(isValidRequestedApiLocales('EN,ZH_HANT')).toBe(true)
    expect(isValidRequestedApiLocales('*')).toBe(true)
    expect(isValidRequestedApiLocales('null')).toBe(true)
    expect(isValidRequestedApiLocales('fr')).toBe(true)
    expect(isValidRequestedApiLocales('fr-ca')).toBe(true)
    expect(isValidRequestedApiLocales('zh-hant-hk')).toBe(true)
    expect(isValidRequestedApiLocales('en,*')).toBe(false)
    expect(isValidRequestedApiLocales('en,null')).toBe(false)
    expect(isValidRequestedApiLocales('abcd')).toBe(false)
    expect(isValidRequestedApiLocales('en-us-ca')).toBe(false)
  })

  test('returns helpful locale validation errors', () => {
    expect(getRequestedApiLocalesValidationError('en,zh-hk-extra-piece')).toContain(
      'invalid locale "zh-hk-extra-piece"',
    )
  })

  test('parses requested locale lists, wildcard, null, and defaults', () => {
    expect(
      parseRequestedApiLocales('ZH_HANT,en,fr-ca', {
        mode: 'requested',
        locales: defaultApiLocalesByProfile.default,
      }),
    ).toEqual({
      mode: 'requested',
      locales: ['zh-hant', 'en', 'fr-ca'],
    })
    expect(
      parseRequestedApiLocales('*', {
        mode: 'requested',
        locales: defaultApiLocalesByProfile.default,
      }),
    ).toEqual({
      mode: 'all',
      locales: ['*'],
    })
    expect(
      parseRequestedApiLocales('null', {
        mode: 'all',
        locales: ['*'],
      }),
    ).toEqual({
      mode: 'none',
      locales: [],
    })
    expect(
      parseRequestedApiLocales(undefined, {
        mode: 'requested',
        locales: defaultApiLocalesByProfile.map,
      }),
    ).toEqual({
      mode: 'requested',
      locales: ['en', 'zh-hant'],
    })
  })

  test('rejects malformed locale query values that fail validation', () => {
    expect(() =>
      parseRequestedApiLocales('', {
        mode: 'requested',
        locales: defaultApiLocalesByProfile.default,
      }),
    ).toThrow()
    expect(() =>
      parseRequestedApiLocales('*,en', {
        mode: 'requested',
        locales: defaultApiLocalesByProfile.default,
      }),
    ).toThrow()
  })
})
