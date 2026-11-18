import { expect, test } from 'bun:test'
import { GeocodingQuerySchema } from './geocoding'

test('exactly one named coordinate pair or forward input', () => {
  for (const input of [
    {},
    { lat: '22' },
    { lng: '114' },
    { lat: '', lng: '114' },
    { lat: 'NaN', lng: '114' },
    { lat: '91', lng: '114' },
    { lat: '22', lng: '181' },
    { lat: '22', lng: '114', address: 'a' },
    { address: 'a', placename: 'b' },
    { address: ' ' },
    { address: 'a', x: '1' },
    { placename: 'a', apiReleaseSet: 'old' },
  ])
    expect(GeocodingQuerySchema.safeParse(input).success).toBe(false)
  expect(GeocodingQuerySchema.parse({ lat: '0', lng: '0' })).toMatchObject({
    lat: 0,
    lng: 0,
  })
  expect(GeocodingQuerySchema.safeParse({ address: 'a' }).success).toBe(true)
  expect(
    GeocodingQuerySchema.safeParse({ placename: 'a', releaseSet: 'old' }).success,
  ).toBe(true)
})

test('locales reuse the canonical API locale grammar', () => {
  expect(
    GeocodingQuerySchema.parse({ address: 'a', locales: 'zh_Hant, en,zh-hant' })
      .locales,
  ).toBe('zh-hant,en')
  expect(GeocodingQuerySchema.parse({ address: 'a', locales: 'null' }).locales).toBe(
    'null',
  )
  expect(
    GeocodingQuerySchema.safeParse({ address: 'a', locales: '*,en' }).success,
  ).toBe(false)
})

test('lazy cursors require a forward address search and a valid opaque token', () => {
  for (const input of [
    { address: 'wood', cursor: 'a'.repeat(32) + '.20' },
    { placename: 'wood', paginate: 'true' },
    { lat: '22', lng: '114', paginate: 'true' },
    { address: 'wood', paginate: 'true', cursor: '20' },
  ])
    expect(GeocodingQuerySchema.safeParse(input).success).toBe(false)
  expect(
    GeocodingQuerySchema.safeParse({
      address: 'wood',
      paginate: 'true',
      locatedOnly: 'true',
      cursor: 'a'.repeat(32) + '.20',
    }).success,
  ).toBe(true)
})
