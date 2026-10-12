import ts from 'typescript'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { createHash } from 'node:crypto'

// Static contract inventory: do not import schema modules or execute fixture loaders.
const root = resolve(import.meta.dir, '../../../..')
process.chdir(root)
const output = resolve(root, '.local/reports/field-lineage')
mkdirSync(output, { recursive: true })
const config = ts.readConfigFile('apps/atlas-api/tsconfig.json', ts.sys.readFile)
if (config.error)
  throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, 'apps/atlas-api')
const program = ts.createProgram(parsed.fileNames, parsed.options)
const checker = program.getTypeChecker()
type Field = {
  path: string
  types: string[]
  optional: boolean
  boundary?: string
  variants: string[]
}
type Contract = {
  id: string
  file: string
  line: number
  fields: Field[]
  kind?: string
}
const contracts: Contract[] = []
const endpoints: Array<{
  file: string
  line: number
  schemaExpression: string
  contractId: string
}> = []

function fieldsOf(
  type: ts.Type,
  location: ts.Node,
  opaquePaths = new Set<string>(),
): Field[] {
  const found = new Map<string, Field>()
  let variants: string[] = []
  const active = new Set<ts.Type>()
  let visits = 0
  function add(path: string, value: ts.Type, optional: boolean, boundary?: string) {
    const text = checker.typeToString(value, location)
    const existing = found.get(path)
    if (existing) {
      if (!existing.types.includes(text)) existing.types.push(text)
      existing.optional ||= optional
      for (const variant of variants)
        if (!existing.variants.includes(variant)) existing.variants.push(variant)
      if (boundary) existing.boundary = boundary
    } else
      found.set(path, {
        path,
        types: [text],
        optional,
        variants: [...variants],
        ...(boundary ? { boundary } : {}),
      })
  }
  function walk(value: ts.Type, path: string, optional: boolean, depth: number) {
    if (opaquePaths.has(path)) {
      add(path, value, optional, 'dynamic-schema')
      return
    }
    if (active.has(value)) {
      add(path, value, optional, 'recursive')
      return
    }
    if (++visits > 5000) {
      add(path, value, optional, 'bounded-expansion')
      return
    }
    active.add(value)
    try {
      walkInner(value, path, optional, depth)
    } finally {
      active.delete(value)
    }
  }
  function walkInner(value: ts.Type, path: string, optional: boolean, depth: number) {
    if (depth > 16) {
      add(path, value, optional, 'recursive')
      return
    }
    if (value.isUnion()) {
      const members = value.types.filter(
        t =>
          !(
            t.flags &
            (ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Never)
          ),
      )
      const nullable = members.length !== value.types.length
      if (nullable) add(path, value, optional)
      for (const member of members) {
        const previous = variants
        const tag = member.getProperty('type')
        const tagType = tag && checker.getTypeOfSymbolAtLocation(tag, location)
        if (tagType?.isStringLiteral())
          variants = [...variants, `${path || '$'}.type=${tagType.value}`]
        walk(member, path, optional || nullable, depth + 1)
        variants = previous
      }
      return
    }
    if (checker.isTupleType(value)) {
      add(path, value, optional, 'tuple')
      return
    }
    if (
      checker.isArrayType(value) ||
      (value.getProperty('length') &&
        checker.getIndexTypeOfType(value, ts.IndexKind.Number) &&
        value.flags & ts.TypeFlags.Object)
    ) {
      add(path, value, optional, 'array')
      const member = checker.getIndexTypeOfType(value, ts.IndexKind.Number)
      if (member) walk(member, `${path}[]`, optional, depth + 1)
      return
    }
    if (value.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
      add(path, value, optional, 'opaque')
      return
    }
    if (!(value.flags & ts.TypeFlags.Object)) {
      add(path, value, optional)
      return
    }
    const properties = value.getProperties().filter(p => !p.name.startsWith('__'))
    const index = checker.getIndexTypeOfType(value, ts.IndexKind.String)
    if (path) add(path, value, optional, index ? 'dynamic-map' : 'object')
    for (const property of properties) {
      const propertyType = checker.getTypeOfSymbolAtLocation(property, location)
      walk(
        propertyType,
        path ? `${path}.${property.name}` : property.name,
        optional || Boolean(property.flags & ts.SymbolFlags.Optional),
        depth + 1,
      )
    }
    if (index) walk(index, path ? `${path}.*` : '*', optional, depth + 1)
    if (!properties.length && !index) add(path, value, optional, 'opaque-object')
  }
  walk(type, '', false, 0)
  return [...found.values()].sort((a, b) => a.path.localeCompare(b.path))
}

function contractFor(node: ts.Node, id: string): Contract | undefined {
  const type = checker.getTypeAtLocation(node)
  const symbol = type.getProperty('_output')
  if (!symbol) return
  const fields = fieldsOf(checker.getTypeOfSymbolAtLocation(symbol, node), node)
  if (!fields.length) return
  const file = node.getSourceFile()
  const contract = {
    id,
    file: relative(root, file.fileName),
    line: file.getLineAndCharacterOfPosition(node.getStart()).line + 1,
    fields,
  }
  if (!contracts.some(c => c.id === id)) contracts.push(contract)
  return contract
}

for (const file of program.getSourceFiles()) {
  const name = relative(root, file.fileName)
  if (
    !/^apps\/atlas-api\/src\/(schema|routes)\//.test(name) ||
    /\.test\.|__snapshots__/.test(name)
  )
    continue
  function visit(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      /(?:Response|Resource|Error)Schema$/.test(node.name.text)
    )
      contractFor(node.name, `${name}#${node.name.text}`)
    if (ts.isPropertyAssignment(node) && node.name.getText(file) === 'schema') {
      let parent: ts.Node | undefined = node.parent
      let response = false
      while (parent) {
        if (
          ts.isPropertyAssignment(parent) &&
          parent.name.getText(file) === 'responses'
        ) {
          response = true
          break
        }
        parent = parent.parent
      }
      if (response) {
        const line = file.getLineAndCharacterOfPosition(node.getStart()).line + 1
        const contract = contractFor(node.initializer, `${name}#response:${line}`)
        if (contract)
          endpoints.push({
            file: name,
            line,
            schemaExpression: node.initializer.getText(file),
            contractId: contract.id,
          })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
}
// Loose/unknown OpenAPI schemas cannot enumerate registry and serializer fields.
// Retain static implementation return shapes as separate evidence, not API contracts.
const implementationFunctions: Record<string, string[]> = {
  'services/addresses.ts': [
    'createAddressResource',
    'createAddress3dResource',
    'getAddressUnits',
  ],
  'services/places.ts': ['createPlaceResource'],
  'services/divisionsPresentation.ts': [
    'createDivisionResource',
    'createIncludedDivisionGeometryResource',
  ],
  'services/statistics.ts': [
    'createStatisticResource',
    'createIncludedStatisticFieldResource',
  ],
  'services/statisticsRegistry.ts': [
    'fieldRegistryResource',
    'measureRegistryResource',
  ],
  'services/streets.ts': ['resource', 'publicChangelogEntry', 'publicAssetLinks'],
  'services/sourceRecords.ts': [
    'toSourceRecord',
    'getSourceRecordSchema',
    'listSourceReleases',
  ],
  'services/identityBridge.ts': ['listIdentityBridge'],
  'services/geocodingPresentation.ts': ['presentGeocoding'],
  'services/divisionChanges.ts': ['listDivisionChanges', 'getDivisionChangeDefinition'],
  'services/statisticsAggregates.ts': [
    'getStatisticsGeographies',
    'getStatisticsSeries',
  ],
}
const implementationShapes: Contract[] = []
const serializerExpressions: Array<{
  file: string
  line: number
  function: string
  property: string
  expression: string
}> = []
for (const file of program.getSourceFiles()) {
  const name = relative(root, file.fileName)
  const functions = implementationFunctions[name.replace('apps/atlas-api/src/', '')]
  const registry = name === 'libs/core/src/lib/db/metaRegistry.ts'
  if (!functions && !registry) continue
  function visit(node: ts.Node) {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      (functions?.includes(node.name.text) ||
        (registry && /^(listRegistry|getRegistry)/.test(node.name.text)))
    ) {
      const functionName = node.name.text
      function expressionVisit(child: ts.Node) {
        if (ts.isPropertyAssignment(child))
          serializerExpressions.push({
            file: name,
            line: file.getLineAndCharacterOfPosition(child.getStart()).line + 1,
            function: functionName,
            property: child.name.getText(file),
            expression: child.initializer.getText(file),
          })
        ts.forEachChild(child, expressionVisit)
      }
      if (node.body) expressionVisit(node.body)
      const signature = checker.getSignatureFromDeclaration(node)
      if (signature) {
        const returned = checker.getAwaitedType(
          checker.getReturnTypeOfSignature(signature),
        )
        if (returned) {
          const shapes = returned.isUnion() ? returned.types : [returned]
          const fields = shapes.flatMap(shape => {
            if (
              shape.flags &
              (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Never)
            )
              return []
            const body = shape.getProperty('body')
            return fieldsOf(
              body ? checker.getTypeOfSymbolAtLocation(body, node) : shape,
              node,
              new Set(functionName === 'getSourceRecordSchema' ? ['properties.*'] : []),
            )
          })
          const merged = new Map<string, Field>()
          for (const field of fields) {
            const previous = merged.get(field.path)
            if (!previous) merged.set(field.path, field)
            else {
              previous.types = [...new Set([...previous.types, ...field.types])]
              previous.variants = [
                ...new Set([...previous.variants, ...field.variants]),
              ]
              previous.optional ||= field.optional
            }
          }
          implementationShapes.push({
            id: `${name}#implementation:${node.name.text}`,
            file: name,
            line: file.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            fields: [...merged.values()],
            kind: 'implementation-return-shape',
          })
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
}
writeFileSync(
  resolve(output, 'implementation-shapes.json'),
  `${JSON.stringify({ kind: 'serializer-and-registry-return-shapes', schemaVersion: 1, limitations: ['Static implementation return types; opaque maps still require pinned dynamic-shape expansion.', 'A return shape is not evidence that every potential field is emitted for every request.'], contracts: implementationShapes }, null, 2)}\n`,
)
writeFileSync(
  resolve(output, 'serializer-expressions.json'),
  `${JSON.stringify({ kind: 'serializer-expression-evidence', schemaVersion: 1, note: 'Object-property syntax inside reviewed serializers/readers; includes query and helper arguments as well as outputs. Expressions require semantic tracing before they become rule inputs.', expressions: serializerExpressions }, null, 2)}\n`,
)
contracts.push(...implementationShapes)
contracts.sort((a, b) => a.id.localeCompare(b.id))
mkdirSync(output, { recursive: true })
writeFileSync(
  resolve(output, 'response-contracts.json'),
  `${JSON.stringify(
    {
      kind: 'field-lineage-response-contract-inventory',
      schemaVersion: 1,
      extraction: 'TypeScript Zod _output types; static, no fixture imports',
      limitations: [
        'Dynamic maps are wildcard selectors; unknown schemas are explicit opaque boundaries.',
        'Union paths are potential outputs, not simultaneous fields; parent selectors retain null and optional behaviour.',
        'Raw Response/c.json bodies without a response schema require the supplementary surface plans.',
      ],
      contracts: contracts.filter(c => !c.kind),
      endpoints,
    },
    null,
    2,
  )}\n`,
)
console.log(
  JSON.stringify({
    contracts: contracts.filter(c => !c.kind).length,
    implementationShapes: implementationShapes.length,
    responseSchemaUses: endpoints.length,
    selectors: contracts.reduce((n, c) => n + c.fields.length, 0),
  }),
)

function familyFor(file: string) {
  if (/divisionChanges|divisions\/changes/.test(file)) return 'division-changes'
  if (/divisionSearch|divisions\/v0\/search/.test(file)) return 'division-search'
  if (/geocoding/.test(file)) return 'geocoding'
  if (/identityBridge/.test(file)) return 'identity-bridge'
  if (/\/sources\.ts$|sourceRecords/.test(file)) return 'source-record'
  if (/\/statistics\/v0\/registry|statisticsRegistry/.test(file))
    return 'statistics-definition'
  if (/\/statistics/.test(file)) return 'statistics'
  if (/\/addresses/.test(file)) return 'addresses'
  if (/\/places/.test(file)) return 'places'
  if (/\/streets/.test(file)) return 'streets'
  if (/\/divisions|divisionsPresentation/.test(file)) return 'divisions'
  if (/\/assets|\/styles/.test(file)) return 'asset-style'
  if (/schema\/meta|routes\/v0\/(meta|probe)/.test(file)) return 'operational'
  return 'registry'
}

function templateFor(contract: Contract, field: Field, familyOverride?: string) {
  const family = familyOverride ?? familyFor(contract.file)
  const p = field.path
  const schemaExpression =
    endpoints.find(e => e.contractId === contract.id)?.schemaExpression ?? ''
  if (
    /ErrorSchema|ErrorResponseSchema|NotReadySchema|SearchErrors|ErrorResponse/.test(
      contract.id + schemaExpression,
    ) ||
    /(^|\.)(httpStatus|error|errors|issues)(\.|\[|$)/.test(p)
  )
    return 'error'
  if (
    /^jsonapi/.test(p) ||
    (/(^|\.)(type|version)$/.test(p) && field.types.every(t => /^"|^\d+$/.test(t)))
  )
    return 'constant'
  if (
    /^links|^jsonapi|^meta\.(page|filters|locales|profile|search)|nextCursor|cursor/.test(
      p,
    )
  )
    return 'request-envelope'
  if (
    /^meta\./.test(p) &&
    !['geocoding', 'division-changes', 'operational'].includes(family)
  )
    return 'release-metadata'
  if (
    family === 'operational' ||
    family === 'asset-style' ||
    family === 'identity-bridge' ||
    family === 'source-record' ||
    family === 'division-search' ||
    family === 'division-changes' ||
    family === 'geocoding' ||
    family === 'statistics-definition'
  )
    return family
  if (family === 'registry') return 'registry'
  if (/relationships/.test(p)) return 'relationships'
  if (
    /\.sources|\.identifiers|\.snapshotId|\.resourceReleaseId|\.createdAt|\.updatedAt/.test(
      p,
    ) ||
    /^(attributes\.)?(sources|identifiers|snapshotId|resourceReleaseId|createdAt|updatedAt)/.test(
      p,
    )
  )
    return 'provenance-metadata'
  if (/geometry|bbox/.test(p)) return 'geometry'
  if (/cartography/.test(p)) return 'cartography'
  if (/^id$|\bid$/.test(p) && !/\.attributes\.|^attributes\./.test(p)) return 'identity'
  if (family === 'divisions') {
    if (
      /GeometryResource/.test(contract.id) ||
      /isLand|isTerritorial|\.variant|\.divisionId|\.leftDivisionId|\.rightDivisionId|attributes\.type/.test(
        p,
      )
    )
      return 'geometry-type'
    if (/hierarchies/.test(p)) return 'division-hierarchy'
    if (/i18n/.test(p)) return 'division-names'
    return 'division-classification'
  }
  if (family === 'addresses') {
    if (
      /Address3d|\.units|unitCount|floorExpression|unitExpression|floorRef|unitRef|unitType|unitPortion/.test(
        `${contract.id} ${p}`,
      )
    )
      return 'address3d'
    return /i18n|formattedAddress/.test(p)
      ? 'address-localisation'
      : 'address-structure'
  }
  if (family === 'places') {
    if (/referenceName|i18n|brand|freeformAddress/.test(p)) return 'place-name'
    if (/taxonomy|basicCategory/.test(p)) return 'place-taxonomy'
    if (/address/i.test(p)) return 'place-address'
    return 'place-content'
  }
  if (family === 'statistics') {
    if (
      /GeographiesResponse|SeriesResponse/.test(contract.id) ||
      /Geograph|Series/.test(
        endpoints.find(e => e.contractId === contract.id)?.schemaExpression ?? '',
      )
    )
      return 'statistics-aggregate'
    if (/\.values|^attributes\.values/.test(p)) return 'statistics-values'
    if (
      /fieldDefinition|comparability|fieldName|measureCode|aggregation|unitCode|sourceField|periodicity|valueKind|statisticKind|dimensions|i18n/.test(
        p,
      )
    )
      return 'statistics-definition'
    return 'statistics-geography'
  }
  return /changelog|evidenceAssets|noticeRef/.test(p)
    ? 'street-evidence'
    : 'street-lifecycle'
}

const templateCatalogue = JSON.parse(
  readFileSync(
    resolve(import.meta.dir, 'inputs/implementation-templates.json'),
    'utf8',
  ),
) as { templates: Array<{ id: string; evidence: Array<{ file: string }> }> }
const templateIds = new Set(templateCatalogue.templates.map(t => t.id))
const plans = contracts.flatMap(contract =>
  contract.fields.map(field => {
    const templateId = templateFor(contract, field)
    if (!templateIds.has(templateId)) throw new Error(`Missing template ${templateId}`)
    const resourceFamilies: Record<string, string> = {
      divisions: 'divisions',
      'division-areas': 'divisions',
      'division-boundaries': 'divisions',
      addresses: 'addresses',
      address3d: 'addresses',
      places: 'places',
      statistics: 'statistics',
      'statistic-fields': 'statistics-definition',
      'statistic-measures': 'statistics-definition',
      streets: 'streets',
      'geocoding-results': 'geocoding',
    }
    const resourceBranches = field.variants.flatMap(variant => {
      const resource = variant.split('=')[1]
      const family = resource && resourceFamilies[resource]
      if (!family) return []
      return [
        {
          discriminator: variant,
          family,
          templateId: templateFor(contract, field, family),
        },
      ]
    })
    return {
      contractId: contract.id,
      apiField: field.path || '$',
      schemaEvidence: { file: contract.file, line: contract.line },
      family: familyFor(contract.file),
      templateId,
      variants: field.variants,
      resourceBranches,
      shape: field.boundary ?? 'scalar',
      optionalOrNullable: field.optional,
      implementationStatus: 'planned-not-generated',
      generation: {
        outputSelector: field.path || '$',
        strategy:
          field.boundary === 'object' || field.boundary === 'array'
            ? 'compose-child-plans'
            : field.boundary === 'opaque' ||
                field.boundary === 'opaque-object' ||
                field.boundary === 'dynamic-map'
              ? 'expand-pinned-shape-or-retain-wildcard-policy'
              : 'instantiate-template-with-release-scopes',
        requiresExplicitSourceBinding: ![
          'constant',
          'request-envelope',
          'release-metadata',
          'error',
          'registry',
          'operational',
          'asset-style',
        ].includes(templateId),
        inspectSupplementarySurface: Boolean(field.boundary?.startsWith('opaque')),
      },
    }
  }),
)
writeFileSync(
  resolve(output, 'field-plans.json'),
  `${JSON.stringify({ kind: 'api-response-field-implementation-plans', schemaVersion: 1, note: 'One plan per contract selector. Plans route to reviewed transformation templates; they are not completed lineage fixtures or record-level application proof.', plans }, null, 2)}\n`,
)

// Preserve current fixture declarations as review evidence, never as authoritative derivation.
const fixtureFiles = ts.sys.readDirectory(resolve(root, 'fixtures/meta/apiFields'), [
  '.json',
])
const fixtureReview = fixtureFiles.map(file => {
  const fixture = JSON.parse(readFileSync(file, 'utf8'))
  const groups = fixture.resources ?? [
    { resourceType: fixture.resourceType, fields: fixture.fields ?? [] },
  ]
  return {
    file: relative(root, file),
    apiVersion: fixture.apiVersion,
    responseSchemaVersion: fixture.schemaVersion,
    publisherSchemaRanges: fixture.publisherSchemaRanges,
    declarations: groups.flatMap(
      (g: { resourceType: string; fields: Array<Record<string, unknown>> }) =>
        g.fields.map(f => ({
          resourceType: g.resourceType,
          apiField: f.apiField,
          sourceDatasetCode: f.sourceDatasetCode,
          resolverCode: f.resolverCode,
          variant: f.variant ?? null,
          reviewDisposition: 'trace-implementation-before-reuse',
        })),
    ),
  }
})
writeFileSync(
  resolve(output, 'source-fixture-review.json'),
  `${JSON.stringify({ kind: 'source-fixture-review-index', schemaVersion: 1, fixtures: fixtureReview }, null, 2)}\n`,
)
const ruleFiles = ts.sys.readDirectory(
  resolve(root, 'fixtures/meta/processing-rules'),
  ['.json'],
)
const rules = ruleFiles.map(file => {
  const rule = JSON.parse(readFileSync(file, 'utf8'))
  return {
    file: relative(root, file),
    stage: file.includes('/ingestion/') ? 'ingestion' : 'assembly',
    ...rule,
    reviewDisposition:
      'Resolve captured definition hash; expand field-specific conditions/parameters before using a broad rule for field lineage.',
  }
})
const policyFiles = ts.sys.readDirectory(
  resolve(root, 'fixtures/meta/rulesetVersions'),
  ['.json'],
)
const policies = policyFiles.map(file => ({
  file: relative(root, file),
  ...JSON.parse(readFileSync(file, 'utf8')),
}))
writeFileSync(
  resolve(output, 'processing-policy-review.json'),
  `${JSON.stringify({ kind: 'processing-policy-review-index', schemaVersion: 1, note: 'Current authored policy evidence; not historical release pins. Scope/basis/review categories are distinct from output precedence.', rules, policies }, null, 2)}\n`,
)
const evidenceFiles = new Set([
  ...contracts.map(c => c.file),
  ...templateCatalogue.templates.flatMap(t => t.evidence.map(e => e.file)),
  ...fixtureReview.map(f => f.file),
  ...rules.map(r => r.file),
  ...policies.map(p => p.file),
])
writeFileSync(
  resolve(output, 'evidence-manifest.json'),
  `${JSON.stringify(
    {
      kind: 'field-lineage-review-evidence-manifest',
      schemaVersion: 1,
      note: 'Hashes identify current checkout evidence, not published release policies. Regenerate after evidence changes.',
      files: [...evidenceFiles].sort().map(file => ({
        file,
        sha256: createHash('sha256')
          .update(readFileSync(resolve(root, file)))
          .digest('hex'),
      })),
    },
    null,
    2,
  )}\n`,
)
console.log(
  JSON.stringify({
    fieldPlans: plans.length,
    templates: templateIds.size,
    sourceFixtureDocuments: fixtureReview.length,
  }),
)
