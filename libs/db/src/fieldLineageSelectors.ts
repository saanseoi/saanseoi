/** Dynamic paths resolve exclusively through retained release evidence. */
import { computeVersionHash } from './versioning'
import type { ReleaseBinding, SelectorDomain } from './fieldLineageTypes'

export function readLineagePointer(document: unknown, pointer: string): unknown {
  if (pointer === '') return document
  if (!pointer.startsWith('/') || /~(?![01])/u.test(pointer))
    throw new Error('Invalid lineage JSON pointer.')
  let value = document
  for (const encoded of pointer.slice(1).split('/')) {
    const key = encoded.replaceAll('~1', '/').replaceAll('~0', '~')
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key))
      throw new Error(`Missing retained evidence pointer: ${pointer}`)
    value = (value as Record<string, unknown>)[key]
  }
  return value
}

/** The caller supplies the document selected by the release, never a fixture lookup. */
export function mappingSelectorDomain(args: {
  scopeId: string
  role: string
  definitionHash: string
  document: unknown
  entriesPointer: string
  outputKey: string
  inputKey: string
  inputPrefix?: string[]
}) {
  if (computeVersionHash(args.document) !== args.definitionHash)
    throw new Error('Retained mapping hash mismatch.')
  const entries = readLineagePointer(args.document, args.entriesPointer)
  if (!Array.isArray(entries))
    throw new Error('Retained mapping requires an entry array.')
  const keys = new Set<string>()
  const domain: SelectorDomain = {
    kind: 'field-lineage-selector-domain',
    scopeId: args.scopeId,
    role: args.role,
    evidence: [{ definitionHash: args.definitionHash, pointer: args.entriesPointer }],
    members: entries
      .map((entry, index) => {
        const key = entry?.[args.outputKey],
          input = entry?.[args.inputKey]
        if (
          typeof key !== 'string' ||
          !key ||
          keys.has(key) ||
          typeof input !== 'string' ||
          !input
        )
          throw new Error('Invalid or duplicate retained field mapping.')
        keys.add(key)
        return {
          key,
          inputPath: [...(args.inputPrefix ?? []), input],
          evidencePointer: `${args.entriesPointer}/${index}`,
        }
      })
      .sort((a, b) => a.key.localeCompare(b.key)),
  }
  return { id: computeVersionHash(domain), definition: domain }
}

/** Enumerate declared properties only; open maps and unresolved refs are boundaries. */
export function schemaSelectorDomain(args: {
  scopeId: string
  role: string
  definitionHash: string
  document: unknown
  pointer: string
  inputPrefix?: string[]
}) {
  if (computeVersionHash(args.document) !== args.definitionHash)
    throw new Error('Retained schema hash mismatch.')
  const schema = readLineagePointer(args.document, args.pointer) as Record<
    string,
    unknown
  >
  if (
    !schema ||
    typeof schema !== 'object' ||
    schema.$ref ||
    schema.anyOf ||
    schema.oneOf ||
    schema.allOf ||
    schema.additionalProperties !== false ||
    schema.patternProperties
  )
    throw new Error(
      'Schema selector requires a resolved closed object; retain an explicit dynamic boundary otherwise.',
    )
  const properties = schema.properties
  if (!properties || typeof properties !== 'object' || Array.isArray(properties))
    throw new Error('Schema selector requires properties.')
  const escapePointer = (key: string) => key.replaceAll('~', '~0').replaceAll('/', '~1')
  const definition: SelectorDomain = {
    kind: 'field-lineage-selector-domain',
    scopeId: args.scopeId,
    role: args.role,
    evidence: [{ definitionHash: args.definitionHash, pointer: args.pointer }],
    members: Object.keys(properties)
      .sort()
      .map(key => ({
        key,
        inputPath: [...(args.inputPrefix ?? []), key],
        evidencePointer: `${args.pointer}/properties/${escapePointer(key)}`,
      })),
  }
  return { id: computeVersionHash(definition), definition }
}

export function resolveSelectorDomain(
  binding: ReleaseBinding,
  scopeId: string,
  role: string,
  retained: ReadonlyMap<string, unknown>,
) {
  const scopes = binding.scopes.filter(scope => scope.scopeId === scopeId)
  if (scopes.length !== 1) throw new Error(`Expected one bound scope: ${scopeId}`)
  const scope = scopes[0]!
  const pins = scope.selectorDomains?.filter(pin => pin.role === role) ?? []
  if (pins.length !== 1)
    throw new Error(`Expected one selector domain: ${scopeId}/${role}`)
  const hash = pins[0]!.definitionHash
  const domain = retained.get(hash) as SelectorDomain | undefined
  if (!domain || computeVersionHash(domain) !== hash)
    throw new Error(`Missing or corrupt retained selector domain: ${hash}`)
  if (domain.scopeId !== scopeId || domain.role !== role)
    throw new Error('Selector domain scope/role mismatch.')
  if (
    !domain.evidence.length ||
    domain.evidence.some(
      evidence =>
        !scope.definitionHashes?.includes(evidence.definitionHash) ||
        (evidence.pointer !== '' && !evidence.pointer.startsWith('/')),
    )
  )
    throw new Error('Selector evidence is not pinned by the selected release scope.')
  for (const evidence of domain.evidence) {
    const document = retained.get(evidence.definitionHash)
    if (!document || computeVersionHash(document) !== evidence.definitionHash)
      throw new Error('Missing or corrupt retained selector evidence.')
    readLineagePointer(document, evidence.pointer)
  }
  const keys = new Set<string>()
  for (const member of domain.members) {
    if (
      !member.key ||
      keys.has(member.key) ||
      !member.inputPath.length ||
      member.inputPath.some(segment => !segment) ||
      !member.evidencePointer.startsWith('/')
    )
      throw new Error('Invalid or duplicate selector domain member.')
    keys.add(member.key)
    if (domain.evidence.length !== 1)
      throw new Error('Selector members require one unambiguous evidence document.')
    readLineagePointer(
      retained.get(domain.evidence[0]!.definitionHash),
      member.evidencePointer,
    )
  }
  // Copy to prevent a reader mutating the retained document. Sort for stable generation.
  return structuredClone(domain.members).sort((a, b) => a.key.localeCompare(b.key))
}

/** Keep keys as path segments: dots in publisher keys are not nesting separators. */
export function expandSelector(
  prefix: readonly string[],
  suffix: readonly string[],
  members: ReturnType<typeof resolveSelectorDomain>,
) {
  return members.map(member => ({
    outputPath: [...prefix, member.key, ...suffix],
    inputPath: member.inputPath,
    evidencePointer: member.evidencePointer,
  }))
}
