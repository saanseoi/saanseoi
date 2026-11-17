import { describe, expect, test } from 'bun:test'
import { hk80ToHkgeocode, hkgeocodeCellOrigin } from '../src/index.js'
import { wgs84ToHkgcode } from '../src/wgs84.js'

describe('HKGeoCode official reference examples', () => {
  test('encodes all precisions from the API manual and Sharp Peak reference', () => {
    expect(hk80ToHkgeocode(839515.959, 817041.289)).toBe('K8FA38')
    expect(hk80ToHkgeocode(839515.959, 817041.289, 4)).toBe('K8FA')
    expect(hk80ToHkgeocode(839515.959, 817041.289, 2)).toBe('K8')
    expect(hk80ToHkgeocode(856793.009, 832366.405)).toBe('WG73JD')
    expect(hkgeocodeCellOrigin('K8FA3B')).toEqual({
      easting: 839515,
      northing: 817055,
      cellSize: 5,
    })
  })

  test('matches three live official ITRF96 API examples captured 2026-11-17', () => {
    expect(wgs84ToHkgcode([114.20839, 22.29241])).toBe('K8FA3B')
    expect(wgs84ToHkgcode([114.1696, 22.2936])).toBe('H8FB3H')
    expect(wgs84ToHkgcode([114.1589, 22.2819])).toBe('H74J3J')
  })

  test('replays every captured API code and range rejection', async () => {
    const evidence = await Bun.file(
      new URL('./fixtures/api-comparison.json', import.meta.url),
    ).json()
    let checked = 0
    for (const capture of evidence.captures) {
      const length = (Number(capture.request.outUnit.slice(1)) * 2) as 2 | 4 | 6
      const inputs = new Map(
        capture.request.requests.map((input: { id: string }) => [input.id, input]),
      )
      for (const result of capture.response.result) {
        const input =
          inputs.get(result.id) ??
          (capture.request.requests.length === 1
            ? capture.request.requests[0]
            : undefined)
        expect(input).toBeDefined()
        const convert = () =>
          capture.request.inCs === 'GEOG'
            ? wgs84ToHkgcode([input.long, input.lat], length)
            : hk80ToHkgeocode(input.e, input.n, length)
        if (result.error) {
          expect(result.error).toBe('101')
          expect(convert).toThrow()
        } else expect(convert()).toBe(result.code)
        checked++
      }
    }
    expect(checked).toBe(
      evidence.summary.reduce(
        (total: number, row: { total: number }) => total + row.total,
        0,
      ),
    )
  })

  test('uses half-open cells and the published coverage limits', () => {
    expect(hk80ToHkgeocode(800000, 800000)).toBe('000000')
    expect(hk80ToHkgeocode(800004.9999, 800004.9999)).toBe('000000')
    expect(hk80ToHkgeocode(800005, 800005)).toBe('000011')
    expect(hk80ToHkgeocode(863999.9999, 847999.9999)).toBe('ZQKKKK')
    for (const [e, n] of [
      [864000, 800000],
      [800000, 848000],
      [799999, 800000],
      [NaN, 810000],
      [810000, Infinity],
    ])
      expect(() => hk80ToHkgeocode(e, n)).toThrow()
  })

  test('rejects impossible cells, invalid lengths, and distant coordinates', () => {
    for (const code of ['', '0', '000', 'ZZ', '00M0', '0000M0', 'IIIIII'])
      expect(() => hkgeocodeCellOrigin(code)).toThrow()
    expect(() => hk80ToHkgeocode(810000, 810000, 3 as 6)).toThrow()
    expect(() => wgs84ToHkgcode([0, 0])).toThrow()
    expect(() => wgs84ToHkgcode([NaN, 22])).toThrow()
    expect(hkgeocodeCellOrigin(' k8fa3b ')).toEqual(hkgeocodeCellOrigin('K8FA3B'))
  })

  test('round trips every region and representative subcells at each precision', () => {
    for (let x = 0; x < 32; x++) {
      for (let y = 0; y < 24; y++) {
        for (const length of [2, 4, 6] as const) {
          const e = 800000 + x * 2000 + 1997.5
          const n = 800000 + y * 2000 + 997.5
          const code = hk80ToHkgeocode(e, n, length)
          const cell = hkgeocodeCellOrigin(code)
          expect(e).toBeGreaterThanOrEqual(cell.easting)
          expect(e).toBeLessThan(cell.easting + cell.cellSize)
          expect(n).toBeGreaterThanOrEqual(cell.northing)
          expect(n).toBeLessThan(cell.northing + cell.cellSize)
          expect(
            hk80ToHkgeocode(
              cell.easting + cell.cellSize / 2,
              cell.northing + cell.cellSize / 2,
              length,
            ),
          ).toBe(code)
        }
      }
    }
  })
})
