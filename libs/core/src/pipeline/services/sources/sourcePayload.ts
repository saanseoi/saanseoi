import { registerRule } from '../../../provenance/auditTypes'
import { ruleDeclarationFromFixture } from '../../../provenance/ruleFixture'
import overtureFixture from '../../../../../../fixtures/meta/processing-rules/overture-source-retention.json'
import saanseoiFixture from '../../../../../../fixtures/meta/processing-rules/saanseoi-source-retention.json'
import { recordContent } from './recordContent'
import { retainSourceProperties } from './retainedProperties'
/**
 * Separate publisher attributes from fields represented once by the source
 * envelope. This is a storage mapping, not canonical normalisation: values are
 * neither corrected nor inferred here.
 */
function overtureSourcePayloadInternal(row: Record<string, unknown>) {
  const { id: _id, geometry, ...properties } = row
  const { sources } = row
  if (
    sources != null &&
    (!Array.isArray(sources) ||
      !sources.every(
        source =>
          source && typeof source === 'object' && typeof source.dataset === 'string',
      ))
  ) {
    throw new Error(
      'Overture publisher sources must be an array of attribution records or null.',
    )
  }
  return {
    properties: retainSourceProperties(properties) as Record<string, unknown>,
    sourceGeometry:
      geometry instanceof Uint8Array
        ? {
            encoding: 'wkb-base64',
            data: Buffer.from(
              geometry.buffer,
              geometry.byteOffset,
              geometry.byteLength,
            ).toString('base64'),
          }
        : (geometry ?? null),
  }
}

/**
 * Source fingerprints retain their original serialised field key. This key is
 * part of the hash contract only; stored and prepared payloads use properties.
 */
export function sourceRecordHashInput(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(recordContent(row)).map(([key, value]) => [
      key === 'properties' ? 'rawProperties' : key,
      value,
    ]),
  )
}

export function publisherSourceHashInput(row: {
  properties: unknown
  sourceGeometry?: unknown
}) {
  return sourceRecordHashInput({
    properties: row.properties,
    sourceGeometry: row.sourceGeometry ?? null,
  })
}

/** Native properties and geometry are versioned independently of acquisition or repair. */
export function nativeSourcePayloadHashInput(row: {
  properties: unknown
  sourceGeometry?: unknown
}) {
  return {
    ...publisherSourceHashInput({
      properties: retainSourceProperties(row.properties),
      sourceGeometry: row.sourceGeometry,
    }),
  }
}

/** Minimal acquisition locator; dataset, release and publisher attributes live elsewhere. */
export function sourceLocatorFromReferences(
  value: unknown,
  envelope: { sourceRecordId?: string; archiveObjectKey?: string } = {},
): Record<string, unknown> | null {
  if (value == null) return null
  if (!Array.isArray(value)) throw new Error('Acquisition references must be an array.')
  const locator: Record<string, unknown> = {}
  for (const reference of value) {
    if (!reference || typeof reference !== 'object' || Array.isArray(reference))
      throw new Error('Invalid acquisition reference.')
    for (const field of [
      'assetId',
      'sourceFile',
      'featureIndexOneBased',
      'layer',
      'layerName',
      'sourceFeatureRef',
    ] as const) {
      if (!Object.hasOwn(reference, field) || reference[field] == null) continue
      if (
        Object.hasOwn(locator, field) &&
        JSON.stringify(locator[field]) !== JSON.stringify(reference[field])
      )
        throw new Error(
          `Conflicting source locator ${field}; retain distinct source occurrences.`,
        )
      locator[field] = reference[field]
    }
  }
  if (locator.sourceFile === envelope.archiveObjectKey) delete locator.sourceFile
  if (locator.sourceFeatureRef === envelope.sourceRecordId)
    delete locator.sourceFeatureRef
  return Object.keys(locator).length ? locator : null
}

/** Preserve the reviewed publisher record, not its Parquet transport envelope. */
function saanseoiSourcePayloadInternal(row: Record<string, unknown>) {
  const record = typeof row.record === 'string' ? JSON.parse(row.record) : row.record
  if (
    !record ||
    typeof record !== 'object' ||
    Array.isArray(record) ||
    record.id !== row.id
  )
    throw new Error('Invalid SaanSeoi source record.')
  const { id: _id, geometry, ...properties } = record
  return {
    properties,
    sourceGeometry:
      typeof geometry === 'string' ? JSON.parse(geometry) : (geometry ?? null),
  }
}

export const overtureSourceRetentionRule = registerRule(
  ruleDeclarationFromFixture(overtureFixture),
  overtureSourcePayloadInternal,
)
export const saanseoiSourceRetentionRule = registerRule(
  ruleDeclarationFromFixture(saanseoiFixture),
  saanseoiSourcePayloadInternal,
)
export function overtureSourcePayload(row: Record<string, unknown>) {
  return overtureSourceRetentionRule.execute(row)
}
export function saanseoiSourcePayload(row: Record<string, unknown>) {
  return saanseoiSourceRetentionRule.execute(row)
}
