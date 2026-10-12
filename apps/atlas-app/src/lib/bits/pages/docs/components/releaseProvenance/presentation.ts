import type { Condition, LineageDefinition, Node } from '@repo/db/fieldLineageTypes'

export function conditionLabel(
  condition: Condition,
  labels: Record<string, string> = {},
): string {
  switch (condition.kind) {
    case 'always':
      return 'Always'
    case 'unresolved':
      return `Unresolved: ${condition.reason}`
    case 'all':
      return condition.conditions
        .map(value => conditionLabel(value, labels))
        .join(' and ')
    case 'any':
      return condition.conditions
        .map(value => conditionLabel(value, labels))
        .join(' or ')
    case 'not':
      return `Unless ${conditionLabel(condition.condition, labels)}`
    case 'predicate':
      return condition.definition.operationCode.replaceAll('-', ' ')
    case 'compare':
      return `${condition.input} ${condition.operator} ${typeof condition.value === 'string' ? (labels[condition.value] ?? condition.value) : valueLabel(condition.value)}`.trim()
  }
}
export function valueLabel(value: unknown): string {
  if (value === null) return 'empty value'
  if (value === undefined) return ''
  if (Array.isArray(value)) return value.map(valueLabel).join(', ')
  if (typeof value === 'object') return 'structured value'
  return String(value)
}
export function operationLabel(node: Node): string {
  switch (node.operation.kind) {
    case 'copy':
      return `Copy ${node.operation.input}`
    case 'constant':
      return `Set ${valueLabel(node.operation.value)}`
    case 'unresolved':
      return `Unresolved: ${node.operation.reason}`
    case 'resolver':
      return node.operation.definition.operationCode.replaceAll('-', ' ')
  }
}
export function traceNodes(
  definition: LineageDefinition,
  terminalNode: string,
): Node[] {
  const nodes = new Map(definition.nodes.map(node => [node.id, node]))
  const groups = new Map(
    definition.resolutionGroups.map(group => [group.id, group.candidates]),
  )
  const seen = new Set<string>()
  const result: Node[] = []
  function visit(id: string) {
    if (seen.has(id)) return
    seen.add(id)
    const node = nodes.get(id)
    if (!node) return
    for (const input of Object.values(node.inputs)) {
      if ('node' in input) visit(input.node)
      if ('group' in input)
        for (const candidate of groups.get(input.group) ?? []) visit(candidate)
    }
    result.push(node)
  }
  visit(terminalNode)
  const stageOrder: Record<Node['stage'], number> = {
    preparation: 0,
    ingestion: 1,
    assembly: 2,
    composition: 3,
  }
  // Stable sorting keeps dependencies before consumers within each stage,
  // while bringing parallel candidate branches into processing-stage order.
  return result.sort((a, b) => stageOrder[a.stage] - stageOrder[b.stage])
}
