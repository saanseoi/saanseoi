import { buildDeterministicUuidV5 } from './versioning'

const GEOMETRY_NAMESPACE = '3b9f16d8-9d18-5e96-a2d0-8ef0cb561cb5'

/** The source identity is retained separately; versions and transforms are not identity seeds. */
export function canonicalGeometryId(
  kind: 'division' | 'divisionArea' | 'divisionBoundary',
  source: string,
  sourceId: string,
) {
  if (!sourceId || sourceId.trim() !== sourceId)
    throw new Error('Geometry requires a non-empty source identity.')
  return `ss-${buildDeterministicUuidV5(GEOMETRY_NAMESPACE, JSON.stringify([kind, source, sourceId]))}`
}

/** Mark an existing deterministic UUID as a SaanSeoi-generated identity. */
export function canonicalGeneratedId(uuid: string) {
  const bare = uuid.startsWith('ss-') ? uuid.slice(3) : uuid
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bare))
    throw new Error('Generated identity requires a UUID.')
  return `ss-${bare}`
}
