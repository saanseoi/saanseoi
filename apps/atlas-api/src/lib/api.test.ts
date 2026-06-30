import { describe, expect, test } from 'bun:test'

import {
  buildApiVersionMetadata,
  buildJsonApiDetailDocument,
  buildJsonApiListDocument,
  buildSnapshotNotReadyResponse,
  resolveApiMetaLocales,
} from './api'

describe('api helpers', () => {
  test('buildJsonApiListDocument builds pagination links and included resources', () => {
    const document = buildJsonApiListDocument({
      url: new URL('http://localhost/v0/divisions?page[limit]=10&page[offset]=10'),
      data: [{ id: 'division-1' }],
      included: [{ id: 'division-parent' }],
      limit: 10,
      offset: 10,
      total: 35,
      meta: {
        profile: 'default' as const,
      },
    })

    expect(document).toEqual({
      jsonapi: {
        version: '1.1',
      },
      links: {
        self: 'http://localhost/v0/divisions?page[limit]=10&page[offset]=10',
        first: 'http://localhost/v0/divisions?page%5Blimit%5D=10&page%5Boffset%5D=0',
        prev: 'http://localhost/v0/divisions?page%5Blimit%5D=10&page%5Boffset%5D=0',
        next: 'http://localhost/v0/divisions?page%5Blimit%5D=10&page%5Boffset%5D=20',
      },
      data: [{ id: 'division-1' }],
      included: [{ id: 'division-parent' }],
      meta: {
        profile: 'default',
      },
    })
  })

  test('buildJsonApiDetailDocument omits included when empty', () => {
    const document = buildJsonApiDetailDocument({
      url: new URL('http://localhost/v0/divisions/hk'),
      data: { id: 'hk' },
      included: [],
      meta: {
        profile: 'default' as const,
      },
    })

    expect(document).toEqual({
      jsonapi: {
        version: '1.1',
      },
      links: {
        self: 'http://localhost/v0/divisions/hk',
      },
      data: { id: 'hk' },
      meta: {
        profile: 'default',
      },
    })
  })

  test('resolveApiMetaLocales preserves wildcard mode', () => {
    expect(
      resolveApiMetaLocales({
        mode: 'all',
        locales: ['*'],
      }),
    ).toEqual(['*'])

    expect(
      resolveApiMetaLocales({
        mode: 'requested',
        locales: ['en', 'zh-hant'],
      }),
    ).toEqual(['en', 'zh-hant'])
  })

  test('buildApiVersionMetadata adds schema and ruleset versions only for full profile', () => {
    expect(
      buildApiVersionMetadata({
        requestedApiVersion: '0.1',
        requestedApiFamily: 'divisions',
        resolvedApiVersion: 'api-divisions-v0.1',
        apiReleaseSet: 'data-hk-divisions-2026-04-15.0-0',
        schemaVersion: 'sv-division-v1',
        rulesetVersion: 'rs-division-merge-v1',
        profile: 'default',
      }),
    ).toEqual({
      requestedApiVersion: '0.1',
      requestedApiFamily: 'divisions',
      resolvedApiVersion: 'api-divisions-v0.1',
      apiReleaseSet: 'data-hk-divisions-2026-04-15.0-0',
    })

    expect(
      buildApiVersionMetadata({
        requestedApiVersion: '0.1',
        requestedApiFamily: 'divisions',
        resolvedApiVersion: 'api-divisions-v0.1',
        apiReleaseSet: 'data-hk-divisions-2026-04-15.0-0',
        schemaVersion: 'sv-division-v1',
        rulesetVersion: 'rs-division-merge-v1',
        profile: 'full',
      }),
    ).toEqual({
      requestedApiVersion: '0.1',
      requestedApiFamily: 'divisions',
      resolvedApiVersion: 'api-divisions-v0.1',
      apiReleaseSet: 'data-hk-divisions-2026-04-15.0-0',
      schemaVersion: 'sv-division-v1',
      rulesetVersion: 'rs-division-merge-v1',
    })
  })

  test('buildSnapshotNotReadyResponse returns the standard API error shape', () => {
    expect(buildSnapshotNotReadyResponse('division')).toEqual({
      httpStatus: 503,
      error: 'snapshot_not_ready',
      message: 'No active division snapshot is published.',
    })
  })
})
