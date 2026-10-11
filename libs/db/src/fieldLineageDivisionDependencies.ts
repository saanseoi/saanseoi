import { currentFieldRule } from './fieldLineageCurrentRules'
import { divisionOverrideNodes } from './fieldLineageDivisionOverrides'
import type { LineageDefinition, Node } from './fieldLineageTypes'

/** Hierarchy enrichment consumes classification after the same override resolution as the API. */
export function compileDivisionClassificationDependency(args: {
  path: 'effectiveClass' | 'effectiveLevel'
  sourceScope: string
  preparedScope: string
  input: (path: string) => Node['inputs'][string]
  addNode: (node: Node) => { node: string; role: 'value' }
  addGroup: (group: LineageDefinition['resolutionGroups'][number]) => void
  operation: (
    code: string,
    specification: Record<string, unknown>,
    inputs: Node['inputs'],
  ) => Node['operation']
  retain: (document: unknown) => string
}): Node['inputs'][string] {
  const apiField =
    args.path === 'effectiveClass' ? 'attributes.class' : 'attributes.level'
  const specification = currentFieldRule(
    'division',
    apiField,
    'ds-hk-overture-division',
  )!
  const inputs: Node['inputs'] = Object.fromEntries(
    specification.inputs.map(path => [path, args.input(path)]),
  )
  inputs.selectedSource = {
    stage: 'registry',
    scope: 'registry',
    collection: 'lineageContext',
    path: 'selectedSourceScope',
    role: 'selection',
  }
  const baseline: Node = {
    id: `${args.sourceScope}-hierarchy-${args.path}-baseline`,
    stage: 'assembly',
    output: {
      scope: args.preparedScope,
      collection: 'divisionHierarchyContext',
      path: args.path,
    },
    layer: 'baseline',
    priority: 0,
    audit: { category: 'rules', scope: 'bulk', retention: 'counts' },
    inputs,
    when: {
      kind: 'compare',
      input: 'selectedSource',
      operator: 'eq',
      value: args.sourceScope,
    },
    operation: args.operation(`division-hierarchy-${args.path}`, specification, inputs),
    onAbsent: 'omit',
    onFailure: 'error',
  }
  args.addNode(baseline)
  const overrides = divisionOverrideNodes({
    baseline,
    apiField,
    sourceScope: args.sourceScope,
    preparedScope: args.preparedScope,
    operation: args.operation,
    retain: args.retain,
    addGroup: args.addGroup,
  })
  for (const node of overrides) args.addNode(node)
  const group = `${baseline.id}-value`
  args.addGroup({
    id: group,
    output: baseline.output,
    candidates: [baseline.id, ...overrides.map(node => node.id)],
    evaluation: 'per-record',
    keyInputs: [
      {
        stage: 'prepared',
        scope: args.preparedScope,
        collection: 'divisionRows',
        path: 'id',
        role: 'join-key',
      },
    ],
  })
  return { group, role: 'value' }
}
