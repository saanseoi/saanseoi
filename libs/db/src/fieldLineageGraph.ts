import { computeVersionHash } from './versioning'
import type {
  Condition,
  DefinitionRef,
  FieldPlan,
  LineageDefinition,
  Node,
  ReleaseBinding,
} from './fieldLineageTypes'

export const FIELD_LINEAGE_RESOLUTION = {
  layerOrder: ['baseline', 'conditional-rule', 'curation', 'patch'],
  withinLayer: 'first-applicable',
  priorityOrder: 'ascending',
  onEqualPriorityConflict: 'error',
  validation: 'effective-output',
} as const
const stages = ['preparation', 'ingestion', 'assembly', 'composition'] as const
function requireValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}

/** A definition reference is valid only when its exact document was retained. */
function validateReference(definition: LineageDefinition, ref: DefinitionRef) {
  requireValue(
    definition.definitions[ref.definitionId],
    `Missing retained rule ${ref.definitionId}`,
  )
  requireValue(
    ref.operationCode && ref.ruleId,
    'Rule references require an operation and rule ID.',
  )
}

export function fieldLineageClosure(
  definition: LineageDefinition,
  terminalNode: string,
): FieldPlan['provenance'] {
  const nodes = new Map(definition.nodes.map(node => [node.id, node]))
  const groups = new Map(definition.resolutionGroups.map(group => [group.id, group]))
  const seen = new Set<string>(),
    visiting = new Set<string>()
  const result: FieldPlan['provenance'] = {
    preparation: [],
    ingestion: [],
    assembly: [],
    composition: [],
  }
  const visit = (id: string) => {
    requireValue(!visiting.has(id), `Cyclic field lineage at ${id}`)
    if (seen.has(id)) return
    const node = nodes.get(id)
    requireValue(node, `Missing lineage node ${id}`)
    visiting.add(id)
    for (const input of Object.values(node.inputs)) {
      if ('node' in input) visit(input.node)
      if ('group' in input) {
        const group = groups.get(input.group)
        requireValue(group, `Missing resolution group ${input.group}`)
        for (const candidate of group.candidates) visit(candidate)
      }
    }
    visiting.delete(id)
    seen.add(id)
    result[node.stage].push(id)
  }
  visit(terminalNode)
  for (const stage of stages) result[stage].sort()
  return result
}

export function validateFieldLineageDefinition(definition: LineageDefinition) {
  requireValue(
    definition.kind === 'api-response-lineage-definition' &&
      definition.schemaVersion === 2,
    'Unsupported field lineage definition.',
  )
  requireValue(
    computeVersionHash(definition.resolution) ===
      computeVersionHash(FIELD_LINEAGE_RESOLUTION),
    'Field lineage requires the universal precedence policy.',
  )
  for (const [hash, document] of Object.entries(definition.definitions))
    requireValue(
      hash === computeVersionHash(document),
      `Retained lineage document hash mismatch: ${hash}`,
    )
  requireValue(
    Object.hasOwn(definition.definitions, definition.api.responseSchemaHash),
    'Missing retained API response definition.',
  )
  const scopes = new Map(definition.scopes.map(scope => [scope.id, scope]))
  const nodes = new Map(definition.nodes.map(node => [node.id, node]))
  const groups = new Map(definition.resolutionGroups.map(group => [group.id, group]))
  requireValue(
    scopes.size === definition.scopes.length &&
      nodes.size === definition.nodes.length &&
      groups.size === definition.resolutionGroups.length,
    'Duplicate lineage identifiers.',
  )
  for (const pin of definition.sourceSchemas) {
    const scope = scopes.get(pin.scopeId)
    requireValue(
      scope &&
        pin.sourceSchemaVersion &&
        pin.sourceDatasetId === scope.sourceDatasetId &&
        pin.sourceSchemaVersion === scope.schemaVersion,
      'Invalid source schema scope pin.',
    )
  }
  const sourcePins = new Set(definition.sourceSchemas.map(pin => pin.scopeId))
  requireValue(
    sourcePins.size === definition.sourceSchemas.length,
    'Duplicate source schema pin.',
  )
  for (const scope of scopes.values())
    if (scope.kind === 'source-release')
      requireValue(sourcePins.has(scope.id), `Missing source schema pin ${scope.id}`)
  const checkCondition = (condition: Condition, inputs: Node['inputs']) => {
    if (condition.kind === 'unresolved')
      requireValue(
        condition.reason.trim(),
        'An unresolved condition requires a reason.',
      )
    else if (condition.kind === 'all' || condition.kind === 'any')
      for (const child of condition.conditions) checkCondition(child, inputs)
    else if (condition.kind === 'not') checkCondition(condition.condition, inputs)
    else if (condition.kind === 'compare') {
      requireValue(
        Object.hasOwn(inputs, condition.input),
        `Unknown condition input ${condition.input}`,
      )
      if (condition.operator !== 'exists')
        requireValue(Object.hasOwn(condition, 'value'), 'Comparison requires a value.')
    } else if (condition.kind === 'predicate') {
      validateReference(definition, condition.definition)
      for (const name of Object.values(condition.arguments))
        requireValue(Object.hasOwn(inputs, name), `Unknown predicate input ${name}`)
    }
  }
  for (const group of groups.values()) {
    requireValue(
      group.candidates.length &&
        new Set(group.candidates).size === group.candidates.length,
      `Invalid group ${group.id}`,
    )
    for (const id of group.candidates)
      requireValue(
        nodes.has(id) &&
          computeVersionHash(nodes.get(id)!.output) ===
            computeVersionHash(group.output),
        `Incompatible group output ${id}`,
      )
    for (const input of group.keyInputs)
      requireValue(scopes.has(input.scope), `Unknown partition scope ${input.scope}`)
  }
  for (const node of nodes.values()) {
    requireValue(
      scopes.has(node.output.scope),
      `Unknown output scope ${node.output.scope}`,
    )
    requireValue(
      Number.isInteger(node.priority) &&
        node.priority >= 0 &&
        FIELD_LINEAGE_RESOLUTION.layerOrder.includes(node.layer),
      `Invalid priority/layer ${node.id}`,
    )
    requireValue(
      node.layer !== 'patch' || node.audit.retention === 'decision',
      'Patches require specific decision evidence.',
    )
    requireValue(
      node.audit.scope !== 'individual' || node.audit.retention === 'decision',
      'Individual audit requires a reviewed decision.',
    )
    requireValue(
      node.layer !== 'conditional-rule' ||
        (node.audit.scope === 'bulk' && node.audit.retention === 'counts'),
      'Automatic conditional rules retain aggregate counts.',
    )
    requireValue(
      node.audit.category !== 'rules' || node.audit.retention !== 'decision',
      'Automatic code rules cannot retain individual decisions.',
    )
    if (node.audit.retention === 'decision') {
      const binding = node.audit.binding
      requireValue(
        binding?.owner && binding.outputSelector && binding.recordKeyInputs.length,
        'Specific decisions require an audit owner, output and record keys.',
      )
      for (const input of binding.recordKeyInputs)
        requireValue(
          Object.hasOwn(node.inputs, input),
          `Unknown audit record key ${input}`,
        )
    }
    requireValue(
      !node.audit.binding?.recordedEffectPointer ||
        node.audit.binding.evidenceContract === 'processing-result',
      'Processing audit does not imply replayable effects.',
    )
    for (const input of Object.values(node.inputs)) {
      if ('node' in input)
        requireValue(nodes.has(input.node), `Missing input node ${input.node}`)
      else if ('group' in input)
        requireValue(groups.has(input.group), `Missing input group ${input.group}`)
      else requireValue(scopes.has(input.scope), `Unknown input scope ${input.scope}`)
    }
    checkCondition(node.when, node.inputs)
    if (node.operation.kind === 'copy')
      requireValue(
        Object.hasOwn(node.inputs, node.operation.input),
        `Unknown copy input ${node.operation.input}`,
      )
    if (node.operation.kind === 'resolver') {
      validateReference(definition, node.operation.definition)
      for (const name of Object.values(node.operation.arguments))
        requireValue(Object.hasOwn(node.inputs, name), `Unknown resolver input ${name}`)
    }
    if (node.operation.kind === 'unresolved') {
      requireValue(
        node.operation.reason.trim(),
        'An unresolved operation requires a reason.',
      )
      for (const id of node.operation.definitionIds)
        requireValue(
          definition.definitions[id],
          `Missing unresolved-operation evidence ${id}`,
        )
    }
    if (node.selection) {
      validateReference(definition, node.selection.definition)
      for (const name of [
        ...node.selection.joinKeys,
        ...node.selection.orderBy.map(order => order.input),
      ])
        requireValue(
          Object.hasOwn(node.inputs, name),
          `Unknown selection input ${name}`,
        )
    }
    fieldLineageClosure(definition, node.id)
  }
  const fields = new Set<string>()
  for (const field of definition.fields) {
    const key = JSON.stringify([
      field.resourceType,
      field.apiField,
      field.variant,
      field.operationId,
      field.discriminator,
    ])
    requireValue(!fields.has(key), `Duplicate lineage field ${key}`)
    fields.add(key)
    const terminal = nodes.get(field.terminalNode)
    requireValue(terminal, `Missing field terminal ${field.terminalNode}`)
    requireValue(
      terminal.stage === 'composition' &&
        terminal.output.path === field.apiField &&
        terminal.output.collection === field.resourceType,
      `Invalid field terminal ${field.apiField}`,
    )
    checkCondition(field.emitWhen, terminal.inputs)
    requireValue(
      computeVersionHash(field.provenance) ===
        computeVersionHash(fieldLineageClosure(definition, field.terminalNode)),
      `Incorrect stage closure ${field.apiField}`,
    )
    if (field.completeness === 'complete') {
      const closure = Object.values(field.provenance).flat()
      requireValue(
        !closure.some(
          id =>
            nodes.get(id)!.operation.kind === 'unresolved' ||
            unresolvedCondition(nodes.get(id)!.when),
        ) && !unresolvedCondition(field.emitWhen),
        `Complete field has unresolved processing: ${field.apiField}`,
      )
    }
    for (const selector of field.dynamicSelectors ?? [])
      requireValue(
        scopes.has(selector.scopeId),
        `Unknown dynamic selector scope ${selector.scopeId}`,
      )
  }
}

function unresolvedCondition(condition: Condition): boolean {
  if (condition.kind === 'unresolved') return true
  if (condition.kind === 'all' || condition.kind === 'any')
    return condition.conditions.some(unresolvedCondition)
  if (condition.kind === 'not') return unresolvedCondition(condition.condition)
  return false
}

/** Select among already evaluated applicable candidates; null output is still a winner. */
export function selectFieldLineageCandidate(
  candidates: Node[],
  applicable: (node: Node) => boolean,
) {
  const selected = candidates
    .filter(applicable)
    .sort(
      (a, b) =>
        FIELD_LINEAGE_RESOLUTION.layerOrder.indexOf(b.layer) -
          FIELD_LINEAGE_RESOLUTION.layerOrder.indexOf(a.layer) ||
        a.priority - b.priority,
    )
  const winner = selected[0],
    runnerUp = selected[1]
  if (
    winner &&
    runnerUp &&
    winner.layer === runnerUp.layer &&
    winner.priority === runnerUp.priority
  )
    throw new Error(
      `Conflicting applicable lineage candidates: ${winner.id}, ${runnerUp.id}`,
    )
  return winner ?? null
}

export function validateFieldLineageBinding(
  definition: LineageDefinition,
  binding: ReleaseBinding,
) {
  requireValue(
    binding.definitionId === computeVersionHash(definition),
    'Lineage release definition hash mismatch.',
  )
  requireValue(
    binding.apiReleaseSetId && binding.apiVersionReleaseSetId,
    'Lineage requires an API release context.',
  )
  const scopes = new Map(binding.scopes.map(scope => [scope.scopeId, scope]))
  requireValue(
    scopes.size === binding.scopes.length,
    'Duplicate release scope binding.',
  )
  for (const scope of definition.scopes) {
    if (scope.kind === 'request' || scope.kind === 'response') continue
    const bound = scopes.get(scope.id)
    requireValue(bound, `Missing release binding for ${scope.id}`)
    if (bound.dependency) {
      requireValue(
        scopes.has(bound.dependency.ownerScopeId) &&
          bound.dependency.role &&
          new Set(bound.dependency.ownerSnapshotIds).size ===
            bound.dependency.ownerSnapshotIds.length,
        `Invalid dependency binding ${scope.id}`,
      )
      requireValue(
        scope.kind === 'upstream-lineage',
        `Dependency binding requires an upstream scope ${scope.id}`,
      )
    }
    if (bound.processingManifest)
      requireValue(
        /^sha256:[a-f0-9]{64}$/.test(bound.processingManifest.hash) &&
          Number.isSafeInteger(bound.processingManifest.byteLength) &&
          bound.processingManifest.byteLength > 0,
        `Invalid processing manifest reference ${scope.id}`,
      )
    if (scope.kind === 'source-release')
      requireValue(
        bound.resourceReleaseId && bound.sourceSchemaVersion === scope.schemaVersion,
        `Invalid source release binding ${scope.id}`,
      )
    if (scope.kind === 'snapshot') {
      const ids = [bound.snapshotId, ...(bound.snapshotIds ?? [])].filter(
        (id): id is string => typeof id === 'string' && id.length > 0,
      )
      requireValue(
        ids.length > 0 && new Set(ids).size === ids.length,
        `Invalid snapshot binding ${scope.id}`,
      )
      requireValue(
        !(bound.snapshotId && bound.snapshotIds),
        `Conflicting snapshot binding ${scope.id}`,
      )
    }
    for (const hash of bound.definitionHashes ?? [])
      requireValue(
        Object.hasOwn(definition.definitions, hash),
        `Missing bound definition ${hash}`,
      )
    for (const pin of bound.selectorDomains ?? [])
      requireValue(
        definition.definitions[pin.definitionHash],
        `Missing retained selector domain ${pin.definitionHash}`,
      )
  }
  for (const id of scopes.keys())
    requireValue(
      definition.scopes.some(scope => scope.id === id),
      `Unknown bound scope ${id}`,
    )
}

export function expandFieldLineage(definition: LineageDefinition, field: FieldPlan) {
  const nodes = new Map(definition.nodes.map(node => [node.id, node]))
  return {
    ...field,
    provenance: Object.fromEntries(
      stages.map(stage => [
        stage,
        field.provenance[stage].map(id => structuredClone(nodes.get(id)!)),
      ]),
    ),
  }
}
