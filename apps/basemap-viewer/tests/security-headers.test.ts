import { readFile } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'

const headers = await readFile(new URL('../public/_headers', import.meta.url), 'utf8')

function header(name: string): string {
  const line = headers
    .split('\n')
    .find(value => value.trimStart().toLowerCase().startsWith(`${name.toLowerCase()}:`))
  return line?.slice(line.indexOf(':') + 1).trim() ?? ''
}

function directive(name: string): string[] {
  const value = header('Content-Security-Policy')
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(`${name} `))
  return value?.split(/\s+/).slice(1) ?? []
}

describe('production browser security headers', () => {
  test('sets the defence-in-depth headers on every static asset response', () => {
    expect(headers).toMatch(/^\/\*$/m)
    expect(header('X-Frame-Options')).toBe('DENY')
    expect(header('X-Content-Type-Options')).toBe('nosniff')
    expect(header('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(header('Permissions-Policy')).toContain('geolocation=()')
  })

  test('keeps the CSP restrictive while allowing MapLibre and application assets', () => {
    expect(directive('default-src')).toEqual(["'self'"])
    expect(directive('script-src')).toEqual([
      "'self'",
      "'sha256-VpTdu7jgVQct6zhNxs/3icc2FAmxfG6u1+0XlVnThXA='",
    ])
    expect(directive('frame-ancestors')).toEqual(["'none'"])
    expect(directive('worker-src')).toEqual(["'self'", 'blob:'])
    expect(directive('connect-src')).toEqual([
      "'self'",
      'https://tiles.saanseoi.hk',
      'https://raw.githubusercontent.com',
      'https://protomaps.github.io',
    ])
    expect(directive('img-src')).toEqual([
      "'self'",
      'data:',
      'blob:',
      'https://protomaps.github.io',
    ])
    expect(directive('style-src-elem')).toEqual([
      "'self'",
      'https://fonts.googleapis.com',
    ])
    expect(directive('font-src')).toEqual(["'self'", 'https://fonts.gstatic.com'])
    expect(directive('script-src')).not.toContain("'unsafe-inline'")
    expect(directive('script-src')).not.toContain("'unsafe-eval'")
  })
})
