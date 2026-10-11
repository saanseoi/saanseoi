import {
  validateFieldLineageBinding,
  computeVersionHash,
  type FieldLineageDefinition,
  type FieldLineageReleaseBinding,
} from '@repo/db'
import { validateAuditManifest } from './audit'
import { validateCurationApplications } from './curationApplications'
import { readObject, readValue } from './objects'
import type { AuditManifest } from './auditTypes'
import type { Digest, ProvenanceStore } from './types'

/** Resolve exact retained evidence; aggregate application counts never select a field winner. */
export async function readFieldLineageAuditContext(
  store: ProvenanceStore,
  definition: FieldLineageDefinition,
  binding: FieldLineageReleaseBinding,
  scopeId: string,
) {
  validateFieldLineageBinding(definition, binding)
  const scope = binding.scopes.find(scope => scope.scopeId === scopeId)
  if (!scope?.resourceReleaseId || !scope.processingManifest)
    throw new Error(`No retained processing manifest for lineage scope ${scopeId}.`)
  const ref = {
    ...scope.processingManifest,
    hash: scope.processingManifest.hash as Digest,
  }
  const document = await readObject(store, ref)
  if (
    !document ||
    typeof document !== 'object' ||
    Array.isArray(document) ||
    document.kind !== 'processing-audit'
  )
    throw new Error(
      'Selected processing manifest is not an audit; effect manifests require their replay contract.',
    )
  validateAuditManifest(document)
  const manifest = document as unknown as AuditManifest
  if (
    manifest.resourceReleaseId !== scope.resourceReleaseId ||
    manifest.attempt.status !== 'completed'
  )
    throw new Error(
      'Lineage audit must be a completed attempt for the bound resource release.',
    )
  const decisions = []
  for (const chunk of manifest.chunks) {
    const applications = validateCurationApplications(await readObject(store, chunk))
    if (applications.length !== chunk.count)
      throw new Error('Invalid lineage audit chunk count.')
    decisions.push(...applications)
  }
  if (
    decisions.reduce((total, entry) => total + entry.applicationCount, 0) !==
    manifest.applicationCount
  )
    throw new Error('Invalid lineage audit application count.')
  return {
    manifest: ref,
    resourceReleaseId: scope.resourceReleaseId,
    bulk: manifest.bulk,
    guards: manifest.guards,
    decisions,
    individualFixtures: manifest.individualFixtures ?? [],
    interpretation: 'retained-evidence-not-field-winners' as const,
  }
}

/** Match the retained instruction, including partitioned fixtures, rather than a filename or count. */
export async function readFieldLineageDecisionEvidence(
  store: ProvenanceStore,
  definition: FieldLineageDefinition,
  binding: FieldLineageReleaseBinding,
  nodeId: string,
  recordId: string,
  sourceIdentities: string[] = [],
) {
  const node = definition.nodes.find(node => node.id === nodeId)
  if (
    node?.audit.retention !== 'decision' ||
    !node.audit.binding ||
    node.operation.kind !== 'resolver'
  )
    throw new Error('Field lineage node does not declare a specific reviewed decision.')
  const operation = definition.definitions[node.operation.definition.definitionId] as {
    document?: string
    documents?: Record<string, string>
    instructionSelector?: { fixtureTypes?: string[] }
  }
  const documents = [
    operation.document,
    ...Object.values(operation.documents ?? {}),
  ].filter((hash): hash is string => Boolean(hash))
  const instructions = documents.flatMap(hash => {
    const document = definition.definitions[hash] as
      | { entries?: Array<Record<string, unknown>> }
      | undefined
    if (!document || computeVersionHash(document) !== hash)
      throw new Error('Missing retained decision instructions.')
    return (document.entries ?? []).filter(
      entry =>
        (entry.divisionId ?? entry.id ?? entry.canonicalId ?? entry.placeId) ===
        recordId,
    )
  })
  const expected = new Set(
    instructions.map(instruction => computeVersionHash(instruction)),
  )
  const context = await readFieldLineageAuditContext(
    store,
    definition,
    binding,
    node.audit.binding.owner,
  )
  // A retained preparation instruction may identify a canonical row through a CSU,
  // GeoAddress or reviewed alias. These identities must come from the selected graph.
  if (!documents.length && operation.instructionSelector?.fixtureTypes) {
    const identities = new Set([recordId, ...sourceIdentities])
    const keys = new Set([
      'id',
      'canonicalId',
      'divisionId',
      'placeId',
      'sourceRecordId',
      'recordId',
      'recordIds',
      'parentId',
      'childIds',
      'aliasIds',
      'hkgovCsuId',
      'csu',
      'geoAddress',
      'geoAddresses',
    ])
    const matchesIdentity = (value: unknown): boolean => {
      if (!value || typeof value !== 'object') return false
      return Object.entries(value).some(
        ([key, item]) =>
          (keys.has(key) &&
            (typeof item === 'string'
              ? identities.has(item)
              : Array.isArray(item) &&
                item.some(id => typeof id === 'string' && identities.has(id)))) ||
          (key === 'source' && matchesIdentity(item)),
      )
    }
    const scan = (value: unknown) => {
      if (!value || typeof value !== 'object') return
      if (matchesIdentity(value)) expected.add(computeVersionHash(value))
      for (const child of Object.values(value))
        if (child && typeof child === 'object') scan(child)
    }
    const selected = await readFieldLineageInstructionDocuments(
      store,
      definition,
      binding,
      node.audit.binding.owner,
      operation.instructionSelector.fixtureTypes,
    )
    for (const fixture of selected) scan(fixture.document)
  }
  if (!expected.size) return []
  const matches = []
  for (const application of context.decisions) {
    const instruction = await readValue(store, {
      ...application.fixture.object,
      pointer: application.fixture.pointer,
    })
    if (!expected.has(computeVersionHash(instruction))) continue
    const declaration = (await readObject(store, application.definition)) as {
      basis?: string
      scope?: string
      review?: { kind?: string }
    }
    // A bulk evaluator can apply a specific reviewed instruction; the application
    // reference, not the evaluator's execution scope, identifies that decision.
    if (declaration.basis !== 'fixture') continue
    if ((node.layer === 'patch') !== (declaration.review?.kind === 'patch')) continue
    matches.push({
      ...application,
      instruction,
      outputSelector: node.audit.binding.outputSelector,
      interpretation: 'retained-instruction-application-count' as const,
    })
  }
  return matches
}

/** Read only hash-pinned instruction documents from the completed producer audit. */
export async function readFieldLineageInstructionDocuments(
  store: ProvenanceStore,
  definition: FieldLineageDefinition,
  binding: FieldLineageReleaseBinding,
  scopeId: string,
  fixtureTypes: readonly string[],
) {
  const context = await readFieldLineageAuditContext(
    store,
    definition,
    binding,
    scopeId,
  )
  const wanted = new Set(fixtureTypes)
  const fixtures = [
    ...context.individualFixtures,
    ...context.bulk.flatMap(rule => rule.fixtures),
  ].filter(fixture => wanted.has(fixture.type))
  const unique = new Map(
    fixtures.map(fixture => [`${fixture.type}:${fixture.object.hash}`, fixture]),
  )
  return Promise.all(
    [...unique.values()].map(async fixture => ({
      ...fixture,
      document: await readObject(store, fixture.object),
    })),
  )
}
