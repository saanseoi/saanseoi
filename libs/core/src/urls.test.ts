import { describe, expect, test } from 'bun:test'

import { normalizeBaseUrl, resolveHarbourBaseUrl } from './urls'

describe('urls', () => {
  test('normalizes trailing slashes from base URLs', () => {
    expect(normalizeBaseUrl(' https://harbour.saanseoi.hk/// ')).toBe(
      'https://harbour.saanseoi.hk',
    )
  })

  test('resolves default Harbour base URLs by environment', () => {
    expect(resolveHarbourBaseUrl('dev')).toBe('http://localhost:8788')
    expect(resolveHarbourBaseUrl('preview')).toBe('https://preview.harbour.saanseoi.hk')
    expect(resolveHarbourBaseUrl('production')).toBe('https://harbour.saanseoi.hk')
  })

  test('exposes normalized canonical Harbour URLs through the environment mapping', () => {
    expect(normalizeBaseUrl(resolveHarbourBaseUrl('dev'))).toBe('http://localhost:8788')
    expect(normalizeBaseUrl(resolveHarbourBaseUrl('preview'))).toBe(
      'https://preview.harbour.saanseoi.hk',
    )
    expect(normalizeBaseUrl(resolveHarbourBaseUrl('production'))).toBe(
      'https://harbour.saanseoi.hk',
    )
  })
})
