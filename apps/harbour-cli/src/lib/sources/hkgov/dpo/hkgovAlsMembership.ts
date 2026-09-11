import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { normaliseAddressRowForPipeline } from '@repo/core/pipeline/services/addresses/normalisation'
import {
  alsSourceLocator,
  type AlsPublisherSource,
} from '@repo/core/pipeline/services/sources/alsSourcePayload'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'
import type { PreparedAls3dRecord } from './hkgovAls3dPreparation'

export type AlsMembershipAddress = {
  id: string
  level: string
  parentId: string | null
  en: string | null
  zhHant: string | null
  coordinates: [number, number] | null
  sourceIds: string[]
  curations: string[]
}
/** Repeated building labels and geometry live on the owner, not every flat. */
export type AlsMembershipUnit = [
  id: string,
  floor: string,
  unit: string,
  en: string,
  zhHant: string,
]
export type AlsMembershipCollection = {
  id: string
  ownerId: string
  sourceIds: string[]
  curations?: string[]
  unresolvedSectionIds?: string[]
  units: AlsMembershipUnit[]
}
export type AlsMembershipSource = {
  id: string
  kind: '2d' | '3d'
  canonicalIds: string[]
  /** Publisher floor/unit tokens, before corrections or retained-unit backfills. */
  units?: string[]
}
export type AlsMembership = {
  schemaVersion: 1
  sourceVersion: string
  addresses: AlsMembershipAddress[]
  collections: AlsMembershipCollection[]
  sources: AlsMembershipSource[]
  aliases: Array<[string, string]>
  preparedSha256?: string
  address3dSha256?: string
}
export type AlsMembershipReference = {
  path: string
  sha256: string
  sourceVersion: string
}
export const alsMembershipHash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')

export function membershipCollection(
  record: Extract<PreparedAls3dRecord, { kind: 'collection' }>,
): AlsMembershipCollection {
  return {
    id: record.id,
    ownerId: record.address2dId,
    sourceIds: [...record.sourceRecordIds].sort(),
    curations: (record.processingSources ?? [])
      .map(source => JSON.stringify(source))
      .sort(),
    unresolvedSectionIds: [...record.unresolvedSectionIds].sort(),
    units: record.units.map(unit => [
      unit.id,
      unit.floorRef,
      unit.unitRef,
      [
        record.locales.en?.[unit.id]?.floorExpression,
        record.locales.en?.[unit.id]?.unitExpression,
      ]
        .filter(Boolean)
        .join(', '),
      [
        record.locales['zh-hant']?.[unit.id]?.floorExpression,
        record.locales['zh-hant']?.[unit.id]?.unitExpression,
      ]
        .filter(Boolean)
        .join(''),
    ]),
  }
}

/** Only raw captured assertions are read here; no source feature is modified. */
export function membershipSource(
  record: Pick<AlsPublisherSource, 'sourceRecordId' | 'properties'>,
  kind: '2d' | '3d',
): AlsMembershipSource {
  const raw = record.properties ?? {}
  const units = new Set<string>()
  for (const [name, prefix] of [
    ['address3dEn', 'Eng'],
    ['address3dZhHant', 'Chi'],
  ] as const) {
    const rows = raw[name]
    if (!Array.isArray(rows)) continue
    for (const row of rows) {
      const floor = row?.[`${prefix}Floor`]
      const described = String(floor?.FloorDescription ?? '').match(
        prefix === 'Eng' ? /^(.+)\/F$/ : /^(.+)樓$/,
      )?.[1]
      units.add(
        JSON.stringify([
          String(floor?.FloorNum ?? described ?? '').trim(),
          String(row?.[`${prefix}Unit`]?.UnitNo ?? '').trim(),
        ]),
      )
    }
  }
  return {
    id: record.sourceRecordId,
    kind,
    canonicalIds: [],
    ...(kind === '3d' ? { units: [...units].sort() } : {}),
  }
}

export function buildAlsMembership(input: {
  sourceVersion: string
  rows: PreparedHkgovAlsRow[]
  publisherSources: ReadonlyMap<string, AlsPublisherSource>
  collections: AlsMembershipCollection[]
  sources3d: AlsMembershipSource[]
  aliases: ReadonlyMap<string, string>
}): AlsMembership {
  const sources = new Map(
    [...input.publisherSources.values()].map(source => [
      source.sourceRecordId,
      membershipSource(source, '2d'),
    ]),
  )
  for (const source of input.sources3d) sources.set(source.id, source)
  const addresses = input.rows
    .map(row => {
      const captured = input.publisherSources.get(
        alsSourceLocator({
          sourceFile: row.sourceFile,
          featureIndexOneBased: row.sourceFeatureIndexOneBased,
        }),
      )
      const normalised = normaliseAddressRowForPipeline(
        { ...row, publisherSource: captured ?? null },
        input.sourceVersion,
      )
      const sourceIds = new Set<string>()
      const curations = new Set<string>()
      const visit = (value: unknown) => {
        if (!value || typeof value !== 'object') return
        if (Array.isArray(value)) {
          for (const child of value) visit(child)
          return
        }
        const item = value as Record<string, unknown>
        if (
          typeof item.sourceFile === 'string' &&
          typeof item.featureIndexOneBased === 'number'
        ) {
          const source = input.publisherSources.get(
            alsSourceLocator({
              sourceFile: item.sourceFile,
              featureIndexOneBased: item.featureIndexOneBased,
            }),
          )
          // Retention evidence refers to an earlier release, not the current publisher.
          if (
            source &&
            (!item.sourceVersion || item.sourceVersion === input.sourceVersion) &&
            !String(item.dataset ?? '').startsWith('saanseoi-')
          )
            sourceIds.add(source.sourceRecordId)
        }
        if (
          String(item.dataset ?? '').startsWith('saanseoi-') ||
          (typeof item.curationFile === 'string' && typeof item.id === 'string')
        ) {
          // Existing reviewed retentions use fixture references, not a dataset
          // label. Keep their identity and evidence without duplicating raw arrays.
          curations.add(
            JSON.stringify(
              Object.fromEntries(
                [
                  'dataset',
                  'id',
                  'revision',
                  'fixtureVersion',
                  'curationFile',
                  'sourceFile',
                  'evidenceSourceVersion',
                  'sourceVersion',
                  'verification',
                  'curation',
                ]
                  .filter(key => item[key] !== undefined)
                  .map(key => [key, item[key]]),
              ),
            ),
          )
        }
        for (const child of Object.values(item)) visit(child)
      }
      if (captured) sourceIds.add(captured.sourceRecordId)
      visit(normalised.base.sources)
      if (row.hierarchyCuration) curations.add(row.hierarchyCuration)
      const geometry = normalised.base.geometry as { coordinates?: number[] } | null
      const coordinates = geometry?.coordinates
      const address: AlsMembershipAddress = {
        id: normalised.canonicalId,
        level: normalised.base.granularity,
        parentId: normalised.base.parentAddressId,
        en:
          normalised.i18n.find(value => value.locale === 'en')?.formattedAddress ??
          null,
        zhHant:
          normalised.i18n.find(value => value.locale === 'zh-hant')?.formattedAddress ??
          null,
        coordinates:
          coordinates?.length === 2 && coordinates.every(Number.isFinite)
            ? [coordinates[0]!, coordinates[1]!]
            : null,
        sourceIds: [...sourceIds].sort(),
        curations: [...curations].sort(),
      }
      for (const id of sourceIds) sources.get(id)?.canonicalIds.push(address.id)
      return address
    })
    .sort((a, b) => a.id.localeCompare(b.id))
  for (const collection of input.collections) {
    for (const id of collection.sourceIds)
      sources.get(id)?.canonicalIds.push(collection.ownerId)
    collection.units.sort(([a], [b]) => a.localeCompare(b))
  }
  const result: AlsMembership = {
    schemaVersion: 1,
    sourceVersion: input.sourceVersion,
    addresses,
    collections: input.collections.sort((a, b) => a.id.localeCompare(b.id)),
    sources: [...sources.values()]
      .map(source => ({
        ...source,
        canonicalIds: [...new Set(source.canonicalIds)].sort(),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    aliases: [...input.aliases.entries()].sort(([a], [b]) => a.localeCompare(b)),
  }
  validateAlsMembership(result)
  return result
}

export function validateAlsMembership(membership: AlsMembership) {
  if (
    membership.schemaVersion !== 1 ||
    !membership.sourceVersion ||
    !Array.isArray(membership.addresses) ||
    !Array.isArray(membership.collections) ||
    !Array.isArray(membership.sources) ||
    !Array.isArray(membership.aliases)
  )
    throw new Error('Invalid ALS membership; prepare the release again.')
  const addresses = new Map(membership.addresses.map(row => [row.id, row]))
  if (addresses.size !== membership.addresses.length)
    throw new Error('Duplicate ALS canonical address in membership.')
  const checked = new Set<string>()
  for (const row of addresses.values()) {
    const path = new Set<string>()
    let current: AlsMembershipAddress | undefined = row
    while (current && !checked.has(current.id)) {
      if (path.has(current.id)) throw new Error(`ALS parent cycle at ${current.id}.`)
      path.add(current.id)
      if (!current.parentId) break
      const parent: AlsMembershipAddress | undefined = addresses.get(current.parentId)
      if (!parent)
        throw new Error(`ALS dangling parent ${current.parentId} for ${current.id}.`)
      current = parent
    }
    for (const id of path) checked.add(id)
  }
  const collections = new Set<string>()
  const owners = new Set<string>()
  const units = new Set<string>()
  const sourceIds = new Set(membership.sources.map(source => source.id))
  if (sourceIds.size !== membership.sources.length)
    throw new Error('Duplicate ALS publisher source in membership.')
  for (const collection of membership.collections) {
    if (!addresses.has(collection.ownerId))
      throw new Error(`ALS dangling inventory owner ${collection.ownerId}.`)
    for (const id of collection.unresolvedSectionIds ?? []) {
      if (!addresses.has(id)) throw new Error(`ALS dangling inventory section ${id}.`)
      if (addresses.get(id)?.parentId !== collection.ownerId)
        throw new Error(`ALS inventory section ${id} belongs to another owner.`)
    }
    if (collections.has(collection.id))
      throw new Error(`Duplicate ALS collection ${collection.id}.`)
    if (owners.has(collection.ownerId))
      throw new Error(`Duplicate ALS inventory owner ${collection.ownerId}.`)
    collections.add(collection.id)
    owners.add(collection.ownerId)
    for (const [id] of collection.units) {
      if (units.has(id)) throw new Error(`Duplicate ALS unit ${id} across inventories.`)
      units.add(id)
    }
    for (const id of collection.sourceIds)
      if (!sourceIds.has(id)) throw new Error(`ALS missing inventory source ${id}.`)
  }
  for (const address of membership.addresses)
    for (const id of address.sourceIds)
      if (!sourceIds.has(id)) throw new Error(`ALS missing address source ${id}.`)
  for (const source of membership.sources)
    for (const id of source.canonicalIds)
      if (!addresses.has(id)) throw new Error(`ALS dangling source owner ${id}.`)
  for (const [, owner] of membership.aliases)
    if (!addresses.has(owner)) throw new Error(`ALS dangling alias owner ${owner}.`)
}

export async function writeAlsMembership(
  path: string,
  membership: AlsMembership,
): Promise<AlsMembershipReference> {
  validateAlsMembership(membership)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(membership))
  return {
    path,
    sha256: alsMembershipHash(membership),
    sourceVersion: membership.sourceVersion,
  }
}
export async function readAlsMembership(path: string, expectedHash?: string) {
  const membership = JSON.parse(await readFile(path, 'utf8')) as AlsMembership
  validateAlsMembership(membership)
  if (expectedHash && alsMembershipHash(membership) !== expectedHash)
    throw new Error(`ALS membership checksum changed: ${path}`)
  return membership
}
