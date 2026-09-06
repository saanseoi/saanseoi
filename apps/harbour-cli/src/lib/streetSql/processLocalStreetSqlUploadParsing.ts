import type { StreetEvidenceAsset } from '@repo/db'
import type {
  LandsdStreetLifecycleI18n,
  LandsdStreetLifecycleTextCorrection,
} from '../sources/landsd/street/landsdStreetLifecycle.ts'
import type {
  AssetLink,
  PreparedStreet,
  PreparedStreetI18n,
} from './processLocalStreetSqlUploadTypes.ts'
import { parsePartialRetainedDescriptions } from './processLocalStreetSqlUploadRows.ts'

export function parseI18n(
  value: unknown,
  sourceRecordId: string,
): PreparedStreetI18n[] {
  const values = parseJsonArray(value, 'i18n')
  const result = values.map((item, index) => {
    const record = asRecord(item, `i18n[${index}]`)
    const locale = requireLocale(record.locale, `i18n[${index}].locale`)
    return {
      description: optionalString(record.description),
      locale,
      name: requireString(record.name, `i18n[${index}].name`),
    } satisfies PreparedStreetI18n
  })
  if (new Set(result.map(item => item.locale)).size !== result.length) {
    throw new Error(`LandsD street ${sourceRecordId} contains duplicate locales.`)
  }
  return result
}

export function parseAssetLinks(value: unknown, name: string): AssetLink[] {
  return parseJsonArray(value, name).map((item, index) => {
    const record = asRecord(item, `${name}[${index}]`)
    const sourcePageLocale = optionalString(record.sourcePageLocale)
    const role = requireStreetAssetRole(record.role, `${name}[${index}].role`)
    const sourcePageUrl = optionalString(record.sourcePageUrl)
    return {
      assetId: requireString(record.assetId, `${name}[${index}].assetId`),
      assetUrl: requireString(record.assetUrl, `${name}[${index}].assetUrl`),
      byteLength: requireNumber(record.byteLength, `${name}[${index}].byteLength`),
      contentHash: requireString(record.contentHash, `${name}[${index}].contentHash`),
      manifest: parseAssetManifest(record.manifest, `${name}[${index}].manifest`),
      mediaType: requireString(record.mediaType, `${name}[${index}].mediaType`),
      objectKey: requireString(record.objectKey, `${name}[${index}].objectKey`),
      originalUrl: requireString(record.originalUrl, `${name}[${index}].originalUrl`),
      publisherIdentifier: optionalString(record.publisherIdentifier),
      retrievedAt: requireString(record.retrievedAt, `${name}[${index}].retrievedAt`),
      role,
      ...(sourcePageLocale === 'en' || sourcePageLocale === 'zh-Hant'
        ? { sourcePageLocale }
        : {}),
      ...(sourcePageUrl ? { sourcePageUrl } : {}),
    }
  })
}

export function parseStringArray(value: unknown, name: string) {
  return parseJsonArray(value, name).map((item, index) =>
    requireString(item, `${name}[${index}]`),
  )
}

export function parseNullableRecord(value: unknown, name: string) {
  if (value === null || value === undefined || value === '') return null
  return parseRecord(value, name)
}

function parseRecord(value: unknown, name: string) {
  return asRecord(parseJson(value, name), name)
}

function parseJsonArray(value: unknown, name: string) {
  const parsed = parseJson(value, name)
  if (!Array.isArray(parsed)) throw new Error(`${name} must be a JSON array.`)
  return parsed
}

function parseJson(value: unknown, name: string): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`${name} contains invalid JSON.`)
  }
}

function asRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${name} must be an object.`)
  return value as Record<string, unknown>
}

export function parseBoolean(value: unknown, name: string) {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  throw new Error(`${name} must be true or false.`)
}

export function parseSourceKind(value: unknown): PreparedStreet['sourceKind'] {
  if (value === 'baseline' || value === 'notice' || value === 'historical-notice')
    return value
  throw new Error('source_kind must be baseline, notice, or historical-notice.')
}

export function isNoticeSource(record: Pick<PreparedStreet, 'sourceKind'>): boolean {
  return record.sourceKind === 'notice' || record.sourceKind === 'historical-notice'
}

export function parseNoticeApplication(value: unknown): PreparedStreet['application'] {
  if (value === undefined || value === null || value === '') return null
  const record = asRecord(parseJson(value, 'application'), 'application')
  const method = record.method
  const disposition = record.disposition
  const scope = record.nameChangeScope
  if (method !== 'automatic' && method !== 'manual')
    throw new Error('application.method must be automatic or manual.')
  if (disposition !== 'apply' && disposition !== 'noOp')
    throw new Error('application.disposition must be apply or noOp.')
  if (scope !== null && scope !== undefined && scope !== 'whole' && scope !== 'partial')
    throw new Error('application.nameChangeScope is invalid.')
  const retainedDescriptions =
    record.retainedDescriptions === null || record.retainedDescriptions === undefined
      ? null
      : parsePartialRetainedDescriptions(
          record.retainedDescriptions,
          'application.retainedDescriptions',
        )
  if (scope === 'partial' && !retainedDescriptions)
    throw new Error('partial application needs retainedDescriptions.')
  const correction = parseTextCorrection(record.correction)
  return {
    sourceStreetId: optionalString(record.sourceStreetId),
    resultStreetId: optionalString(record.resultStreetId),
    disposition,
    method,
    nameChangeScope: scope ?? null,
    retainedDescriptions,
    correction,
  }
}

function parseTextCorrection(
  value: unknown,
): LandsdStreetLifecycleTextCorrection | null {
  if (value === null || value === undefined) return null
  const record = asRecord(value, 'application.correction')
  const from = requireString(record.from, 'application.correction.from')
  const to = requireString(record.to, 'application.correction.to')
  if (!Array.isArray(record.fields) || record.fields.length === 0)
    throw new Error('application.correction.fields must be a non-empty array.')
  const fields = record.fields.map(field => {
    if (
      field === 'en.name' ||
      field === 'zh-Hant.name' ||
      field === 'en.description' ||
      field === 'zh-Hant.description' ||
      field === 'previousNoticeRefs'
    )
      return field
    throw new Error('application.correction.fields has an invalid field.')
  })
  return { fields, from, to }
}

function requireLocale(value: unknown, name: string): PreparedStreetI18n['locale'] {
  if (value === 'en' || value === 'zh-Hant') return value
  throw new Error(`${name} must be en or zh-Hant.`)
}

export function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${name}.`)
  return value.trim()
}

export function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function requireNumber(value: unknown, name: string) {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be numeric.`)
  return parsed
}

function requireStreetAssetRole(
  value: unknown,
  name: string,
): StreetEvidenceAsset['role'] {
  const role = requireString(value, name)
  if (
    role !== 'gazettePlan' &&
    role !== 'gazettePlanPreview' &&
    role !== 'governmentNotice' &&
    role !== 'historicalGovernmentNotice' &&
    role !== 'sourceArchive' &&
    role !== 'sourcePage' &&
    role !== 'sourcePdf'
  ) {
    throw new Error(`${name} has unsupported LandsD asset role ${role}.`)
  }
  return role
}

function parseAssetManifest(
  value: unknown,
  name: string,
): StreetEvidenceAsset['manifest'] {
  const record = asRecord(value, name)
  return {
    assetId: requireString(record.assetId, `${name}.assetId`),
    assetUrl: requireString(record.assetUrl, `${name}.assetUrl`),
    contentHash: requireString(record.contentHash, `${name}.contentHash`),
    objectKey: requireString(record.objectKey, `${name}.objectKey`),
  }
}

export function normaliseStreetName(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('en').replaceAll(/\s+/g, ' ').trim()
}

export function stableI18n(value: PreparedStreetI18n) {
  return {
    description: value.description,
    locale: value.locale,
    name: value.name,
  }
}

export function stableLifecycleI18n(value: LandsdStreetLifecycleI18n) {
  return {
    description: value.description,
    locale: value.locale,
    name: value.name,
  }
}

export function stableAssetLinks(links: AssetLink[]) {
  return links.map(link => ({
    assetId: link.assetId,
    assetUrl: link.assetUrl,
    contentHash: link.contentHash,
    mediaType: link.mediaType,
    objectKey: link.objectKey,
    originalUrl: link.originalUrl,
    publisherIdentifier: link.publisherIdentifier ?? null,
    role: link.role,
    sourcePageLocale: link.sourcePageLocale ?? null,
    sourcePageUrl: link.sourcePageUrl ?? null,
  }))
}

export function splitNameAlternatives(value: unknown) {
  return typeof value === 'string'
    ? value
        .split(/[|;]/)
        .map(item => item.trim())
        .filter(Boolean)
    : []
}

export function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1)
}
