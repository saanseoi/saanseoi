import { equalJson, type JsonFieldChange } from '@repo/core/jsonFieldDiff'
import type { ReleaseSampleField } from '#lib/bits/pages/docs/components/releaseSamples/releaseSamplesPresentation.js'

function entries(value: unknown): [string, unknown][] {
  return value !== null && typeof value === 'object' ? Object.entries(value) : []
}
// Language identifies translated entries; variants and sides disambiguate repeated locales.
// Fall back to indices when the available identity is ambiguous.
function languageEntries(left: unknown, right: unknown) {
  if (!Array.isArray(left) || !Array.isArray(right)) return null
  const items = [...left, ...right]
  if (
    !items.length ||
    !items.every(
      item =>
        item &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        (typeof item.language === 'string' || item.language === null),
    )
  )
    return null
  for (const keys of [['language'], ['language', 'variant', 'side']]) {
    const keyed = (values: Record<string, unknown>[]) =>
      values.map(
        item =>
          [
            keys.map(key => `${key}=${JSON.stringify(item[key] ?? null)}`).join(', '),
            item,
          ] as [string, unknown],
      )
    const previous = keyed(left)
    const current = keyed(right)
    if (
      new Set(previous.map(([key]) => key)).size === left.length &&
      new Set(current.map(([key]) => key)).size === right.length
    )
      return { previous, current }
  }
  return null
}

function display(value: unknown, exists: boolean, absent: string) {
  if (!exists) return absent
  if (value === null) return 'null'
  if (typeof value === 'object') return Array.isArray(value) ? '[]' : '{}'
  return String(value)
}

export function changeFields(
  before: unknown,
  after: unknown,
  changes: JsonFieldChange[],
  changesOnly: boolean,
  comparison: boolean,
  absent: string,
): ReleaseSampleField[] {
  function visit(
    left: unknown,
    right: unknown,
    path: string[],
    alignedParent = false,
  ): ReleaseSampleField[] {
    const aligned = comparison ? languageEntries(left, right) : null
    const previous = new Map(aligned?.previous ?? entries(left))
    const current = new Map(aligned?.current ?? entries(right))
    return [...new Set([...previous.keys(), ...current.keys()])].flatMap(key => {
      const nextPath = [...path, key]
      if (
        comparison &&
        changesOnly &&
        !aligned &&
        !alignedParent &&
        !changes.some(change =>
          change.path
            .slice(0, Math.min(nextPath.length, change.path.length))
            .every((segment, index) => segment === nextPath[index]),
        )
      )
        return []
      const oldValue = previous.get(key)
      const newValue = current.get(key)
      if (
        comparison &&
        changesOnly &&
        previous.has(key) === current.has(key) &&
        equalJson(oldValue, newValue)
      )
        return []
      const children = visit(
        oldValue,
        newValue,
        nextPath,
        alignedParent || Boolean(aligned),
      )
      if (
        comparison &&
        changesOnly &&
        !children.length &&
        entries(oldValue).length &&
        entries(newValue).length &&
        Array.isArray(oldValue) === Array.isArray(newValue)
      )
        return []
      return [
        {
          key: Array.isArray(right) || Array.isArray(left) ? `[${key}]` : key,
          value: entries(newValue).length
            ? undefined
            : display(newValue, current.has(key), absent),
          previousValue:
            comparison && !entries(oldValue).length
              ? display(oldValue, previous.has(key), absent)
              : undefined,
          ...(children.length ? { children } : {}),
        },
      ]
    })
  }
  return visit(comparison ? before : after, after, [])
}

export function recordSummary(
  value: unknown,
  locale: string,
  fallback: string,
): { name: string; detail: string } {
  const record =
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const props =
    record.properties && typeof record.properties === 'object'
      ? (record.properties as Record<string, unknown>)
      : record
  function name(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim()) return value
    if (Array.isArray(value)) return value.map(name).find(Boolean)
    if (value && typeof value === 'object') {
      const local = value as Record<string, unknown>
      return (
        name(local[locale]) ??
        name(local.en) ??
        name(local.name) ??
        name(local.primary) ??
        name(local.value)
      )
    }
  }
  return {
    name:
      name(props.name) ??
      name(props.names) ??
      name(props.label) ??
      name(props.address) ??
      fallback,
    detail: [props.type, props.subtype, props.class, props.status]
      .filter((value): value is string => typeof value === 'string')
      .join(' · '),
  }
}

export function expandableFields(
  fields: ReleaseSampleField[],
  path: string[] = [],
): { id: string; expanded: boolean }[] {
  return fields.flatMap(field => {
    const next = [...path, field.key]
    return field.children?.length
      ? [
          { id: JSON.stringify(next), expanded: field.key !== 'geometry' },
          ...expandableFields(field.children, next),
        ]
      : []
  })
}
