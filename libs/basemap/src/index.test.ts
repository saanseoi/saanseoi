import { describe, expect, it } from 'vitest'

import {
  boundary_name,
  boundary_path,
  hktReleaseDate,
  metadata_path,
  parseCatalogue,
  pmtiles_path,
  tilejsonUrl,
} from './index'

describe('basemap contract', () => {
  it('parses published regions and resolves their public artefacts', () => {
    const catalogue = parseCatalogue({
      regions: [{ code: 'hk', name: 'hongkong', description: 'Hong Kong' }],
    })
    expect(pmtiles_path('hongkong-2026-07-31', catalogue.regions)).toBe(
      'basemap/hk/hongkong-2026-07-31.pmtiles',
    )
    expect(boundary_path('hongkong-latest', catalogue.regions)).toBe(
      'basemap/hk/hongkong-latest.boundary.geojson',
    )
    expect(metadata_path('/hk/versions.json')).toBe('basemap/hk/versions.json')
    const region = catalogue.regions[0]
    if (!region) throw new Error('Expected a published region.')
    expect(tilejsonUrl('https://tiles.example/', region, 'latest')).toBe(
      'https://tiles.example/hongkong-latest.json',
    )
  })

  it('resolves release-boundary paths', () => {
    expect(boundary_name('/hongkong-latest.boundary.geojson')).toBe('hongkong-latest')
  })

  it('uses the Hong Kong civil day for release versions', () => {
    expect(hktReleaseDate(new Date('2026-07-31T16:30:00.000Z'))).toBe('2026-08-01')
  })
})
