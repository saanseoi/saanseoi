import type {
  ApiEndpointMethod,
  ApiEndpointUsageType,
  ApiReleaseSetStatus,
  ApiVersionStatus,
  DataShardEnvironment,
  DataShardKind,
  DataShardStatus,
  DatasetCategory,
  DatasetReleaseFrequency,
  DatasetReleaseType,
  DatasetTheme,
  DatasetType,
  ProfileName,
  ResolverCode,
} from '../constants/schema'

export const initialProfiles: ProfileName[] = ['compact', 'default', 'full', 'map']

export const initialResolverCodes: ResolverCode[] = [
  'direct_copy',
  'join_lookup',
  'lookup_fk',
  'derive_bbox_from_geometry',
  'prefer_hkgov_then_overture',
  'prefer_overture_then_hkgov',
  'merge_first_non_empty',
  'normalize_whitespace',
]

export const initialPublishers = [
  {
    code: 'overture',
    url: 'https://overturemaps.org',
    contactUrl: 'https://docs.overturemaps.org/support/',
  },
  {
    code: 'hkgov',
    url: 'https://data.gov.hk',
    contactUrl: 'https://data.gov.hk/en/feedback',
  },
  {
    code: 'hkgov-dpo',
    url: 'https://www.digitalpolicy.gov.hk',
    contactUrl: 'https://www.digitalpolicy.gov.hk/en/contact_us/',
    parentCode: 'hkgov',
  },
] as const

type InitialPublisherI18nSeed = {
  publisherCode: (typeof initialPublishers)[number]['code']
  locale: 'en' | 'zhHant' | 'zhHans'
  name: string
  description?: string
}

export const initialPublisherI18n: InitialPublisherI18nSeed[] = [
  {
    publisherCode: 'overture',
    locale: 'en',
    name: 'Overture Maps Foundation',
  },
  {
    publisherCode: 'overture',
    locale: 'zhHant',
    name: 'Overture Maps Foundation',
  },
  {
    publisherCode: 'overture',
    locale: 'zhHans',
    name: 'Overture Maps Foundation',
  },
  {
    publisherCode: 'hkgov',
    locale: 'en',
    name: 'DATA.GOV.HK',
    description: 'Hong Kong Special Administrative Region Government open data portal.',
  },
  {
    publisherCode: 'hkgov',
    locale: 'zhHant',
    name: '資料一線通',
    description: '香港特別行政區政府開放數據入口網站。',
  },
  {
    publisherCode: 'hkgov',
    locale: 'zhHans',
    name: '资料一线通',
    description: '香港特别行政区政府开放数据入口网站。',
  },
  {
    publisherCode: 'hkgov-dpo',
    locale: 'en',
    name: 'Digital Policy Office',
    description:
      'Policy bureau responsible for digital policy and government digital services.',
  },
  {
    publisherCode: 'hkgov-dpo',
    locale: 'zhHant',
    name: '數字政策辦公室',
    description: '負責數字政策及政府數字服務的政策部門。',
  },
  {
    publisherCode: 'hkgov-dpo',
    locale: 'zhHans',
    name: '数字政策办公室',
    description: '负责数字政策及政府数字服务的政策部门。',
  },
] as const

export const initialLicenses = [
  {
    code: 'odc-by-1.0',
    name: 'Open Data Commons Attribution License 1.0',
    url: 'https://opendatacommons.org/licenses/by/1-0/',
  },
  {
    code: 'ODbL',
    name: 'Open Data Commons Open Database License 1.0',
    url: 'https://opendatacommons.org/licenses/odbl/',
  },
  {
    code: 'CDLA-Permissive-2.0',
    name: 'Community Data License Agreement - Permissive 2.0',
    url: 'https://cdla.dev/permissive-2-0/',
  },
  {
    code: 'hkgov-open-data',
    name: 'HK Gov Terms & Conditions',
    url: 'https://data.gov.hk/en/terms-and-conditions',
  },
] as const

type InitialDatasetSeed = {
  code: string
  publisherCode: (typeof initialPublishers)[number]['code']
  regionCode: string
  releaseType: DatasetReleaseType
  releaseFrequency: DatasetReleaseFrequency
  theme: DatasetTheme
  type: DatasetType
  licenseCode: (typeof initialLicenses)[number]['code']
  attribution?: string
  sourceUrl: string
  category?: DatasetCategory
}

export const initialDatasets: InitialDatasetSeed[] = [
  {
    publisherCode: 'overture',
    code: 'hk-address',
    regionCode: 'hk',
    releaseType: 'static',
    releaseFrequency: 'monthly',
    theme: 'addresses',
    type: 'address',
    licenseCode: 'hkgov-open-data',
    attribution:
      '© HK SAR Government, Digital Policy Office, DATA.GOV.HK; Overture Maps Foundation.',
    sourceUrl: 'https://docs.overturemaps.org/schema/reference/addresses/address/',
    category: 'places',
  },
  {
    publisherCode: 'overture',
    code: 'hk-division',
    regionCode: 'hk',
    releaseType: 'static',
    releaseFrequency: 'monthly',
    theme: 'divisions',
    type: 'division',
    licenseCode: 'ODbL',
    attribution: '© OpenStreetMap contributors; Overture Maps Foundation.',
    sourceUrl: 'https://docs.overturemaps.org/',
    category: 'places',
  },
  {
    publisherCode: 'overture',
    code: 'hk-place',
    regionCode: 'hk',
    releaseType: 'static',
    releaseFrequency: 'monthly',
    theme: 'places',
    type: 'place',
    licenseCode: 'CDLA-Permissive-2.0',
    attribution: '© Meta; Overture Maps Foundation.',
    sourceUrl: 'https://docs.overturemaps.org/',
    category: 'places',
  },
  {
    publisherCode: 'hkgov',
    code: 'hk-address',
    regionCode: 'hk',
    releaseType: 'static',
    releaseFrequency: 'monthly',
    theme: 'addresses',
    type: 'address',
    licenseCode: 'hkgov-open-data',
    attribution: '© HK SAR Government, Digital Policy Office, DATA.GOV.HK',
    sourceUrl: 'https://data.gov.hk/en-data/dataset/hk-ogcio-st_div_01-als',
    category: 'places',
  },
] as const

type InitialApiVersionSeed = {
  code: string
  status: ApiVersionStatus
}

export const initialApiVersions: InitialApiVersionSeed[] = [
  { code: 'ss-addresses-v0.1', status: 'draft' },
  { code: 'ss-places-v0.1', status: 'draft' },
  { code: 'ss-divisions-v0.1', status: 'draft' },
] as const

type InitialApiEndpointSeed = {
  apiVersionCode: string
  method: ApiEndpointMethod
  path: string
  operationId: string
  resourceType: DatasetType
  datasets: Array<{
    datasetCode: string
    publisherCode: InitialDatasetSeed['publisherCode']
    usageType: ApiEndpointUsageType
    required: boolean
  }>
}

export const initialApiEndpoints: InitialApiEndpointSeed[] = [
  {
    apiVersionCode: 'ss-addresses-v0.1',
    method: 'GET',
    path: '/v0/addresses',
    operationId: 'listAddressesV0',
    resourceType: 'address',
    datasets: [
      {
        datasetCode: 'hk-address',
        publisherCode: 'overture',
        usageType: 'enrichment',
        required: true,
      },
      {
        datasetCode: 'hk-address',
        publisherCode: 'hkgov',
        usageType: 'primary',
        required: false,
      },
    ],
  },
  {
    apiVersionCode: 'ss-addresses-v0.1',
    method: 'GET',
    path: '/v0.1/addresses/{id}',
    operationId: 'getAddressByIdV01',
    resourceType: 'address',
    datasets: [
      {
        datasetCode: 'hk-address',
        publisherCode: 'overture',
        usageType: 'enrichment',
        required: true,
      },
      {
        datasetCode: 'hk-address',
        publisherCode: 'hkgov',
        usageType: 'primary',
        required: false,
      },
    ],
  },
  {
    apiVersionCode: 'ss-places-v0.1',
    method: 'GET',
    path: '/v0/places',
    operationId: 'listPlacesV0',
    resourceType: 'place',
    datasets: [
      {
        datasetCode: 'hk-place',
        publisherCode: 'overture',
        usageType: 'primary',
        required: true,
      },
    ],
  },
  {
    apiVersionCode: 'ss-divisions-v0.1',
    method: 'GET',
    path: '/v0/divisions',
    operationId: 'listDivisionsV0',
    resourceType: 'division',
    datasets: [
      {
        datasetCode: 'hk-division',
        publisherCode: 'overture',
        usageType: 'primary',
        required: true,
      },
    ],
  },
] as const

type InitialReleaseSetSeed = {
  apiVersionCode: string
  code: string
  canonicalSchemaVersion: string
  canonicalLogicVersion: string
  status: ApiReleaseSetStatus
  notes: string
}

export const initialApiReleaseSets: InitialReleaseSetSeed[] = [
  {
    apiVersionCode: 'ss-addresses-v0.1',
    code: 'ss-addresses-v0.1-2026-06-01.01',
    canonicalSchemaVersion: 'canon-address-v1',
    canonicalLogicVersion: 'addr-merge-v1',
    status: 'draft',
    notes: 'Alpha Release',
  },
  {
    apiVersionCode: 'ss-places-v0.1',
    code: 'ss-places-v0.1-2026-06-01.01',
    canonicalSchemaVersion: 'canon-place-v1',
    canonicalLogicVersion: 'place-merge-v1',
    status: 'draft',
    notes: 'Alpha Release',
  },
  {
    apiVersionCode: 'ss-divisions-v0.1',
    code: 'ss-divisions-v0.1-2026-06-01.01',
    canonicalSchemaVersion: 'canon-division-v1',
    canonicalLogicVersion: 'division-merge-v1',
    status: 'draft',
    notes: 'Alpha Release',
  },
] as const

type InitialDataShardSeed = {
  bindingName: string
  kind: DataShardKind
  environment: DataShardEnvironment
  databaseName: string
  databaseId: string
  status: DataShardStatus
  regionCode?: string
  year?: string
}

export const initialDataShards: InitialDataShardSeed[] = [
  {
    bindingName: 'DB_META',
    kind: 'meta',
    environment: 'preview',
    databaseName: 'ss-meta-db-preview',
    databaseId: '655743d2-5dcc-4a94-a12f-62eaf9955a84',
    status: 'active',
  },
  {
    bindingName: 'DB_META',
    kind: 'meta',
    environment: 'production',
    databaseName: 'ss-meta-db-prod',
    databaseId: '5cbcd2b2-5418-43e2-97f1-78f30037aaf3',
    status: 'active',
  },
  {
    bindingName: 'DB_CURRENT',
    kind: 'current',
    environment: 'preview',
    databaseName: 'ss-current-db-preview',
    databaseId: '1e704b3f-4374-42ea-b8b2-faca805d11eb',
    status: 'active',
    regionCode: 'hk',
    year: '2026',
  },
  {
    bindingName: 'DB_CURRENT',
    kind: 'current',
    environment: 'production',
    databaseName: 'ss-current-db-prod',
    databaseId: 'c15bf6b3-32a3-4d05-b7d2-1d2e2643037f',
    status: 'active',
    regionCode: 'hk',
    year: '2026',
  },
  {
    bindingName: 'DB_HISTORY_HK_2025',
    kind: 'history',
    environment: 'preview',
    databaseName: 'ss-history-hk-2025-db-preview',
    databaseId: 'bea18422-d1ce-429d-b099-464a33716921',
    status: 'active',
    regionCode: 'hk',
    year: '2025',
  },
  {
    bindingName: 'DB_HISTORY_HK_2025',
    kind: 'history',
    environment: 'production',
    databaseName: 'ss-history-hk-2025-db-prod',
    databaseId: 'c019b2b7-5511-4cee-8732-5bdba2aea264',
    status: 'active',
    regionCode: 'hk',
    year: '2025',
  },
  {
    bindingName: 'DB_HISTORY_HK_2026',
    kind: 'history',
    environment: 'preview',
    databaseName: 'ss-history-hk-2026-db-preview',
    databaseId: 'de2e7b41-29dd-4f97-a3eb-8eae47cf7a05',
    status: 'active',
    regionCode: 'hk',
    year: '2026',
  },
  {
    bindingName: 'DB_HISTORY_HK_2026',
    kind: 'history',
    environment: 'production',
    databaseName: 'ss-history-hk-2026-db-prod',
    databaseId: 'b9119da1-813d-4d03-a431-b8e4a540f918',
    status: 'active',
    regionCode: 'hk',
    year: '2026',
  },
  {
    bindingName: 'DB_SOURCE_HK_2025',
    kind: 'source',
    environment: 'preview',
    databaseName: 'ss-source-hk-2025-db-preview',
    databaseId: '113ea535-e571-4e31-b15a-c18f116e0424',
    status: 'active',
    regionCode: 'hk',
    year: '2025',
  },
  {
    bindingName: 'DB_SOURCE_HK_2025',
    kind: 'source',
    environment: 'production',
    databaseName: 'ss-source-hk-2025-db-prod',
    databaseId: '4dcb7029-51da-482a-a41c-729ecd7b7b12',
    status: 'active',
    regionCode: 'hk',
    year: '2025',
  },
  {
    bindingName: 'DB_SOURCE_HK_2026',
    kind: 'source',
    environment: 'preview',
    databaseName: 'ss-source-hk-2026-db-preview',
    databaseId: '1231e30e-58da-4e70-9342-7b4bb6500dad',
    status: 'active',
    regionCode: 'hk',
    year: '2026',
  },
  {
    bindingName: 'DB_SOURCE_HK_2026',
    kind: 'source',
    environment: 'production',
    databaseName: 'ss-source-hk-2026-db-prod',
    databaseId: 'c005d6e0-02f7-45f4-9171-1291fc2dc1b5',
    status: 'active',
    regionCode: 'hk',
    year: '2026',
  },
] as const
