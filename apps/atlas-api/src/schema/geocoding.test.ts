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
  ])
    expect(GeocodingQuerySchema.safeParse(input).success).toBe(false)
  expect(GeocodingQuerySchema.parse({ lat: '0', lng: '0' })).toMatchObject({
    lat: 0,
    lng: 0,
  })
  expect(GeocodingQuerySchema.safeParse({ address: 'a' }).success).toBe(true)
  expect(
    GeocodingQuerySchema.safeParse({ placename: 'a', apiReleaseSet: 'old' }).success,
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
