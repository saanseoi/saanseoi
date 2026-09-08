import { m } from '@repo/i18n/messages'
import type {
  BranchCondition,
  BranchCounts,
  Json,
  RuleBranch,
} from '@repo/core/provenance'

export function branchConditionText(condition: BranchCondition): string {
  if ('all' in condition)
    return condition.all.length
      ? condition.all
          .map(branchConditionText)
          .reduce((left, right) => m.source_audit_condition_and({ left, right }))
      : m.source_audit_otherwise()
  if ('any' in condition)
    return `(${condition.any.map(branchConditionText).reduce((left, right) => (left ? m.source_audit_condition_or({ left, right }) : right), '')})`
  return 'equals' in condition
    ? m.source_audit_field_equals({
        field: condition.field,
        value: `\`${String(condition.equals)}\``,
      })
    : m.source_audit_condition_contains({
        field: condition.field,
        value: `\`${condition.contains}\``,
      })
}

/** Render only retained branches; missing historical counts are not zero. */
export function retainedBranchGroups(
  declaration: Json | undefined,
  counts?: BranchCounts,
) {
  if (
    !declaration ||
    typeof declaration !== 'object' ||
    Array.isArray(declaration) ||
    !Array.isArray(declaration.branches)
  )
    return []
  const groups = new Map<
    string,
    Array<{
      id: string
      precedence: number
      condition: string
      result: string
      matched?: number
      changed?: number
    }>
  >()
  for (const value of declaration.branches) {
    const branch = value as unknown as RuleBranch
    const rows = groups.get(branch.group) ?? []
    rows.push({
      id: branch.id,
      precedence: branch.precedence,
      condition: branchConditionText(branch.condition),
      result: `\`${branch.result}\``,
      matched: counts?.[branch.id]?.matched,
      changed: counts?.[branch.id]?.changed,
    })
    groups.set(branch.group, rows)
  }
  return [...groups].map(([title, rows]) => ({
    title: branchGroupTitle(title),
    rows: rows.sort((a, b) => a.precedence - b.precedence),
  }))
}

function branchGroupTitle(title: string): string {
  if (title === 'Level Classification') return m.source_audit_level_classification()
  if (title === 'Type Classification') return m.source_audit_type_classification()
  const localePrefix = 'Locale Normalisation: '
  if (title.startsWith(localePrefix))
    return m.source_audit_branch_locale_title({
      locale: title.slice(localePrefix.length),
    })
  return title
}
