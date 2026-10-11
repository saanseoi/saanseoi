import type { LineageDefinition, ReleaseBinding } from './fieldLineageTypes'
import { expandFieldLineage, validateFieldLineageBinding } from './fieldLineageGraph'

/** Locale keys come from the selected immutable snapshot row, never today's locale list. */
export function expandLocaleFieldLineage(
  definition: LineageDefinition,
  binding: ReleaseBinding,
  resourceType: string,
  record: { snapshotId: string; i18n: Record<string, unknown> },
) {
  validateFieldLineageBinding(definition, binding)
  const scope = definition.scopes.find(
    scope => scope.kind === 'snapshot' && scope.resourceType === resourceType,
  )
  const pin = binding.scopes.find(pin => pin.scopeId === scope?.id)
  if (!pin || ![pin.snapshotId, ...(pin.snapshotIds ?? [])].includes(record.snapshotId))
    throw new Error('Locale record is outside the selected lineage snapshot binding.')
  if (!record.i18n || typeof record.i18n !== 'object' || Array.isArray(record.i18n))
    throw new Error('Localisations must be an object keyed by locale.')
  return definition.fields
    .filter(
      field =>
        field.resourceType === resourceType &&
        /^attributes\.i18n\.\*\./.test(field.apiField),
    )
    .flatMap(field =>
      Object.keys(record.i18n)
        .sort()
        .map(locale => {
          const segments = field.apiField.split('.')
          segments[2] = locale
          return {
            ...expandFieldLineage(definition, field),
            apiField: `attributes.i18n[${JSON.stringify(locale)}].${segments.slice(3).join('.')}`,
            apiFieldSegments: segments,
            selectorBindings: { locale, snapshotId: record.snapshotId },
            evidence: 'derived-from-selected-snapshot' as const,
          }
        }),
    )
}
