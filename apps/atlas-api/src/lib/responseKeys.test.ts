import { expect, test } from 'bun:test'
import { usesCanonicalResponseKeys, isJsonContentType } from './responseKeys'

test('enforces naming across every canonical family and nested endpoint', () => {
  for (const family of ['addresses', 'divisions', 'places', 'stats', 'streets']) {
    for (const version of ['v0', 'v0.1', 'v0.2', 'v1']) {
      for (const suffix of [
        '',
        '/id',
        '/geocode',
        '/id/units',
        '/changes/definitions/id',
        '/search',
        '/registry',
      ]) {
        expect(usesCanonicalResponseKeys(`/${family}/${version}${suffix}`)).toBe(true)
      }
      for (const suffix of [
        '/sources',
        '/sources/changes',
        '/source-schema',
        '/source-releases',
        '/openapi.json',
      ]) {
        expect(usesCanonicalResponseKeys(`/${family}/${version}${suffix}`)).toBe(false)
      }
    }
  }
  expect(usesCanonicalResponseKeys('/v0.1/styles/hk/1.0.0.json')).toBe(false)
})

test('includes JSON:API geocoding and excludes streamed source downloads', () => {
  expect(isJsonContentType('application/vnd.api+json')).toBe(true)
  expect(isJsonContentType('application/json; charset=UTF-8')).toBe(true)
  expect(isJsonContentType('application/x-ndjson')).toBe(false)
  expect(isJsonContentType(null)).toBe(false)
})
