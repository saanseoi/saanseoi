import type { HumanOperation, HumanSourceUse } from '@repo/db/fieldLineageHuman'
import type {
  Condition,
  FieldPlan,
  FieldRef,
  LineageDefinition,
  Node,
  ReleaseBinding,
} from '@repo/db/fieldLineageTypes'

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
      if (!condition.conditions.length) return 'Always'
      return condition.conditions
        .map(value => conditionLabel(value, labels))
        .join(' and ')
    case 'any':
      if (!condition.conditions.length) return 'Never'
      return condition.conditions
        .map(value => conditionLabel(value, labels))
        .join(' or ')
    case 'not':
      return `Unless ${conditionLabel(condition.condition, labels)}`
    case 'predicate':
      return condition.definition.operationCode.replaceAll('-', ' ')
    case 'compare':
      return `${condition.input === 'selectedSource' ? 'Source' : condition.input} ${{ eq: 'is', in: 'is one of', exists: 'is present', matches: 'matches' }[condition.operator]} ${typeof condition.value === 'string' ? (labels[condition.value] ?? condition.value) : valueLabel(condition.value)}`.trim()
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
  includeEvidence = true,
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
      if (!includeEvidence && input.role === 'evidence') continue
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

export function fieldFlow(definition: LineageDefinition, terminalNode: string) {
  const flow = traceNodes(definition, terminalNode, false)
  const flowIds = new Set(flow.map(node => node.id))
  const evidence = traceNodes(definition, terminalNode).filter(
    node => !flowIds.has(node.id),
  )
  const references = new Map([
    ...flow.map((node, index) => [node.id, `Step ${index + 1}`] as const),
    ...evidence.map((node, index) => [node.id, `Evidence ${index + 1}`] as const),
  ])
  return { flow, evidence, references }
}

export function readablePath(path: string): string {
  return path
    .replace(/^attributes\./, '')
    .replaceAll('bbox', 'bounding box')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .replaceAll('.', ' · ')
}

export function stepTitle(node: Node): string {
  if (node.operation.kind === 'constant')
    return `Set ${readablePath(node.output.path)} to ${valueLabel(node.operation.value)}`
  if (node.operation.kind === 'unresolved') return 'Processing details unavailable'
  const code =
    node.operation.kind === 'resolver' ? node.operation.definition.operationCode : ''
  if (code === 'serialise-curated-record') return 'Preprocess publisher artefact'
  if (code === 'curated-source-property' || code === 'publisher-source-retention')
    return 'Retain source evidence'
  if (node.stage === 'composition') return `Return ${readablePath(node.output.path)}`
  if (node.operation.kind === 'copy') return `Copy ${readablePath(node.output.path)}`
  if (
    code.includes(':attributes.') ||
    code.includes(':relationships.') ||
    code.endsWith(':id')
  )
    return `Resolve ${readablePath(node.output.path)}`
  const action = {
    preparation: 'Prepare',
    ingestion: 'Import',
    assembly: 'Resolve',
    composition: 'Include',
  }[node.stage]
  return `${action} ${readablePath(node.output.path)}`
}

export function stepDescription(node: Node, definition: LineageDefinition): string {
  if (node.operation.kind === 'unresolved') return node.operation.reason
  if (node.operation.kind === 'constant')
    return 'Use the fixed value defined for this field.'
  if (node.operation.kind === 'copy') return 'Use the input value without changing it.'
  const code = node.operation.definition.operationCode
  if (code === 'serialise-curated-record')
    return 'Package the SaanSeoi curated archive record for import.'
  if (code === 'curated-source-property')
    return 'Keep the original property from the SaanSeoi curated record as source evidence.'
  if (code === 'publisher-source-retention')
    return 'Keep the publisher’s original data as source evidence.'
  if (code === 'curated-area-prepared-field')
    return `Read ${readablePath(node.output.path)} from the SaanSeoi curated archive, decoding stored text when needed.`
  const retained = definition.definitions[node.operation.definition.definitionId]
  if (retained && typeof retained === 'object') {
    const document = retained as Record<string, unknown>
    if (typeof document.summary === 'string') return document.summary
    if (
      typeof document.expression === 'string' &&
      document.expression.startsWith('calculateGeoJsonBbox(')
    )
      return 'Calculate the bounding box from the validated geometry.'
    if (
      typeof document.expression === 'string' &&
      /^Select .+ from the parsed reviewed record/.test(document.expression)
    )
      return `Read ${readablePath(node.output.path)} from the SaanSeoi curated record.`
  }
  return `Produce ${readablePath(node.output.path)} using the retained processing rule.`
}

/** Prepared/raw scopes inherit their source identity through the exact release binding. */
export function provenanceScopeLabels(
  definition: LineageDefinition,
  binding: ReleaseBinding | null,
  datasetNames: Record<string, string>,
): Record<string, string> {
  const pins = new Map((binding?.scopes ?? []).map(scope => [scope.scopeId, scope]))
  return Object.fromEntries(
    definition.scopes.map(scope => {
      const pin = pins.get(scope.id)
      const source =
        scope.kind === 'source-release'
          ? scope
          : definition.scopes.find(
              candidate =>
                candidate.kind === 'source-release' &&
                pin?.resourceReleaseId &&
                pins.get(candidate.id)?.resourceReleaseId === pin.resourceReleaseId,
            )
      if (!source)
        return [
          scope.id,
          scope.resourceType
            ? readablePath(scope.resourceType)
            : scope.kind.replaceAll('-', ' '),
        ]
      const name =
        datasetNames[source.sourceDatasetId ?? ''] ?? source.datasetCode ?? 'Source'
      const peers = definition.scopes.filter(
        candidate =>
          candidate.kind === 'source-release' &&
          candidate.sourceDatasetId === source.sourceDatasetId &&
          candidate.resourceType === source.resourceType,
      )
      return [
        scope.id,
        `${name} · ${readablePath(source.resourceType ?? 'records')}${peers.length > 1 ? ` · input ${peers.findIndex(candidate => candidate.id === source.id) + 1}` : ''}`,
      ]
    }),
  )
}

export type ReverseBranch =
  | {
      kind: 'node'
      node: Node
      human?: HumanOperation
      reference: string
      children: ReverseBranch[]
    }
  | { kind: 'field'; field: FieldPlan; source?: FieldRef; sources?: HumanSourceUse[] }
  | { kind: 'reference'; id: string; reference: string }
  | { kind: 'source'; input: import('@repo/db/fieldLineageTypes').FieldRef }
  | { kind: 'choice'; id: string; children: ReverseBranch[] }
  | { kind: 'missing'; id: string }

/** Walk consumers to their value producers. Controls belong to conditions, not value edges. */
export function reverseFieldFlow(definition: LineageDefinition, terminalNode: string) {
  const nodes = new Map(definition.nodes.map(node => [node.id, node]))
  const groups = new Map(definition.resolutionGroups.map(group => [group.id, group]))
  const references = new Map<string, string>()
  const visited = new Set<string>()
  const selectedField = definition.fields?.find(
    field => field.terminalNode === terminalNode,
  )
  const targetField = selectedField?.apiField.replace(/^attributes\./, '')
  function sourceOf(node: Node, seen = new Set<string>()): FieldRef | undefined {
    if (seen.has(node.id)) return
    seen.add(node.id)
    for (const input of Object.values(node.inputs)) {
      if (input.role !== 'value') continue
      if ('scope' in input && input.stage === 'raw') return input
      if ('node' in input) {
        const upstream = nodes.get(input.node)
        const source = upstream && sourceOf(upstream, seen)
        if (source) return source
      }
    }
  }
  const passing = new Set<string>()
  const sourceInputs = new Set<string>()
  function visit(id: string, reference: string): ReverseBranch {
    if (visited.has(id))
      return { kind: 'reference', id, reference: references.get(id)! }
    let node = nodes.get(id)
    if (!node) return { kind: 'missing', id }
    // Only link published fields in the same resource and variant. Keep same-field
    // preparation steps inline, and never guess across collections or variants.
    const outputField = node.output?.path
      .replace(/^record\./, '')
      .replace(/^attributes\./, '')
    const outputScopeId = node.output?.scope
    const outputScope = definition.scopes?.find(scope => scope.id === outputScopeId)
    // Prepared/raw scope IDs are allocated from their publisher scope by the
    // compiler. resourceType is optional on those scopes, so use their owner.
    const outputResource =
      outputScope?.resourceType ??
      definition.scopes?.find(
        scope =>
          scope.kind === 'source-release' &&
          (outputScopeId === `${scope.id}-prepared` ||
            outputScopeId === `${scope.id}-raw`),
      )?.resourceType
    if (
      selectedField &&
      node.stage !== 'composition' &&
      outputField !== targetField &&
      outputResource === selectedField.resourceType
    ) {
      const candidates = definition.fields.filter(
        field =>
          field.resourceType === selectedField.resourceType &&
          (field.variant ?? null) === (selectedField.variant ?? null) &&
          (field.operationId ?? null) === (selectedField.operationId ?? null) &&
          field.apiField.replace(/^attributes\./, '') === outputField,
      )
      if (candidates.length === 1) {
        const sources =
          node.operation?.kind === 'resolver'
            ? (
                definition.definitions[node.operation.definition.definitionId] as {
                  human?: { sources?: HumanSourceUse[] }
                }
              )?.human?.sources
            : undefined
        return {
          kind: 'field',
          field: candidates[0]!,
          source: sourceOf(node),
          ...(sources ? { sources } : {}),
        }
      }
    }

    const scope = (
      node.operation?.kind === 'resolver'
        ? (definition.definitions[node.operation.definition.definitionId] as {
            human?: { fieldScope?: { fields: string[]; otherwiseInput: string } }
          })
        : undefined
    )?.human?.fieldScope
    if (
      targetField &&
      scope &&
      !scope.fields.some(pattern =>
        pattern.endsWith('.*')
          ? targetField.startsWith(pattern.slice(0, -1))
          : pattern === targetField,
      )
    ) {
      const input = node.inputs[scope.otherwiseInput]
      if (input && 'node' in input && !passing.has(id)) {
        passing.add(id)
        const result = visit(input.node, reference)
        passing.delete(id)
        return result
      }
    }
    const human =
      node.operation?.kind === 'resolver'
        ? (
            definition.definitions[node.operation.definition.definitionId] as {
              human?: HumanOperation
            }
          )?.human
        : undefined
    const view = human?.fieldViews?.find(
      view =>
        targetField &&
        view.fields.some(pattern =>
          pattern.endsWith('.*')
            ? targetField.startsWith(pattern.slice(0, -1))
            : targetField === pattern,
        ),
    )
    if (view?.inputs)
      node = {
        ...node,
        inputs: Object.fromEntries(
          Object.entries(node.inputs).filter(([name]) => view.inputs!.includes(name)),
        ),
      }
    visited.add(id)
    references.set(id, reference)
    const children: ReverseBranch[] = []
    const linkedFields = selectedField
      ? (human?.fieldDependencies ?? []).flatMap(name => {
          const matches = definition.fields.filter(
            field =>
              field.resourceType === selectedField.resourceType &&
              (field.variant ?? null) === (selectedField.variant ?? null) &&
              (field.operationId ?? null) === (selectedField.operationId ?? null) &&
              field.apiField.replace(/^attributes\./, '') === name &&
              field.terminalNode !== terminalNode,
          )
          return matches.length === 1 ? matches : []
        })
      : []
    for (const field of linkedFields)
      children.push({ kind: 'field', field, source: sourceOf(node) })
    const dependencies =
      linkedFields.length === human?.fieldDependencies?.length
        ? []
        : Object.values(node.inputs).filter(input => input.role === 'value')
    for (const [index, input] of dependencies.entries()) {
      const next = `${Number.parseInt(reference, 10) + 1}${reference.replace(/^\d+/, '')}${dependencies.length > 1 ? String.fromCharCode(97 + index) : ''}`
      if ('node' in input) children.push(visit(input.node, next))
      else if ('group' in input) {
        const group = groups.get(input.group)
        if (!group?.candidates.length) {
          children.push({ kind: 'missing', id: input.group })
          continue
        }
        const candidates = [...group.candidates].sort((a, b) => {
          const left = nodes.get(a),
            right = nodes.get(b)
          if (!left || !right) return 0
          return (
            definition.resolution.layerOrder.indexOf(right.layer) -
              definition.resolution.layerOrder.indexOf(left.layer) ||
            left.priority - right.priority
          )
        })
        if (candidates.length === 1) children.push(visit(candidates[0]!, next))
        else
          children.push({
            kind: 'choice',
            id: group.id,
            children: candidates.map((candidate, i) =>
              visit(candidate, `${next}${String.fromCharCode(97 + i)}`),
            ),
          })
      } else {
        const key = JSON.stringify([
          input.stage,
          input.scope,
          input.collection,
          input.path,
        ])
        if (!sourceInputs.has(key)) {
          sourceInputs.add(key)
          children.push({ kind: 'source', input })
        }
      }
    }
    return {
      kind: 'node',
      node,
      ...(view && human ? { human: { ...human, ...view } } : {}),
      reference,
      children,
    }
  }
  const root = visit(terminalNode, '1')
  const evidence = traceNodes(definition, terminalNode).filter(
    node => !visited.has(node.id),
  )
  for (const [index, node] of evidence.entries())
    references.set(node.id, `Evidence ${index + 1}`)
  return { root, references, evidence }
}

export function operationExplanation(node: Node, definition: LineageDefinition) {
  if (node.operation.kind !== 'resolver') return undefined
  const document = definition.definitions[node.operation.definition.definitionId] as
    | { explanation?: import('@repo/db/fieldLineageExplanation').OperationExplanation }
    | undefined
  return document?.explanation
}

export function nodeStageLabel(node: Node, definition: LineageDefinition) {
  const scope = definition.scopes.find(scope => scope.id === node.output.scope)
  if (scope?.kind === 'response') return 'API response'
  if (scope?.kind === 'snapshot') return 'Snapshot'
  return {
    preparation: 'Preprocess publisher artefact',
    ingestion: 'Source record',
    assembly: 'Resolve field',
    composition: 'API response',
  }[node.stage]
}
