import { describe, expect, test } from 'bun:test'

import { normaliseExternalUrl } from './externalUrl'

describe('normaliseExternalUrl', () => {
  test('normalises absolute HTTP URLs', () => {
    expect(normaliseExternalUrl('https://example.com/docs')).toBe(
      'https://example.com/docs',
    )
    expect(normaliseExternalUrl('http://example.com')).toBe('http://example.com/')
  })

  test('rejects executable, relative, and malformed URLs', () => {
    expect(normaliseExternalUrl('javascript:alert(1)')).toBeUndefined()
    expect(normaliseExternalUrl('data:text/html,hello')).toBeUndefined()
    expect(normaliseExternalUrl('//example.com/docs')).toBeUndefined()
    expect(normaliseExternalUrl('/docs')).toBeUndefined()
    expect(normaliseExternalUrl('not a URL')).toBeUndefined()
  })
})
