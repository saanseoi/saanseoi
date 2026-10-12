import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import type { LineageDefinition } from '../../src/fieldLineageTypes'

const root = resolve(import.meta.dir, '../../../..')
process.chdir(root)
const folder = resolve(root, '.local/reports/field-lineage')
const authored = new Set(['implementation-templates', 'surface-plans', 'examples'])
const read = (name: string) =>
  JSON.parse(
    readFileSync(
      resolve(
        authored.has(name) ? resolve(import.meta.dir, 'inputs') : folder,
        `${name}.json`,
      ),
      'utf8',
    ),
  )
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
const schemas = read('response-contracts')
const implementations = read('implementation-shapes')
const contracts: Array<{
  id: string
  fields: Array<{ path: string; boundary?: string }>
}> = [...schemas.contracts, ...implementations.contracts]
const plans: Array<{
  contractId: string
  apiField: string
  templateId: string
  resourceBranches: Array<{ templateId: string }>
}> = read('field-plans').plans
const templates: Array<{ id: string; evidence: Array<{ file: string }> }> = read(
  'implementation-templates',
).templates
const templateIds = new Set<string>(templates.map((t: { id: string }) => t.id))
const wanted = new Set<string>()
for (const contract of contracts) {
  for (const field of contract.fields)
    wanted.add(`${contract.id}\0${field.path || '$'}`)
}
const actual = new Set<string>()
for (const plan of plans) {
  const key = `${plan.contractId}\0${plan.apiField}`
  assert(!actual.has(key), `Duplicate field plan ${key}`)
  assert(wanted.has(key), `Unknown field plan ${key}`)
  assert(templateIds.has(plan.templateId), `Unknown template ${plan.templateId}`)
  for (const branch of plan.resourceBranches)
    assert(
      templateIds.has(branch.templateId),
      `Unknown union template ${branch.templateId}`,
    )
  actual.add(key)
}
assert(
  actual.size === wanted.size,
  `Incomplete selector coverage: ${actual.size}/${wanted.size}`,
)
for (const template of templates)
  for (const evidence of template.evidence)
    assert(existsSync(evidence.file), `Missing evidence ${evidence.file}`)
for (const surface of read('surface-plans').plans) {
  assert(
    templateIds.has(surface.templateId),
    `Unknown surface template ${surface.templateId}`,
  )
  assert(
    existsSync(surface.evidenceFile),
    `Missing surface evidence ${surface.evidenceFile}`,
  )
}
for (const evidence of read('evidence-manifest').files) {
  const current = createHash('sha256').update(readFileSync(evidence.file)).digest('hex')
  assert(
    current === evidence.sha256,
    `Evidence changed: ${evidence.file}; regenerate inventory`,
  )
}

for (const example of read('examples').examples as Array<{
  id: string
  generationReady: boolean
  definition: LineageDefinition
}>) {
  assert(
    example.generationReady === false,
    `${example.id}: symbolic examples must not claim generation readiness`,
  )
  const d = example.definition
  const scopes = new Set(d.scopes.map(s => s.id))
  const nodes = new Map(d.nodes.map(n => [n.id, n]))
  const groups = new Map(d.resolutionGroups.map(g => [g.id, g]))
  assert(scopes.size === d.scopes.length, `${example.id}: duplicate scopes`)
  assert(nodes.size === d.nodes.length, `${example.id}: duplicate nodes`)
  assert(groups.size === d.resolutionGroups.length, `${example.id}: duplicate groups`)
  for (const group of d.resolutionGroups) {
    assert(group.candidates.length > 0, `${group.id}: empty resolution group`)
    for (const candidate of group.candidates) {
      const node = nodes.get(candidate)
      assert(node, `${group.id}: missing candidate ${candidate}`)
      assert(
        JSON.stringify(node.output) === JSON.stringify(group.output),
        `${group.id}: incompatible output ${candidate}`,
      )
    }
    for (const input of group.keyInputs)
      assert(scopes.has(input.scope), `${group.id}: unknown partition scope`)
  }
  const dependencies = (id: string): string[] => {
    const node = nodes.get(id)
    assert(node, `Unknown node ${id}`)
    return Object.values(node.inputs).flatMap(input =>
      'node' in input
        ? [input.node]
        : 'group' in input
          ? (groups.get(input.group)?.candidates ?? [])
          : [],
    )
  }
  for (const node of d.nodes) {
    assert(scopes.has(node.output.scope), `${node.id}: unknown output scope`)
    assert(
      Number.isInteger(node.priority) && node.priority >= 0,
      `${node.id}: invalid priority`,
    )
    for (const input of Object.values(node.inputs)) {
      if ('node' in input)
        assert(nodes.has(input.node), `${node.id}: unknown input node`)
      else if ('group' in input)
        assert(groups.has(input.group), `${node.id}: unknown group`)
      else assert(scopes.has(input.scope), `${node.id}: unknown input scope`)
    }
    const inputNames = new Set(Object.keys(node.inputs))
    if (node.operation.kind === 'copy')
      assert(inputNames.has(node.operation.input), `${node.id}: unknown copy input`)
    if (node.operation.kind === 'resolver')
      for (const input of Object.values(node.operation.arguments))
        assert(inputNames.has(input), `${node.id}: unknown resolver argument ${input}`)
    function condition(c: typeof node.when) {
      if (c.kind === 'compare')
        assert(inputNames.has(c.input), `${node.id}: unknown condition input`)
      if (c.kind === 'predicate')
        for (const input of Object.values(c.arguments))
          assert(inputNames.has(input), `${node.id}: unknown predicate argument`)
      if (c.kind === 'all' || c.kind === 'any') c.conditions.forEach(condition)
      if (c.kind === 'not') condition(c.condition)
    }
    condition(node.when)
  }
  const closure = (
    id: string,
    active = new Set<string>(),
    found = new Set<string>(),
  ) => {
    assert(!active.has(id), `${example.id}: dependency cycle at ${id}`)
    if (found.has(id)) return found
    active.add(id)
    for (const dependency of dependencies(id)) closure(dependency, active, found)
    active.delete(id)
    found.add(id)
    return found
  }
  for (const node of d.nodes) closure(node.id)
  for (const field of d.fields) {
    const required = closure(field.terminalNode)
    const declared = new Set(Object.values(field.provenance).flat())
    assert(
      required.size === declared.size && [...required].every(id => declared.has(id)),
      `${example.id}: incorrect stage closure ${field.apiField}`,
    )
    for (const [stage, ids] of Object.entries(field.provenance))
      for (const id of ids)
        assert(nodes.get(id)?.stage === stage, `${example.id}: wrong stage for ${id}`)
  }
}
const counts = new Map<string, number>()
for (const plan of plans)
  counts.set(plan.templateId, (counts.get(plan.templateId) ?? 0) + 1)
const boundaries = new Map<string, number>()
for (const contract of contracts)
  for (const field of contract.fields)
    if (field.boundary)
      boundaries.set(field.boundary, (boundaries.get(field.boundary) ?? 0) + 1)
const report = {
  kind: 'field-lineage-review-validation',
  schemaVersion: 1,
  responseContracts: schemas.contracts.length,
  implementationShapes: implementations.contracts.length,
  responseSchemaUses: schemas.endpoints.length,
  selectorPlans: plans.length,
  templates: templates.length,
  sourceFixtureDocuments: read('source-fixture-review').fixtures.length,
  processingRuleDeclarations: read('processing-policy-review').rules.length,
  supplementalSurfaces: read('surface-plans').plans.length,
  templateCounts: Object.fromEntries([...counts].sort()),
  shapeBoundaries: Object.fromEntries([...boundaries].sort()),
  result: 'review-artefacts-valid',
  implementationScope: 'base-index-and-detail-resource-fields',
  limitation:
    'Inventory coverage, symbolic example structure and evidence freshness only; compiler correspondence is checked separately and this does not establish published execution outcomes. Search, changes, geocoding, SOURCE and other supplementary surfaces are deferred.',
}
writeFileSync(`${folder}/validation.json`, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
