import { expect, test } from 'bun:test'
import { getTileJson } from './tilejson'

test('propagates query authentication to the advertised boundary URL', async () => {
  const tileJson = await getTileJson({
    accessToken: 'pk.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    pmtiles: {
      getTileJson: async () => ({
        tiles: ['https://tiles.saanseoi.hk/hong-kong-2026-08-13/{z}/{x}/{y}.mvt'],
      }),
    },
    origin: 'https://tiles.saanseoi.hk',
    name: 'hong-kong-2026-08-13',
  })

  expect(tileJson['saanseoi:boundary']).toBe(
    'https://tiles.saanseoi.hk/hong-kong-2026-08-13.boundary.geojson?access_token=pk.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  )
})
