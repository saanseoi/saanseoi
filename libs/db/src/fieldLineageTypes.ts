/** Shared, immutable API lineage contract. Release identities belong to ReleaseBinding. */
export type Stage = 'preparation' | 'ingestion' | 'assembly' | 'composition'
export type Layer = 'baseline' | 'conditional-rule' | 'curation' | 'patch'
export type AuditCategory = 'rules' | 'curations' | 'translations' | 'patches'

export type FieldRef = {
  stage:
    | Stage
    | 'raw'
    | 'prepared'
    | 'source'
    | 'canonical'
    | 'request'
    | 'registry'
    | 'audit'
  scope: string // Refers to a declared input scope; never an implicit current dataset.
  collection: string
  path: string // Structured selector vocabulary, not a descriptive phrase.
  role: 'value' | 'condition' | 'join-key' | 'selection' | 'guard' | 'evidence'
}

export type DefinitionRef = {
  store:
    | 'processingRuleDefinitions'
    | 'responseRuleDefinitions'
    | 'curationDefinitions'
    | 'lineageRuleDefinitions'
  definitionId: string // Hash of the retained immutable document.
  operationCode: string
  ruleId: string
  branchId?: string
}

export type Condition =
  | { kind: 'unresolved'; reason: string }
  | { kind: 'always' }
  | { kind: 'all' | 'any'; conditions: Condition[] }
  | { kind: 'not'; condition: Condition }
  | {
      kind: 'compare'
      input: string
      operator: 'eq' | 'in' | 'exists' | 'matches'
      value?: unknown
    }
  | { kind: 'predicate'; definition: DefinitionRef; arguments: Record<string, string> }

export type Operation =
  | { kind: 'unresolved'; reason: string; definitionIds: string[] }
  | { kind: 'copy'; input: string }
  | { kind: 'constant'; value: unknown }
  | {
      kind: 'resolver'
      definition: DefinitionRef
      arguments: Record<string, string>
      parameters: Record<string, unknown>
    }

export type Node = {
  id: string
  stage: Stage
  output: { scope: string; collection: string; path: string }
  layer: Layer
  priority: number // Lower wins within one layer and one output resolution group.
  audit: {
    category: AuditCategory // Independent of layer and execution scope.
    scope: 'bulk' | 'individual'
    retention: 'definition-only' | 'counts' | 'reviewed-mapping' | 'decision'
    binding?: {
      owner: string
      recordKeyInputs: string[]
      fixturePointer?: string
      outputSelector: string
      evidenceContract: 'processing-audit' | 'processing-result'
      recordedEffectPointer?: string // Only when the retained evidence actually has effects.
    }
  }
  inputs: Record<
    string,
    | FieldRef
    | { node: string; role: FieldRef['role'] }
    | { group: string; role: FieldRef['role'] }
  >
  when: Condition
  selection?: {
    cardinality: 'one' | 'optional-one' | 'many' | 'many-to-one' | 'one-to-many'
    definition: DefinitionRef
    joinKeys: string[]
    orderBy: Array<{ input: string; direction: 'ascending' | 'descending' }>
    onEmpty: 'omit' | 'null' | 'error' | 'empty-array'
    onMultiple: 'error' | 'retain-all' | 'select-by-order'
  }
  operation: Operation
  onAbsent: 'omit' | 'null' | 'error' | 'empty-array'
  onFailure: 'error' | 'omit' // A failed guard is never an implicit fallback.
}

export type FieldPlan = {
  resourceType: string // Includes document/operation outputs, not only DB resource types.
  apiField: string
  variant?: string
  operationId?: string
  discriminator?: Record<string, unknown> // Required for mixed included resource unions.
  emitWhen: Condition // Uses terminalNode inputs: profiles, locales, includes and request direction.
  terminalNode: string
  provenance: Record<Stage, string[]> // Dependency closure; nodes are retained once.
  completeness: 'complete' | 'unknown-upstream'
  dynamicSelectors?: Array<{
    parameter: string // A named path segment, never unescaped textual substitution.
    scopeId: string
    domainRole: string // Resolves one release-pinned selector domain.
    recordBinding?: { collection: string; hashPath?: string; keyPath: string }
  }>
}

/** Normalised expansion domain retained alongside its schema/mapping evidence. */
export type SelectorDomain = {
  kind: 'field-lineage-selector-domain'
  scopeId: string
  role: string
  evidence: Array<{
    definitionHash: string
    pointer: string // JSON Pointer into the retained schema/mapping/recipe.
  }>
  members: Array<{
    key: string // Output map key, e.g. populationMidYear or zh-hant.
    inputPath: string[] // Exact input segments, including publisher mapping key.
    evidencePointer: string
  }>
}

export type LineageDefinition = {
  kind: 'api-response-lineage-definition'
  schemaVersion: 2
  api: { version: string; responseSchemaVersion: string; responseSchemaHash: string }
  definitions: Record<string, unknown> // Retained documents addressed by their content hash.
  sourceSchemas: Array<{
    scopeId: string
    sourceDatasetId: string
    sourceSchemaVersion: string
  }>
  scopes: Array<{
    id: string
    kind:
      | 'response'
      | 'snapshot'
      | 'source-release'
      | 'prepared-artefact'
      | 'raw-asset'
      | 'curation'
      | 'request'
      | 'registry'
      | 'audit'
      | 'upstream-lineage'
    resourceType?: string
    datasetCode?: string // Only an input qualifier. No dataset owner at the root.
    schemaVersion?: string
    schemaHash?: string
    sourceDatasetId?: string
    bindingRole: string // Resolves through the release binding, not latest/global state.
  }>
  resolution: {
    layerOrder: ['baseline', 'conditional-rule', 'curation', 'patch']
    withinLayer: 'first-applicable'
    priorityOrder: 'ascending'
    onEqualPriorityConflict: 'error'
    validation: 'effective-output'
    // One universal order; later layers override earlier layers for declared outputs.
  }
  nodes: Node[]
  resolutionGroups: Array<{
    id: string
    output: Node['output']
    candidates: string[] // Node IDs for this one output; consumers read the group winner.
    evaluation: 'per-record' | 'per-group' | 'per-request'
    keyInputs: FieldRef[] // Partition repeated output paths by immutable identity/locale.
  }>
  fields: FieldPlan[]
}

/** Exact runtime context is separate from the reusable content-addressed definition. */
export type ReleaseBinding = {
  apiReleaseSetId: string
  definitionId: string
  apiVersionReleaseSetId: string
  apiCatalogRevisionId?: string
  scopes: Array<{
    scopeId: string
    snapshotId?: string
    snapshotIds?: string[]
    snapshotRecipeIds?: string[]
    sourceReleaseId?: string
    resourceReleaseId?: string
    snapshotRecipeId?: string
    assetHash?: string
    auditManifestHash?: string
    processingManifest?: { hash: string; byteLength: number }
    upstreamDefinitionId?: string
    companionApiReleaseSetId?: string
    sourceSchemaVersion?: string
    canonicalSchemaVersion?: string
    definitionHashes?: string[]
    selectorDomains?: Array<{ role: string; definitionHash: string }>
    dependency?: {
      ownerScopeId: string
      ownerSnapshotIds: string[]
      role: string
    }
  }>
}
