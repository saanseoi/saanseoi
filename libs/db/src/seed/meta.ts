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

const initialApiReleaseSetTimestamp = new Date().toISOString()

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
  publishedAt: string
  validFrom: string
  notes: string
}

export const initialApiReleaseSets: InitialReleaseSetSeed[] = [
  {
    apiVersionCode: 'ss-addresses-v0.1',
    code: 'ss-addresses-v0.1-2026-06-01.01',
    canonicalSchemaVersion: 'canon-address-v1',
    canonicalLogicVersion: 'addr-merge-v1',
    status: 'draft',
    publishedAt: initialApiReleaseSetTimestamp,
    validFrom: initialApiReleaseSetTimestamp,
    notes: 'Alpha Release',
  },
  {
    apiVersionCode: 'ss-places-v0.1',
    code: 'ss-places-v0.1-2026-06-01.01',
    canonicalSchemaVersion: 'canon-place-v1',
    canonicalLogicVersion: 'place-merge-v1',
    status: 'draft',
    publishedAt: initialApiReleaseSetTimestamp,
    validFrom: initialApiReleaseSetTimestamp,
    notes: 'Alpha Release',
  },
  {
    apiVersionCode: 'ss-divisions-v0.1',
    code: 'ss-divisions-v0.1-2026-06-01.01',
    canonicalSchemaVersion: 'canon-division-v1',
    canonicalLogicVersion: 'division-merge-v1',
    status: 'draft',
    publishedAt: initialApiReleaseSetTimestamp,
    validFrom: initialApiReleaseSetTimestamp,
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
    databaseId: 'd37ea879-848d-4548-a565-0d86b4bc3d43',
    status: 'active',
  },
  {
    bindingName: 'DB_META',
    kind: 'meta',
    environment: 'production',
    databaseName: 'ss-meta-db-prod',
    databaseId: 'cf03b2ff-b5ee-4265-899f-6916ed8b6c2c',
    status: 'active',
  },
  {
    bindingName: 'DB_CURRENT',
    kind: 'current',
    environment: 'preview',
    databaseName: 'ss-current-db-preview',
    databaseId: '6d26bf3f-8cf6-4fa6-b80b-25322207dfde',
    status: 'active',
  },
  {
    bindingName: 'DB_CURRENT',
    kind: 'current',
    environment: 'production',
    databaseName: 'ss-current-db-prod',
    databaseId: 'edd3cdf9-1d05-4847-b235-b7fd4189c38d',
    status: 'active',
  },
  {
    bindingName: 'DB_HISTORY_HK_2025',
    kind: 'history',
    environment: 'preview',
    databaseName: 'ss-history-hk-2025-db-preview',
    databaseId: '9566cfa9-2af6-473c-a74b-c7f7c6a757a9',
    status: 'active',
    regionCode: 'hk',
    year: '2025',
  },
  {
    bindingName: 'DB_HISTORY_HK_2025',
    kind: 'history',
    environment: 'production',
    databaseName: 'ss-history-hk-2025-db-prod',
    databaseId: '09c217e2-0e04-4ce5-a197-b4210bcb1dea',
    status: 'active',
    regionCode: 'hk',
    year: '2025',
  },
  {
    bindingName: 'DB_HISTORY_HK_2026',
    kind: 'history',
    environment: 'preview',
    databaseName: 'ss-history-hk-2026-db-preview',
    databaseId: 'b76baf00-7138-44b0-bd24-e99f3aea4249',
    status: 'active',
    regionCode: 'hk',
    year: '2026',
  },
  {
    bindingName: 'DB_HISTORY_HK_2026',
    kind: 'history',
    environment: 'production',
    databaseName: 'ss-history-hk-2026-db-prod',
    databaseId: 'f85a2708-a0aa-4549-8c61-e2289d3694cd',
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
    databaseId: '0e5ff999-c928-4e41-a0e1-e5d7c6fc6d20',
    status: 'active',
    regionCode: 'hk',
    year: '2025',
  },
  {
    bindingName: 'DB_SOURCE_HK_2026',
    kind: 'source',
    environment: 'preview',
    databaseName: 'ss-source-hk-2026-db-preview',
    databaseId: '014dc342-54c8-4049-8667-cfbf7c92cbec',
    status: 'active',
    regionCode: 'hk',
    year: '2026',
  },
  {
    bindingName: 'DB_SOURCE_HK_2026',
    kind: 'source',
    environment: 'production',
    databaseName: 'ss-source-hk-2026-db-prod',
    databaseId: 'dca6df89-880b-42f8-92a8-08f4919a582a',
    status: 'active',
    regionCode: 'hk',
    year: '2026',
  },
] as const
