import type { DivisionHierarchies } from '@repo/db'
import { camelCaseJson } from './jsonKeys'
import { publicDivisionHierarchies } from './publicDivisionHierarchies'

/** Shared source-view contract for source records, change lists and release statistics. */
export function publicSaanseoiDivisionProperties(
  value: Record<string, unknown> | null,
) {
  if (!value) return value
  const properties = { ...value }
  if (properties.hierarchies)
    properties.hierarchies = publicDivisionHierarchies(
      properties.hierarchies as DivisionHierarchies,
    )
  if (
    properties.names &&
    typeof properties.names === 'object' &&
    !Array.isArray(properties.names)
  ) {
    properties.names = Object.fromEntries(
      Object.entries(properties.names).map(([locale, value]) => {
        if (!value || typeof value !== 'object' || Array.isArray(value))
          return [locale, value]
        const { nameVariant: _variants, ...name } = value as Record<string, unknown>
        return [locale, name]
      }),
    )
  }
  return camelCaseJson(properties)
}
