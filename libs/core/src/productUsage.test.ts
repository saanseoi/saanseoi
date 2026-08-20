import { describe, expect, test } from 'bun:test'
import {
  recordProductUsage,
  toProductUsageDataPoint,
  normaliseProductUsageRoute,
} from './productUsage'

describe('product usage contract', () => {
  test('allowlists events and sanitises routes and identifiers', () => {
    const point = toProductUsageDataPoint({
      event: 'client.download_click',
      producer: 'atlas-client',
      surface: 'api_release',
      route: 'https://saanseoi.hk/apis/places/v1?token=secret',
      entityType: 'asset',
      entityId: 'asset-123',
      entityId2: 'name@example.com',
      outcome: 'success',
      httpStatus: 200,
    })

    expect(point).toMatchObject({
      indexes: ['client.download_click', 'api_release'],
      blobs: [
        'v1',
        'client.download_click',
        'atlas-client',
        'api_release',
        '/apis/places/v1',
        'asset',
        'asset-123',
        '',
        'success',
        '200',
      ],
    })
    expect(JSON.stringify(point)).not.toContain('secret')
    expect(JSON.stringify(point)).not.toContain('example.com')
  })

  test('rejects an event outside the allowlist', () => {
    expect(
      toProductUsageDataPoint({
        event: 'not-an-event' as never,
        producer: 'atlas-client',
        surface: 'api_release',
        route: '/apis/example',
        outcome: 'success',
      }),
    ).toBeNull()
  })

  test('normalises route parameters and query strings', () => {
    expect(
      normaliseProductUsageRoute(
        '/v0/assets/00000000-0000-4000-8000-000000000001?download=1',
      ),
    ).toBe('/v0/assets/:id')
  })

  test('fails open when the Analytics Engine binding is missing or throws', () => {
    expect(() =>
      recordProductUsage(undefined, {
        event: 'api.request',
        producer: 'atlas-api',
        surface: 'api',
        route: '/v0/places',
        outcome: 'success',
      }),
    ).not.toThrow()
    expect(() =>
      recordProductUsage(
        {
          writeDataPoint: () => {
            throw new Error('offline')
          },
        },
        {
          event: 'api.request',
          producer: 'atlas-api',
          surface: 'api',
          route: '/v0/places',
          outcome: 'success',
        },
      ),
    ).not.toThrow()
  })

  test('keeps API and source release contexts distinct', () => {
    const makePoint = (surface: 'api_release' | 'source_release') =>
      toProductUsageDataPoint({
        event: 'client.download_click',
        producer: 'atlas-client',
        surface,
        route: '/apis/places/1.0.0',
        entityType: 'asset',
        entityId: 'asset-1',
        outcome: 'success',
      })

    expect(makePoint('api_release')?.blobs[3]).toBe('api_release')
    expect(makePoint('source_release')?.blobs[3]).toBe('source_release')
  })

  test('uses shared context surfaces for guide, sources, and release interactions', () => {
    expect(
      toProductUsageDataPoint({
        event: 'guide.milestone',
        producer: 'atlas-client',
        surface: 'guide',
        route: '/guides/create-a-map',
        entityType: 'action',
        entityId: 'data_ready',
        outcome: 'success',
      })?.blobs[3],
    ).toBe('guide')
    expect(
      toProductUsageDataPoint({
        event: 'client.source_flow_expand',
        producer: 'atlas-client',
        surface: 'sources',
        route: '/sources',
        entityType: 'action',
        entityId: 'expand_all',
        outcome: 'success',
      })?.blobs[3],
    ).toBe('sources')
    expect(
      toProductUsageDataPoint({
        event: 'client.release_tab_view',
        producer: 'atlas-client',
        surface: 'api_release',
        route: '/apis/divisions/release',
        entityType: 'tab',
        entityId: 'assembly',
        outcome: 'success',
      })?.blobs[3],
    ).toBe('api_release')
  })
})
