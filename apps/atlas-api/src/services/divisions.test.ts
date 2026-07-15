import { beforeEach, describe, expect, mock, test } from 'bun:test'

import type { DivisionRecord } from '../db/divisions'

const activeSnapshot = {
  snapshotId: 'snapshot-hk-division',
  apiReleaseSet: 'data-hk-divisions-2026-06-17.0',
  schemaVersion: 'sv-division-v1',
  rulesetVersion: 'rs-division-merge-v1',
}

const hierarchyWithNames = [
  {
    division_id: 'division-country-cn',
    subtype: 'country',
    name: '中国',
  },
  {
    division_id: 'division-hk-sar',
    subtype: 'dependency',
    name: 'Hong Kong SAR',
  },
  {
    division_id: 'division-east',
    subtype: 'region',
    name: '東區 Eastern District',
  },
  {
    division_id: 'division-a-kung-ngam',
    subtype: 'locality',
    name: '阿公岩 A Kung Ngam',
  },
]

const normalizedHierarchy = [
  {
    division_id: 'division-hk-sar',
    i18n: {
      en: {
        name: 'Hong Kong SAR',
      },
      'zh-hant': {
        name: '香港特別行政區',
      },
    },
    level: 0,
    type: 'sar',
  },
  {
    division_id: 'division-east',
    i18n: {
      en: {
        name: 'Eastern District',
      },
      'zh-hant': {
        name: '東區',
      },
    },
    level: 2,
    type: 'district',
  },
]

const baseRecord: DivisionRecord = {
  division: {
    snapshotId: activeSnapshot.snapshotId,
    id: 'division-a-kung-ngam',
    level: 3,
    type: 'locality',
    geometry: {
      type: 'Point',
      coordinates: [114.2262, 22.2788],
    },
    bbox: [114.22, 22.27, 114.23, 22.28],
    sourceKeys: {
      overture: {
        subtype: 'locality',
        class: 'locality',
        version: 7,
        hierarchies: hierarchyWithNames,
      },
    },
    subtype: 'locality',
    class: 'locality',
    overtureFeatureVersion: 7,
    overtureAdminLevel: null,
    overtureHierarchies: hierarchyWithNames,
    wikidata: 'Q123456',
    hierarchy: normalizedHierarchy,
    cartography: {
      kind: 'label-center',
    },
    sources: {
      overture: [
        {
          property: '/properties/id',
          dataset: 'overture',
          record_id: 'ovt-division-a-kung-ngam',
        },
      ],
    },
    createdAt: '2026-06-17T00:00:00.000Z',
    updatedAt: '2026-06-18T00:00:00.000Z',
  },
  i18n: {
    en: {
      name: 'A Kung Ngam',
      nameVariant: ['A Kung Ngam'],
      nameAlts: ['A Kung-Ngam'],
      nameRules: [{ value: 'A Kung-Ngam', variant: 'alternate' }],
    },
    'zh-hant': {
      name: '阿公岩',
      nameVariant: ['阿公岩', '阿公岩 A Kung Ngam'],
      nameAlts: ['阿公岩 A Kung Ngam'],
      nameRules: [{ value: '阿公岩 A Kung Ngam', variant: 'alternate' }],
    },
  },
}

const includedRecordsById: Record<string, DivisionRecord> = {
  'division-country-cn': {
    division: {
      snapshotId: activeSnapshot.snapshotId,
      id: 'division-country-cn',
      level: 0,
      type: 'country',
      geometry: null,
      bbox: null,
      sourceKeys: {
        overture: {
          subtype: 'country',
          class: 'country',
          admin_level: 1,
        },
      },
      subtype: 'country',
      class: 'country',
      overtureFeatureVersion: null,
      overtureAdminLevel: 1,
      overtureHierarchies: undefined,
      wikidata: null,
      hierarchy: [{ ids: ['division-country-cn'] }],
      cartography: null,
      sources: null,
      createdAt: '2026-06-17T00:00:00.000Z',
      updatedAt: '2026-06-18T00:00:00.000Z',
    },
    i18n: {
      'zh-hant': {
        name: '中國',
      },
    },
  },
  'division-hk-sar': {
    division: {
      snapshotId: activeSnapshot.snapshotId,
      id: 'division-hk-sar',
      level: 0,
      type: 'sar',
      geometry: null,
      bbox: null,
      sourceKeys: {
        overture: {
          subtype: 'dependency',
          class: 'dependency',
          admin_level: 1,
        },
      },
      subtype: 'dependency',
      class: 'dependency',
      overtureFeatureVersion: null,
      overtureAdminLevel: 1,
      overtureHierarchies: undefined,
      wikidata: null,
      hierarchy: [{ ids: ['division-country-cn', 'division-hk-sar'] }],
      cartography: null,
      sources: null,
      createdAt: '2026-06-17T00:00:00.000Z',
      updatedAt: '2026-06-18T00:00:00.000Z',
    },
    i18n: {
      en: {
        name: 'Hong Kong SAR',
      },
    },
  },
  'division-east': {
    division: {
      snapshotId: activeSnapshot.snapshotId,
      id: 'division-east',
      level: 2,
      type: 'district',
      geometry: null,
      bbox: null,
      sourceKeys: {
        overture: {
          subtype: 'region',
          class: 'region',
          admin_level: 2,
        },
      },
      subtype: 'region',
      class: 'region',
      overtureFeatureVersion: null,
      overtureAdminLevel: 2,
      overtureHierarchies: undefined,
      wikidata: null,
      hierarchy: [{ ids: ['division-country-cn', 'division-hk-sar', 'division-east'] }],
      cartography: null,
      sources: null,
      createdAt: '2026-06-17T00:00:00.000Z',
      updatedAt: '2026-06-18T00:00:00.000Z',
    },
    i18n: {
      'zh-hant': {
        name: '東區',
      },
    },
  },
}

let listRecords: DivisionRecord[] = [baseRecord]
let detailRecord: DivisionRecord | null = baseRecord

mock.module('@repo/core/db/metaRegistry', () => ({
  resolveActiveSnapshotForType: mock(async () => activeSnapshot),
}))

mock.module('../db/divisions', () => ({
  countDivisionsCurrent: mock(async () => listRecords.length),
  getDivisionRecordCurrent: mock(async () => detailRecord),
  listDivisionRecordsCurrent: mock(async () => listRecords),
  listDivisionRecordsCurrentByIds: mock(
    async (_db: unknown, lookup: { divisionIds: string[] }) =>
      lookup.divisionIds
        .map(id => includedRecordsById[id])
        .filter((record): record is DivisionRecord => Boolean(record)),
  ),
}))

mock.module('../lib/d1', () => ({
  runWithD1ReadRetry: mock(async <T>(fn: () => Promise<T> | T) => await fn()),
}))

const { getDivisionDetail, listDivisions } = await import('./divisions')

describe('division services', () => {
  beforeEach(() => {
    listRecords = [baseRecord]
    detailRecord = baseRecord
  })

  test('listDivisions shapes division attributes by profile', async () => {
    const profiles = ['compact', 'default', 'map', 'full'] as const

    for (const profile of profiles) {
      const result = await listDivisions({
        currentDb: {} as never,
        metaDb: {} as never,
        requestUrl: `http://localhost/v0/divisions?profile=${profile}`,
        requestedVersionPath: 'v0',
        requestedApiVersion: '0.1',
        resolvedApiVersion: 'api-divisions-v0.1',
        query: {
          profile,
        },
      })

      expect(result.status).toBe(200)

      if (result.status !== 200) {
        continue
      }

      const resource = result.body.data[0]

      expect(resource).toBeDefined()

      if (!resource) {
        continue
      }

      expect(resource.attributes.level).toBe(3)
      expect(resource.attributes.type).toBe('locality')
      expect('divisionType' in resource.attributes).toBe(false)
      expect('parent' in resource.relationships).toBe(false)
      expect(
        resource.relationships.hierarchy.data.map(hierarchy => hierarchy.id),
      ).toEqual(['division-hk-sar', 'division-east'])

      if (profile === 'compact') {
        expect(resource.attributes).toEqual({
          level: 3,
          type: 'locality',
          i18n: {
            en: {
              name: 'A Kung Ngam',
            },
            'zh-hant': {
              name: '阿公岩',
            },
          },
        })
      }

      if (profile === 'default') {
        expect(resource.attributes).toMatchObject({
          level: 3,
          type: 'locality',
          wikidata: 'Q123456',
          createdAt: '2026-06-17T00:00:00.000Z',
          updatedAt: '2026-06-18T00:00:00.000Z',
        })
        expect(resource.attributes.geometry).toBeUndefined()
        expect(resource.attributes.cartography).toBeUndefined()
        expect(resource.attributes.snapshotId).toBeUndefined()
      }

      if (profile === 'map') {
        expect(resource.attributes).toMatchObject({
          level: 3,
          type: 'locality',
          wikidata: 'Q123456',
          createdAt: '2026-06-17T00:00:00.000Z',
          updatedAt: '2026-06-18T00:00:00.000Z',
          geometry: {
            type: 'Point',
            coordinates: [114.2262, 22.2788],
          },
          bbox: [114.22, 22.27, 114.23, 22.28],
          cartography: {
            kind: 'label-center',
          },
        })
        expect(resource.attributes.snapshotId).toBeUndefined()
        expect(resource.attributes.overture).toBeUndefined()
      }

      if (profile === 'full') {
        expect(resource.attributes).toEqual({
          level: 3,
          type: 'locality',
          snapshotId: activeSnapshot.snapshotId,
          geometry: {
            type: 'Point',
            coordinates: [114.2262, 22.2788],
          },
          bbox: [114.22, 22.27, 114.23, 22.28],
          cartography: {
            kind: 'label-center',
          },
          wikidata: 'Q123456',
          createdAt: '2026-06-17T00:00:00.000Z',
          updatedAt: '2026-06-18T00:00:00.000Z',
          sources: {
            overture: [
              {
                property: '/properties/id',
                dataset: 'overture',
                record_id: 'ovt-division-a-kung-ngam',
              },
            ],
          },
          overture: {
            subtype: 'locality',
            class: 'locality',
            version: 7,
            hierarchies: hierarchyWithNames,
          },
          i18n: {
            en: {
              name: 'A Kung Ngam',
              nameVariant: ['A Kung Ngam'],
              nameAlts: ['A Kung-Ngam'],
              nameRules: [{ value: 'A Kung-Ngam', variant: 'alternate' }],
            },
            'zh-hant': {
              name: '阿公岩',
              nameVariant: ['阿公岩', '阿公岩 A Kung Ngam'],
              nameAlts: ['阿公岩 A Kung Ngam'],
              nameRules: [{ value: '阿公岩 A Kung Ngam', variant: 'alternate' }],
            },
          },
        })
      }
    }
  })

  test('getDivisionDetail derives hierarchy and included resources from canonical hierarchy', async () => {
    const result = await getDivisionDetail({
      currentDb: {} as never,
      metaDb: {} as never,
      requestUrl:
        'http://localhost/v0.1/divisions/division-a-kung-ngam?include=hierarchy&profile=full',
      requestedVersionPath: 'v0.1',
      requestedApiVersion: '0.1',
      resolvedApiVersion: 'api-divisions-v0.1',
      id: 'division-a-kung-ngam',
      query: {
        include: 'hierarchy',
        profile: 'full',
      },
    })

    expect(result.status).toBe(200)

    if (result.status !== 200) {
      return
    }

    expect(result.body.data.relationships.hierarchy.data).toEqual([
      {
        type: 'divisions',
        id: 'division-hk-sar',
        meta: {
          name: 'Hong Kong SAR',
          subType: 'sar',
        },
      },
      {
        type: 'divisions',
        id: 'division-east',
        meta: {
          name: 'Eastern District',
          subType: 'district',
        },
      },
    ])
    expect(result.body.included?.map(resource => resource.id)).toEqual([
      'division-hk-sar',
      'division-east',
    ])
    expect(
      result.body.included?.find(resource => resource.id === 'division-hk-sar')
        ?.attributes.overture,
    ).toMatchObject({
      subtype: 'dependency',
      class: 'dependency',
      admin_level: 1,
    })
    expect(
      result.body.included?.find(resource => resource.id === 'division-east')
        ?.attributes.overture,
    ).toMatchObject({
      subtype: 'region',
      class: 'region',
      admin_level: 2,
    })
  })
})
