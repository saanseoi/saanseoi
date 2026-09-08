import { m } from '@repo/i18n/messages'
import type {
  BranchCondition,
  BranchCounts,
  Json,
  RuleBranch,
} from '@repo/core/provenance'

export function branchConditionText(
  condition: BranchCondition,
  areaNames: string[] = [],
): string {
  if ('all' in condition)
    return condition.all.length
      ? condition.all
          .map(child => branchConditionText(child, areaNames))
          .reduce((left, right) => m.source_audit_condition_and({ left, right }))
      : m.source_audit_otherwise()
  if ('any' in condition)
    return `(${condition.any.map(child => branchConditionText(child, areaNames)).reduce((left, right) => (left ? m.source_audit_condition_or({ left, right }) : right), '')})`
  if (
    condition.field === 'isHongKongArea' &&
    'equals' in condition &&
    condition.equals === true &&
    areaNames.length
  )
    return m.source_audit_area_name_condition({
      names: areaNames.map(name => `\`${name}\``).join(', '),
    })
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
  const parameters = declaration.parameters
  const names =
    parameters && typeof parameters === 'object' && !Array.isArray(parameters)
      ? parameters.hongKongAreaNames
      : undefined
  const areaNames = Array.isArray(names)
    ? names.filter((name): name is string => typeof name === 'string')
    : []
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
  const seenLocaleConditions = new Set<string>()
  for (const value of [...declaration.branches].sort(
    (a, b) =>
      (a as unknown as RuleBranch).precedence - (b as unknown as RuleBranch).precedence,
  )) {
    const branch = value as unknown as RuleBranch
    if (branch.group.startsWith('Locale Normalisation: ')) {
      const key = `${branch.group}:${JSON.stringify(branch.condition)}`
      if (
        seenLocaleConditions.has(key) &&
        !counts?.[branch.id]?.matched &&
        !counts?.[branch.id]?.changed
      )
        continue
      seenLocaleConditions.add(key)
    }
    const rows = groups.get(branch.group) ?? []
    rows.push({
      id: branch.id,
      precedence: branch.precedence,
      condition: branchConditionText(branch.condition, areaNames),
      result: `\`${branch.result}\``,
      matched: counts?.[branch.id]?.matched,
      changed: counts?.[branch.id]?.changed,
    })
    groups.set(branch.group, rows)
  }
  return [...groups].map(([title, rows]) => ({
    title: branchGroupTitle(title),
    explanation: branchGroupExplanation(title),
    rows: rows.sort((a, b) => a.precedence - b.precedence),
  }))
}

function branchGroupExplanation(title: string): string {
  if (title === 'Level Classification') return m.source_audit_level_explanation()
  if (title === 'Type Classification') return m.source_audit_type_explanation()
  if (title.startsWith('Locale Normalisation: '))
    return m.source_audit_locale_explanation({
      locale: title.slice('Locale Normalisation: '.length),
    })
  return m.source_audit_branch_explanation()
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
