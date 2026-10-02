import divisionsV02 from '../../../fixtures/meta/apiResponseFields/api-divisions-v0.2@sv-division-v1.json'
import addresses from '../../../fixtures/meta/apiResponseFields/api-addresses-v0.1@sv-address-v1.json'
import divisions from '../../../fixtures/meta/apiResponseFields/api-divisions-v0.1@sv-division-v1.json'
import places from '../../../fixtures/meta/apiResponseFields/api-places-v0.1@sv-place-v1.json'
import statistics from '../../../fixtures/meta/apiResponseFields/api-stats-v0.1@sv-statistics-v1.json'
import { computeVersionHash } from './versioning'

export type ApiResponseFields = {
  versionHash: string
  apiVersion: string
  schemaVersion: string
  /** Only exceptions and joins; ordinary id and attributes projections are implicit. */
  resources: Record<string, Record<string, string | string[]>>
}

const documents: ApiResponseFields[] = [
  addresses,
  divisions,
  divisionsV02,
  places,
  statistics,
]

export function validateApiResponseFields(document: ApiResponseFields) {
  if (document.versionHash !== computeVersionHash(document))
    throw new Error('API response field fixture hash does not match its contents.')
  for (const fields of Object.values(document.resources)) {
    for (const input of Object.values(fields)) {
      const paths = typeof input === 'string' ? [input] : input
      if (
        !Array.isArray(paths) ||
        !paths.length ||
        new Set(paths).size !== paths.length ||
        paths.some(
          path => typeof path !== 'string' || !/^[a-zA-Z][a-zA-Z0-9-]*\..+/.test(path),
        )
      )
        throw new Error('API response field requires unique canonical input paths.')
    }
  }
}

for (const document of documents) validateApiResponseFields(document)

export function resolveApiResponseFields(apiVersion: string, schemaVersion: string) {
  const document = documents.find(
    value => value.apiVersion === apiVersion && value.schemaVersion === schemaVersion,
  )
  if (!document)
    throw new Error(`Missing API response fields for ${apiVersion}/${schemaVersion}.`)
  return structuredClone(document)
}

export function canonicalResponseInputs(
  document: ApiResponseFields,
  resourceType: string,
  apiField: string,
): string[] {
  const fields = document.resources[resourceType]
  if (!fields) throw new Error(`Unknown API response resource: ${resourceType}.`)
  const explicit = fields[apiField]
  if (explicit !== undefined)
    return typeof explicit === 'string' ? [explicit] : [...explicit]
  if (apiField === 'id') return [`${resourceType}.id`]
  if (apiField.startsWith('attributes.') && apiField.length > 'attributes.'.length)
    return [`${resourceType}.${apiField.slice('attributes.'.length)}`]
  throw new Error(
    `API response field requires an explicit mapping: ${resourceType}.${apiField}.`,
  )
}
