import type { LineageDefinition, Node } from '@repo/db/fieldLineageTypes'
import type { HumanOperation } from '@repo/db/fieldLineageHuman'
import { readablePath } from './presentation'

export function retainedOperation(
  node: Node,
  definition: LineageDefinition,
): Record<string, unknown> {
  if (node.operation.kind !== 'resolver') return {}
  return (
    (definition.definitions[node.operation.definition.definitionId] as Record<
      string,
      unknown
    >) ?? {}
  )
}
export function humanOperation(
  node: Node,
  definition: LineageDefinition,
): HumanOperation | undefined {
  const retained = retainedOperation(node, definition)
  if (retained.human) return retained.human as HumanOperation
  if (node.operation.kind === 'copy')
    return {
      kind: 'copy',
      title: 'Use the source value',
      description: 'Keep this value unchanged.',
    }
  if (node.operation.kind === 'constant')
    return {
      kind: 'assign',
      title: 'Fixed value',
      description: `Use ${node.operation.value === null ? 'null' : String(node.operation.value)} for this field.`,
    }
  if (node.stage === 'composition')
    return {
      kind: 'copy',
      title: 'API response',
      description:
        'Expose the selected field in the response when the request includes it.',
    }
}
export function fieldName(path: string) {
  return readablePath(
    path.replace(/^(record|properties|rows)\./, '').replace(/^names\./, 'i18n.'),
  )
}
export function visibleNodeTitle(node: Node, definition: LineageDefinition) {
  return (
    humanOperation(node, definition)?.title ??
    `Derivation of ${fieldName(node.output.path)}`
  )
}
export function isTransportNode(node: Node, definition?: LineageDefinition) {
  if (
    node.operation.kind === 'resolver' &&
    node.operation.definition.operationCode === 'government-area-geometry'
  )
    return true
  if (
    node.operation.kind !== 'resolver' ||
    (definition && retainedOperation(node, definition).human)
  )
    return false
  return [
    'serialise-curated-record',
    'publisher-source-retention',
    'curated-source-property',
    'curated-record-field',
    'curated-area-prepared-field',
  ].includes(node.operation.definition.operationCode)
}
