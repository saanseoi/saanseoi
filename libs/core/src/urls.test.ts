import { describe, expect, test } from 'bun:test'

import { normaliseBaseUrl, resolveAtlasBaseUrl, resolveHarbourBaseUrl } from './urls'

describe('urls', () => {
  test('normalises trailing slashes from base URLs', () => {
    expect(normaliseBaseUrl(' https://harbour.saanseoi.hk/// ')).toBe(
      'https://harbour.saanseoi.hk',
    )
  })

  test('resolves default Harbour base URLs by environment', () => {
    expect(resolveHarbourBaseUrl('dev')).toBe('http://localhost:8788')
    expect(resolveHarbourBaseUrl('preview')).toBe('https://preview.harbour.saanseoi.hk')
    expect(resolveHarbourBaseUrl('production')).toBe('https://harbour.saanseoi.hk')
  })

  test('resolves default Atlas base URLs by environment', () => {
    expect(resolveAtlasBaseUrl('dev')).toBe('http://localhost:8787')
    expect(resolveAtlasBaseUrl('preview')).toBe('https://preview.api.saanseoi.hk')
    expect(resolveAtlasBaseUrl('production')).toBe('https://api.saanseoi.hk')
  })

  test('exposes normalised canonical Harbour URLs through the environment mapping', () => {
    expect(normaliseBaseUrl(resolveHarbourBaseUrl('dev'))).toBe('http://localhost:8788')
    expect(normaliseBaseUrl(resolveHarbourBaseUrl('preview'))).toBe(
      'https://preview.harbour.saanseoi.hk',
    )
    expect(normaliseBaseUrl(resolveHarbourBaseUrl('production'))).toBe(
      'https://harbour.saanseoi.hk',
    )
  })
})
