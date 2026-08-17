import { describe, expect, mock, test } from 'bun:test'

import type {
  DivisionAreaRecord,
  DivisionBoundaryRecord,
  DivisionRecord,
} from '../db/divisions'
import {
  DivisionDetailParamsSchema,
  DivisionDetailQuerySchema,
  DivisionsListQuerySchema,
} from '../schema/divisions'

const CATALOG_REVISION = 'catalog-hk-divisions-v0.1-2026-08-14-r0'
const CATALOG_PUBLISHED_AT = '2026-08-14T00:00:00.000Z'

type DomainFixture = {
  code: string
  cohort: string
  snapshotId: string
  effectiveFrom: string
}

const domains: Record<string, DomainFixture> = {
  overture: {
    code: 'data-hk-divisions-2025-09-24.0',
    cohort: '2025-09-24.0',
    snapshotId: 'snapshot-hk-divisions-2025-09-24.0',
    effectiveFrom: '2025-09-24T00:00:00.000Z',
  },
  'hkgov-pland-pu': {
    code: 'data-hk-divisions-2021--hkgov-pland-pu',
    cohort: '2021',
    snapshotId: 'snapshot-hk-divisions-hkgov-pland-pu-2021',
    effectiveFrom: '2021-01-01T00:00:00.000Z',
  },
  'hkgov-pland-new-town': {
    code: 'data-hk-divisions-2021--hkgov-pland-new-town',
    cohort: '2021',
    snapshotId: 'snapshot-hk-divisions-hkgov-pland-new-town-2021',
    effectiveFrom: '2021-01-01T00:00:00.000Z',
  },
}

const hierarchy = {
  country: [],
  sar: [{ division_id: 'division-country-cn', subtype: 'country', name: '中国' }],
  district: [
    { division_id: 'division-country-cn', subtype: 'country', name: '中国' },
    { division_id: 'division-hk-sar', subtype: 'dependency', name: 'Hong Kong SAR' },
  ],
  locality: [
    { division_id: 'division-country-cn', subtype: 'country', name: '中国' },
    { division_id: 'division-hk-sar', subtype: 'dependency', name: 'Hong Kong SAR' },
    { division_id: 'division-east', subtype: 'region', name: 'Eastern District' },
  ],
} as const

function makeRecord(args: {
  id: string
  type: string
  level: number
  names: { en: string; 'zh-hant': string; 'zh-hans': string }
  hierarchy: readonly unknown[]
  point?: [number, number]
}): DivisionRecord {
  const point = args.point ?? [114.2, 22.28]

  return {
    division: {
      snapshotId: 'snapshot-placeholder',
      id: args.id,
      level: args.level,
      type: args.type,
      geometry: { type: 'Point', coordinates: point },
      bbox: [point[0] - 0.01, point[1] - 0.01, point[0] + 0.01, point[1] + 0.01],
      sourceKeys: {
        overture: {
          subtype: args.type,
          class: args.type,
          version: 1,
          hierarchies: args.hierarchy,
        },
      },
      identifiers: null,
      subtype: args.type,
      class: args.type,
      overtureFeatureVersion: 1,
      overtureAdminLevel: args.level,
      overtureHierarchies: args.hierarchy,
      wikidata: null,
      hierarchy: args.hierarchy,
      cartography: { kind: 'label-center' },
      sources: {
        overture: [
          {
            property: '/properties/id',
            dataset: 'overture',
            record_id: `ovt-${args.id}`,
          },
        ],
      },
      createdAt: '2025-09-24T00:00:00.000Z',
      updatedAt: '2025-09-25T00:00:00.000Z',
    },
    i18n: {
      en: { name: args.names.en, nameVariant: [args.names.en] },
      'zh-hant': { name: args.names['zh-hant'] },
      'zh-hans': { name: args.names['zh-hans'] },
    },
  }
}

const records: DivisionRecord[] = [
  makeRecord({
    id: 'division-country-cn',
    type: 'country',
    level: 0,
    names: { en: 'China', 'zh-hant': '中國', 'zh-hans': '中国' },
    hierarchy: hierarchy.country,
    point: [104.2, 35.8],
  }),
  makeRecord({
    id: 'division-hk-sar',
    type: 'sar',
    level: 0,
    names: {
      en: 'Hong Kong SAR',
      'zh-hant': '香港特別行政區',
      'zh-hans': '香港特别行政区',
    },
    hierarchy: hierarchy.sar,
    point: [114.17, 22.32],
  }),
  makeRecord({
    id: 'division-east',
    type: 'district',
    level: 2,
    names: { en: 'Eastern District', 'zh-hant': '東區', 'zh-hans': '东区' },
    hierarchy: hierarchy.district,
    point: [114.22, 22.28],
  }),
  makeRecord({
    id: 'division-a-kung-ngam',
    type: 'locality',
    level: 3,
    names: { en: 'A Kung Ngam', 'zh-hant': '阿公岩', 'zh-hans': '阿公岩' },
    hierarchy: hierarchy.locality,
    point: [114.2262, 22.2788],
  }),
]

const areaRecords: DivisionAreaRecord[] = [
  {
    id: 'area-overture-division-east',
    variant: 'overture',
    divisionId: 'division-east',
    bbox: [114.18, 22.25, 114.3, 22.35],
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [114.18, 22.25],
          [114.3, 22.25],
          [114.3, 22.35],
          [114.18, 22.35],
          [114.18, 22.25],
        ],
      ],
    },
    sourceKeys: { overture: { id: 'area-east' } },
    sources: {
      overture: [{ property: '/id', dataset: 'overture', record_id: 'area-east' }],
    },
    type: 'Polygon',
    isLand: true,
    isTerritorial: false,
  },
  {
    id: 'area-hkgov-had-division-east',
    variant: 'hkgov-had',
    divisionId: 'division-east',
    bbox: [114.19, 22.26, 114.29, 22.34],
    geometry: { type: 'Polygon', coordinates: [] },
    sourceKeys: { 'hkgov-had': { id: 'had-east' } },
    sources: {
      'hkgov-had': [{ property: '/id', dataset: 'hkgov-had', record_id: 'had-east' }],
    },
    type: 'Polygon',
    isLand: true,
    isTerritorial: false,
  },
  {
    id: 'area-hkgov-censtatd-2021-simplified-division-east',
    variant: 'hkgov-censtatd:2021:simplified',
    divisionId: 'division-east',
    bbox: [114.2, 22.27, 114.28, 22.33],
    geometry: { type: 'Polygon', coordinates: [] },
    sourceKeys: { 'hkgov-censtatd': { id: 'censtatd-east' } },
    sources: {
      'hkgov-censtatd': [
        { property: '/id', dataset: 'hkgov-censtatd', record_id: 'censtatd-east' },
      ],
    },
    type: 'Polygon',
    isLand: true,
    isTerritorial: false,
  },
]

const boundaryRecords: DivisionBoundaryRecord[] = [
  {
    id: 'boundary-overture-division-east',
    variant: 'overture',
    leftDivisionId: 'division-east',
    rightDivisionId: 'division-hk-sar',
    bbox: [114.18, 22.25, 114.3, 22.35],
    geometry: {
      type: 'LineString',
      coordinates: [
        [114.2, 22.25],
        [114.2, 22.35],
      ],
    },
    sourceKeys: { overture: { id: 'boundary-east' } },
    sources: {
      overture: [{ property: '/id', dataset: 'overture', record_id: 'boundary-east' }],
    },
    type: 'LineString',
    isLand: true,
    isTerritorial: false,
  },
]

function withSnapshot(record: DivisionRecord, snapshotId: string): DivisionRecord {
  return {
    ...record,
    division: { ...record.division, snapshotId },
  }
}

function projectLocales(
  record: DivisionRecord,
  localeSelection: { mode: string; locales: string[] },
) {
  if (localeSelection.mode === 'none') {
    return { ...record, i18n: {} }
  }

  if (localeSelection.mode === 'all') return record

  return {
    ...record,
    i18n: Object.fromEntries(
      Object.entries(record.i18n).filter(([locale]) =>
        localeSelection.locales.includes(locale),
      ),
    ),
  }
}

function matchesParent(record: DivisionRecord, parentId?: string) {
  if (!parentId) return true
  const hierarchyEntries = Array.isArray(record.division.hierarchy)
    ? record.division.hierarchy
    : []
  const hierarchyEntry = hierarchyEntries.at(-1)
  if (
    !hierarchyEntry ||
    typeof hierarchyEntry !== 'object' ||
    !('division_id' in hierarchyEntry)
  ) {
    return false
  }
  return hierarchyEntry.division_id === parentId
}

function listMatchingRecords(lookup: {
  snapshotId: string
  level?: number
  type?: string
  parentId?: string
  limit?: number
  offset?: number
  localeSelection: { mode: string; locales: string[] }
}) {
  const matching = records.filter(
    record =>
      (lookup.level === undefined || record.division.level === lookup.level) &&
      (!lookup.type || record.division.type === lookup.type) &&
      matchesParent(record, lookup.parentId),
  )
  const offset = lookup.offset ?? 0
  const limit = lookup.limit ?? matching.length

  return matching
    .slice(offset, offset + limit)
    .map(record =>
      projectLocales(withSnapshot(record, lookup.snapshotId), lookup.localeSelection),
    )
}

function releaseSelection(
  domainCode: string,
  args: Record<string, string | undefined>,
) {
  const domain = domains[domainCode]
  if (!domain) return null

  if (args.releaseSet && args.releaseSet !== domain.code) return null
  if (args.cohortKey && args.cohortKey !== domain.cohort) return null
  if (args.catalogRevision && args.catalogRevision !== CATALOG_REVISION) return null

  const snapshots = [
    {
      snapshotResourceType: 'division',
      snapshotId: domain.snapshotId,
      role: 'primary',
      variant: domainCode,
    },
  ]

  if (domainCode === 'overture') {
    snapshots.push(
      {
        snapshotResourceType: 'divisionArea',
        snapshotId: `${domain.snapshotId}-area-overture`,
        role: 'geometry',
        variant: 'overture',
      },
      {
        snapshotResourceType: 'divisionArea',
        snapshotId: `${domain.snapshotId}-area-had`,
        role: 'geometry',
        variant: 'hkgov-had',
      },
      {
        snapshotResourceType: 'divisionArea',
        snapshotId: `${domain.snapshotId}-area-censtatd`,
        role: 'geometry',
        variant: 'hkgov-censtatd:2021:simplified',
      },
      {
        snapshotResourceType: 'divisionBoundary',
        snapshotId: `${domain.snapshotId}-boundary-overture`,
        role: 'geometry',
        variant: 'overture',
      },
    )
  }

  return {
    releaseSet: {
      id: `release-set-${domain.code}`,
      code: domain.code,
      cohortKey: domain.cohort,
      domainCode,
      effectiveFrom: domain.effectiveFrom,
      effectiveTo: null,
      revision: 0,
      schemaVersion: 'sv-division-v1',
      rulesetVersion: 'rs-division-merge-v1',
      apiCatalogRevision: CATALOG_REVISION,
      catalogPublishedAt: CATALOG_PUBLISHED_AT,
    },
    snapshots,
  }
}

const resolveApiReleaseSetSnapshotsForRequestMock = mock(
  async (
    _db: unknown,
    _resourceType: unknown,
    args: Record<string, string | undefined>,
  ) => releaseSelection(args.domainCode ?? 'overture', args),
)

// Keep this mock compatible with the @repo/core barrel when Bun evaluates test files in parallel.
mock.module('@repo/core/db/metaRegistry', () => ({
  getDatasetById: mock(async () => null),
  getLatestDatasetForRegionSourceType: mock(async () => null),
  insertDataset: mock(async () => null),
  resetFailedDataset: mock(async () => null),
  resolveApiReleaseSetSnapshotsForRequest: resolveApiReleaseSetSnapshotsForRequestMock,
  upsertIngestRunStatus: mock(async () => null),
}))

mock.module('../db/divisions', () => ({
  countDivisionsCurrent: mock(
    async (
      _db: unknown,
      lookup: { level?: number; type?: string; parentId?: string },
    ) =>
      listMatchingRecords({
        ...lookup,
        snapshotId: 'unused',
        localeSelection: { mode: 'all', locales: ['*'] },
      }).length,
  ),
  getDivisionRecordCurrent: mock(
    async (
      _db: unknown,
      lookup: {
        divisionId: string
        snapshotId: string
        localeSelection: { mode: string; locales: string[] }
      },
    ) => {
      const record = records.find(item => item.division.id === lookup.divisionId)
      return record
        ? projectLocales(
            withSnapshot(record, lookup.snapshotId),
            lookup.localeSelection,
          )
        : null
    },
  ),
  listDivisionRecordsCurrent: mock(
    async (_db: unknown, lookup: Parameters<typeof listMatchingRecords>[0]) =>
      listMatchingRecords(lookup),
  ),
  listDivisionRecordsCurrentByIds: mock(
    async (
      _db: unknown,
      lookup: {
        divisionIds: string[]
        snapshotId: string
        localeSelection: { mode: string; locales: string[] }
      },
    ) =>
      lookup.divisionIds
        .map(id => records.find(record => record.division.id === id))
        .filter((record): record is DivisionRecord => Boolean(record))
        .map(record =>
          projectLocales(
            withSnapshot(record, lookup.snapshotId),
            lookup.localeSelection,
          ),
        ),
  ),
  listDivisionAreasCurrentByDivisionIds: mock(
    async (_db: unknown, lookup: { divisionIds: string[]; variant?: string }) =>
      areaRecords.filter(
        area =>
          lookup.divisionIds.includes(area.divisionId) &&
          (!lookup.variant || area.variant === lookup.variant),
      ),
  ),
  listDivisionBoundariesCurrentByDivisionIds: mock(
    async (_db: unknown, lookup: { divisionIds: string[]; variant?: string }) =>
      boundaryRecords.filter(
        boundary =>
          (lookup.divisionIds.includes(boundary.leftDivisionId) ||
            lookup.divisionIds.includes(boundary.rightDivisionId)) &&
          (!lookup.variant || boundary.variant === lookup.variant),
      ),
  ),
}))

const { getDivisionDetail, listDivisions } = await import('./divisions')

const requestCases = [
  { name: 'default Overture collection', url: '/v0.1/divisions' },
  {
    name: 'exact cohort and domain',
    url: '/v0.1/divisions?domain=overture&cohort=2025-09-24.0',
  },
  {
    name: 'exact immutable release set',
    url: '/v0.1/divisions?releaseSet=data-hk-divisions-2025-09-24.0',
  },
  { name: 'v0 alias', url: '/v0/divisions?releaseSet=data-hk-divisions-2025-09-24.0' },
  {
    name: 'planning unit domain',
    url: '/v0.1/divisions?domain=hkgov-pland-pu&cohort=2021',
  },
  {
    name: 'new town domain',
    url: '/v0.1/divisions?domain=hkgov-pland-new-town&cohort=2021',
  },
  { name: 'hierarchy companions', url: '/v0.1/divisions?include=hierarchy' },
  { name: 'Overture areas', url: '/v0.1/divisions?include=areas' },
  { name: 'Overture boundaries', url: '/v0.1/divisions?include=boundaries' },
  { name: 'qualified HAD areas', url: '/v0.1/divisions?include=areas:hkgov-had' },
  {
    name: 'qualified transformed C and SD area',
    url: '/v0.1/divisions?include=areas:hkgov-censtatd:2021&transform=simplified',
  },
  {
    name: 'level type parent filters and pagination',
    url: '/v0.1/divisions?filter[level]=3&filter[divisionType]=locality&filter[parent]=division-east&page[limit]=1&page[offset]=0',
  },
  { name: 'map profile', url: '/v0.1/divisions?profile=map' },
  { name: 'all locales', url: '/v0.1/divisions?profile=full&locales=*' },
  {
    name: 'effective known and catalogue revision selectors',
    url: `/v0.1/divisions?effectiveAt=2025-09-24T00:00:00.000Z&knownAt=${CATALOG_PUBLISHED_AT}&catalogRevision=${CATALOG_REVISION}`,
  },
  {
    name: 'detail with full profile and hierarchy',
    url: '/v0.1/divisions/division-a-kung-ngam?profile=full&include=hierarchy',
  },
  {
    name: 'unavailable qualified variant does not fall back',
    url: '/v0.1/divisions?include=areas:hkgov-pland-new-town',
  },
  {
    name: 'missing domain cohort is not silently substituted',
    url: '/v0.1/divisions?domain=hkgov-pland-pu&cohort=2025-09-24.0',
  },
] as const

describe('Divisions API release-note request contracts', () => {
  for (const requestCase of requestCases) {
    test(requestCase.name, async () => {
      const url = new URL(requestCase.url, 'http://localhost')
      const isDetail = url.pathname.includes('/divisions/')
      let status: number
      let response: unknown

      if (isDetail) {
        const id = url.pathname.split('/').at(-1) ?? ''
        const query = DivisionDetailQuerySchema.parse(
          Object.fromEntries(url.searchParams),
        )
        const result = await getDivisionDetail({
          currentDb: {} as never,
          metaDb: {} as never,
          requestUrl: url.toString(),
          requestedVersionPath: url.pathname.startsWith('/v0.1') ? 'v0.1' : 'v0',
          requestedApiVersion: '0.1',
          resolvedApiVersion: 'api-divisions-v0.1',
          id: DivisionDetailParamsSchema.parse({ id }).id,
          query,
        })
        status = result.status
        response = JSON.parse(JSON.stringify(result.body))
      } else {
        const query = DivisionsListQuerySchema.parse(
          Object.fromEntries(url.searchParams),
        )
        const result = await listDivisions({
          currentDb: {} as never,
          metaDb: {} as never,
          requestUrl: url.toString(),
          requestedVersionPath: url.pathname.startsWith('/v0.1') ? 'v0.1' : 'v0',
          requestedApiVersion: '0.1',
          resolvedApiVersion: 'api-divisions-v0.1',
          query,
        })
        status = result.status
        response = JSON.parse(JSON.stringify(result.body))
      }

      expect({ request: requestCase.url, status, response }).toMatchSnapshot(
        requestCase.name,
      )
    })
  }
})
