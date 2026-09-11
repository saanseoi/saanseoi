import { expect, test } from 'bun:test'
import { initialApiEndpoints } from '@repo/db/registry'
import { placeRoutes } from '../routes/places/v0/places'
import { streetRoutes } from '../routes/streets/v0/streets'

test('Places and Streets endpoint fixtures match registered route paths and operation IDs', () => {
  for (const [version, routes] of [
    ['api-places-v0.1', placeRoutes],
    ['api-streets-v0.1', streetRoutes],
  ] as const) {
    const expected = routes.map(({ route }) => ({
      method: route.method.toUpperCase(),
      path: route.path,
      operationId: route.operationId,
    }))
    const actual = initialApiEndpoints
      .filter(endpoint => endpoint.apiVersion === version)
      .map(({ method, path, operationId }) => ({ method, path, operationId }))
    const sort = (
      items: Array<{ method: string; path: string; operationId: string }>,
    ) => items.sort((a, b) => a.path.localeCompare(b.path))
    expect(sort(actual)).toEqual(sort(expected))
  }
})
