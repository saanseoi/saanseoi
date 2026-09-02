import { describe, expect, test } from 'bun:test'

import { createMapIframeCode, normalisePublishedMapUrl } from './createAMapEmbed'

describe('normalisePublishedMapUrl', () => {
  test('accepts only an absolute HTTPS URL', () => {
    expect(normalisePublishedMapUrl(' https://maps.example/map ')).toBe(
      'https://maps.example/map',
    )
    expect(normalisePublishedMapUrl('http://maps.example/map')).toBeUndefined()
    expect(normalisePublishedMapUrl('/map')).toBeUndefined()
  })
})

describe('createMapIframeCode', () => {
  test('creates a responsive, accessible, lazy iframe with fullscreen permission', () => {
    expect(
      createMapIframeCode({
        height: { mode: 'fixed', pixels: 640 },
        title: 'Population & housing "map"',
        url: 'https://maps.example/map',
      }),
    ).toContain(`title="Population &amp; housing &quot;map&quot;"`)
    expect(
      createMapIframeCode({
        height: { mode: 'fixed', pixels: 640 },
        title: '',
        url: '',
      }),
    ).toContain('height="640"')
    expect(
      createMapIframeCode({
        height: { mode: 'fixed', pixels: 640 },
        title: '',
        url: '',
      }),
    ).toContain('loading="lazy"')
    expect(
      createMapIframeCode({
        height: { mode: 'fixed', pixels: 640 },
        title: '',
        url: '',
      }),
    ).toContain('allow="fullscreen"')
  })

  test('fills a parent with an explicit height when requested', () => {
    const code = createMapIframeCode({
      height: { mode: 'fill' },
      title: 'Map',
      url: 'https://maps.example/',
    })

    expect(code).not.toContain('\n  height="')
    expect(code).toContain('height: 100%')
  })
})
