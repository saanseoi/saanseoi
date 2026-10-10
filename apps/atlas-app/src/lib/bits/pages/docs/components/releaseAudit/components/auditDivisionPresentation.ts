import type { Json } from '@repo/core/provenance'
export const auditObject = (value: Json | undefined): Record<string, Json> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
export const auditLabel = (key: string) =>
  key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ')
export function decodeAuditValue(value: Json): Json {
  if (typeof value === 'string' && /^[[{]/.test(value.trim())) {
    try {
      return decodeAuditValue(JSON.parse(value))
    } catch {
      return value
    }
  }
  if (Array.isArray(value)) return value.map(decodeAuditValue)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, decodeAuditValue(child)]),
    )
  return value
}
function names(value: Json | undefined): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    const rows = value.map(auditObject)
    return String(
      rows.find(row => row.locale === 'en')?.name ??
        rows.find(row => row.name)?.name ??
        '',
    )
  }
  const row = auditObject(value)
  return names(row.en ?? row['zh-hant'] ?? row['zh-hans'] ?? row.name)
}
function bilingualNames(value: Json | undefined): string {
  const row = auditObject(value)
  return [
    ...new Set([names(row['zh-hant']).trim(), names(row.en).trim()].filter(Boolean)),
  ].join(' ')
}
export function divisionAuditTitle(entry: Json): string {
  const row = auditObject(entry)
  const definition = auditObject(row.definition)
  const properties = auditObject(definition.properties)
  const afterNames = auditObject(row.names)
  return (
    bilingualNames(row.canonicalNames) ||
    bilingualNames(definition.names) ||
    names(auditObject(row.canonicalNames).und) ||
    (definition.suffix && definition.replacement
      ? `${definition.suffix} → ${definition.replacement}`
      : '') ||
    names(afterNames.after) ||
    (typeof row.before === 'string' ? row.before : '') ||
    names(definition.names) ||
    names(properties.names) ||
    names(auditObject(row.before).names) ||
    names(auditObject(row.proposed).names) ||
    (definition.fingerprint && typeof definition.reason === 'string'
      ? definition.reason
      : '') ||
    String(
      definition.key ??
        definition.divisionId ??
        definition.id ??
        properties.name ??
        row.id ??
        row.divisionId ??
        row.section ??
        'Configuration',
    )
  )
}
export const divisionFixtureDescriptions: Record<string, string> = {
  'curation-definitions':
    'The choices used to build this edition: which places to include, what to call them, and where to draw their boundaries. Browse by topic below.',
  'prepared-division-changes':
    'Compare each Overture source record with the resulting SaanSeoi Division. Missing source values are marked.',
  'reviewed-updates':
    'Decisions about differences between the accepted edition and the proposed edition, including name changes, additions and removals.',
}

export const nameActionLabels: Record<string, string> = {
  name: 'Set name',
  aliases: 'Add aliases',
  removeAliases: 'Remove aliases',
  remove: 'Remove name',
}
export function curationAction(entry: Json): string {
  const row = auditObject(entry)
  const definition = auditObject(row.definition)
  if (Array.isArray(definition.paths)) {
    const count = new Set(
      definition.paths
        .flatMap(path => (Array.isArray(path) ? path : []))
        .filter(id => typeof id === 'string'),
    ).size
    return `${count} ${count === 1 ? 'ancestor' : 'ancestors'}`
  }
  if (row.section === 'exclusions' && row.collection === 'islandDecisions') {
    const decision = String(definition.decision ?? 'Review')
    const label = decision.charAt(0).toUpperCase() + decision.slice(1)
    return definition.rejectionCode && decision === 'rejected'
      ? `${label} · ${definition.rejectionCode}`
      : label
  }
  if (row.section === 'selections' && row.collection === 'entries')
    return 'Selected source'
  if (row.section === 'geometry' && row.collection === 'features')
    return 'Drawn geometry'
  if (row.section === 'selections' && row.collection === 'corrections')
    return 'Replacement source geometry'
  if (definition.action) return auditLabel(String(definition.action))
  if (row.section === 'names' && row.collection !== 'nameAliasRules') {
    const actions = Object.values(auditObject(definition.names)).flatMap(value =>
      Object.keys(auditObject(value)).map(
        key => nameActionLabels[key] ?? auditLabel(key),
      ),
    )
    if (actions.length) return [...new Set(actions)].join(' · ')
    if (definition.decision) return `${auditLabel(String(definition.decision))} name`
  }
  return auditLabel(
    String(
      row.field ??
        definition.class ??
        (
          {
            additions: 'Include',
            exclusions: 'Exclude',
            bounds: 'Add bounds',
            points: 'Set point',
          } as Record<string, string>
        )[String(row.section)] ??
        'View definition',
    ),
  )
}
