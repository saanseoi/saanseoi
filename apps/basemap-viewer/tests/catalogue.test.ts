import { describe, expect, it } from 'vitest'
import { parseCatalogue, parseVersions, tilejsonUrl } from '../src/lib/catalogue'
import { parseTilejson } from '../src/lib/tilejson'
import { parseReleaseMetadata } from '../src/lib/release-metadata'

describe('catalogue parsing', () => {
  it('keeps only safe published regions and versions', () => {
    expect(
      parseCatalogue({
        regions: [
          { code: 'hk', name: 'hongkong', description: 'Hong Kong' },
          { code: 'BAD!', name: 'not-valid' },
        ],
      }).regions,
    ).toEqual([
      { code: 'hk', name: 'hongkong', description: 'Hong Kong', label: 'Hong Kong' },
    ])
    expect(
      parseVersions({
        versions: [
          { version: '2025-04-25' },
          { version: '2026-03-18' },
          { version: 'oops' },
        ],
      }).versions,
    ).toEqual(['2026-03-18', '2025-04-25'])
  })

  it('builds TileJSON URLs from the public name, not the R2 key', () => {
    expect(
      tilejsonUrl(
        'https://tiles.example/',
        { code: 'hk', name: 'hongkong', description: 'Hong Kong' },
        '2026-03-18',
      ),
    ).toBe('https://tiles.example/hongkong-2026-03-18.json')
    expect(
      tilejsonUrl(
        'https://tiles.example',
        { code: 'hk', name: 'hongkong', description: 'Hong Kong' },
        'latest',
      ),
    ).toBe('https://tiles.example/hongkong-latest.json')
  })
})

it('reads the canonical boundary URL advertised by a release', () => {
  expect(
    parseTilejson({
      'saanseoi:boundary': 'https://tiles.example/hongkong-latest.boundary.geojson',
    }).boundary,
  ).toBe('https://tiles.example/hongkong-latest.boundary.geojson')
  expect(
    parseTilejson({ 'saanseoi:boundary': 'javascript:alert(1)' }).boundary,
  ).toBeNull()
})

it('retains TileJSON diagnostics and immutable release metadata', () => {
  expect(
    parseTilejson({
      minzoom: 0,
      maxzoom: 15,
      tiles: ['https://tiles.example/hongkong/{z}/{x}/{y}.mvt', 'javascript:alert(1)'],
      vector_layers: [{ id: 'roads' }, { id: 'water' }, { broken: true }],
    }),
  ).toMatchObject({
    minZoom: 0,
    maxZoom: 15,
    vectorLayers: ['roads', 'water'],
  })
  expect(
    parseReleaseMetadata({
      versions: [
        {
          version: '2026-07-31',
          sha256: 'abc',
          size: 300,
          createdAt: '2026-07-31T04:06:16.553Z',
        },
      ],
    }),
  ).toEqual([
    {
      version: '2026-07-31',
      sha256: 'abc',
      size: 300,
      createdAt: '2026-07-31T04:06:16.553Z',
    },
  ])
})
