import { describe, expect, it, vi } from 'vitest'
import { ReleaseRepository } from '../src/lib/release-repository'

const region = { code: 'hk', name: 'hongkong', description: 'Hong Kong' }

describe('ReleaseRepository', () => {
  it('caches catalogue and release metadata requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = String(input)
      if (url.endsWith('/regions.json')) return Response.json({ regions: [region] })
      if (url.endsWith('/versions.json'))
        return Response.json({ versions: [{ version: '2026-01-01' }] })
      return Response.json({})
    })
    const repository = new ReleaseRepository('https://tiles.example')

    await repository.getCatalogue()
    await repository.getCatalogue()
    await repository.getReleases(region)
    await repository.getReleases(region)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    fetchMock.mockRestore()
  })

  it('checks release metadata cache by region', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = String(input)
      if (url.endsWith('/versions.json'))
        return Response.json({ versions: [{ version: '2026-01-01' }] })
      return Response.json({})
    })
    const repository = new ReleaseRepository('https://tiles.example')
    const otherRegion = { ...region, code: 'jp' }

    await repository.getReleases(region)

    expect(repository.hasCachedReleases(region.code)).toBe(true)
    expect(repository.hasCachedReleases(otherRegion.code)).toBe(false)
    fetchMock.mockRestore()
  })

  it('does not fetch a boundary advertised on another origin', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = String(input)
      if (url.endsWith('.json'))
        return Response.json({
          'saanseoi:boundary': 'https://evil.example/boundary.geojson',
        })
      throw new Error(`Unexpected request: ${url}`)
    })
    const repository = new ReleaseRepository('https://tiles.example')

    const release = await repository.getRelease(region, 'latest')

    expect(release.boundary).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fetchMock.mockRestore()
  })
})
