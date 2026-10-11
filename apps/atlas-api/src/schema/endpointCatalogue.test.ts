import { expect, test } from 'bun:test'
import { initialApiEndpoints } from '@repo/db/registry'
import { placeRoutes } from '../routes/places/v0/places'
import { streetRoutes } from '../routes/streets/v0/streets'
import { divisionRoutes } from '../routes/divisions/v0/divisions'
import { divisionInventoriesRoute } from '../routes/divisions/v0/inventories'
import {
  divisionChangeDefinitionV02Route,
  divisionChangesV02Route,
} from '../routes/divisions/changes'
import { geocodingRoutes } from '../routes/geocoding/geocoding'

test('Places, Streets and Divisions endpoint fixtures match registered route paths and operation IDs', () => {
  for (const [version, routes] of [
    ['api-places-v0.1', placeRoutes],
    ['api-streets-v0.1', streetRoutes],
    ['api-divisions-v0.1', divisionRoutes],
    [
      'api-divisions-v0.2',
      [
        ...divisionRoutes,
        divisionChangesV02Route,
        divisionChangeDefinitionV02Route,
        divisionInventoriesRoute,
        ...geocodingRoutes.filter(({ route }) =>
          route.path.startsWith('/divisions/v0.2/'),
        ),
      ],
    ],
  ] as const) {
    const versionRoutes = routes.filter(({ route }) => {
      if (version === 'api-divisions-v0.1')
        return (
          !route.path.startsWith('/divisions/v0.2/') && route.path !== '/divisions/v0.2'
        )
      if (version === 'api-divisions-v0.2')
        return (
          route.path === '/divisions/v0.2' || route.path.startsWith('/divisions/v0.2/')
        )
      return true
    })
    const expected = versionRoutes.map(({ route }) => ({
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
