import { describe, expect, test } from 'bun:test'

import { resolveOpenApiLocale } from './openapi-i18n'

describe('resolveOpenApiLocale', () => {
  test('honours an explicit locale over Accept-Language', () => {
    expect(resolveOpenApiLocale('zh-Hans', 'en-US,en;q=0.9')).toBe('zh-Hans')
  })

  test('uses the highest-weight supported Accept-Language range', () => {
    expect(resolveOpenApiLocale(undefined, 'zh-CN;q=0.9,en-US;q=0.8')).toBe('zh-Hans')
  })

  test('respects Accept-Language preference weights', () => {
    expect(resolveOpenApiLocale(undefined, 'en-US,en;q=0.9,zh-TW;q=0.8')).toBe('en')
  })

  test('does not select a language range with q=0', () => {
    expect(resolveOpenApiLocale(undefined, 'zh-TW;q=0')).toBe('en')
  })
})
