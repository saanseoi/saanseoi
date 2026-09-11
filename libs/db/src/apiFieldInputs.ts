import { computeVersionHash } from './versioning'
import { resolverCodes } from './constants/schema'

/** Retained source path -> original publisher path(s), scoped by dataset code.
 * Arrays enumerate alternative publisher locations; processing rules define selection.
 */
export type PublisherFields = Record<string, Record<string, string | string[]>>

export type ApiFieldInput =
  | { origin: 'source' | 'registry' | 'curation' | 'intermediate'; fieldPath: string }
  | { origin: 'constant'; value: unknown }

export type ApiFieldRulePin = {
  ruleId: string
  releaseId: string
  rulesetVersion: string
  rulesetVersionHash: string
  definitionHash: string
}

export function validateApiFieldInputs(
  inputs: ApiFieldInput[],
  publisherFields: Record<string, string | string[]> = {},
) {
  if (!Array.isArray(inputs) || !inputs.length)
    throw new Error('API field requires inputs.')
  for (const input of inputs) {
    if (input.origin === 'constant') {
      if (!Object.hasOwn(input, 'value') || input.value === undefined)
        throw new Error('Constant input requires a value.')
      continue
    }
    if (
      !['source', 'registry', 'curation', 'intermediate'].includes(input.origin) ||
      !input.fieldPath
    )
      throw new Error('API input requires an explicit origin and field path.')
    if (input.origin === 'source') {
      if (
        !/^(properties\..+|geometry|sourceRecordId)$/.test(input.fieldPath) ||
        !Object.hasOwn(publisherFields, input.fieldPath)
      )
        throw new Error(`Unmapped source input: ${input.fieldPath}`)
      const paths = publisherFields[input.fieldPath]
      if (!(typeof paths === 'string' || Array.isArray(paths)))
        throw new Error('Publisher mapping requires original paths.')
      const originals = typeof paths === 'string' ? [paths] : paths
      if (
        !originals.length ||
        originals.some(
          path =>
            typeof path !== 'string' ||
            !path.trim() ||
            /^(raw_properties|rawProperties)(\.|$)/.test(path),
        )
      )
        throw new Error('Publisher mapping requires original paths.')
    }
  }
}

/** Resolve exclusively against the immutable definitions captured by selected releases. */
export function pinApiFieldRules(
  field: { resolverCode: string; processingRuleIds?: string[] },
  releases: Array<{ releaseId: string; processingRules: unknown }>,
): ApiFieldRulePin[] {
  const ids = [
    ...new Set([
      ...(resolverCodes.some(code => code === field.resolverCode)
        ? []
        : [field.resolverCode]),
      ...(field.processingRuleIds ?? []),
    ]),
  ]
  const pins = new Map<string, ApiFieldRulePin>()
  for (const release of releases) {
    const captured = release.processingRules as {
      rulesets?: Array<{
        rulesetVersion: string
        rulesetVersionHash: string
        rules: Array<{
          definition?: Record<string, unknown>
          definitions?: Array<Record<string, unknown>>
        }>
      }>
    } | null
    for (const ruleset of captured?.rulesets ?? []) {
      const visit = (definition: Record<string, unknown>) => {
        const ruleId = String(definition.id)
        if (ids.includes(ruleId)) {
          if (!ruleset.rulesetVersionHash)
            throw new Error(`Unpinned ruleset for ${ruleId}`)
          const pin = {
            ruleId,
            releaseId: release.releaseId,
            rulesetVersion: ruleset.rulesetVersion,
            rulesetVersionHash: ruleset.rulesetVersionHash,
            definitionHash: computeVersionHash(definition),
          }
          pins.set(JSON.stringify(pin), pin)
        }
        for (const dependency of (definition.dependencies ?? []) as Array<
          Record<string, unknown>
        >)
          visit(dependency)
      }
      for (const rule of ruleset.rules) {
        if (rule.definition) visit(rule.definition)
        for (const definition of rule.definitions ?? []) visit(definition)
      }
    }
    for (const id of ids) {
      const matches = [...pins.values()].filter(
        pin => pin.ruleId === id && pin.releaseId === release.releaseId,
      )
      if (!matches.length)
        throw new Error(
          `API field rule ${id} is absent from release ${release.releaseId}`,
        )
      if (new Set(matches.map(pin => pin.definitionHash)).size !== 1)
        throw new Error(`Conflicting captured definitions for API field rule ${id}`)
    }
  }
  for (const id of ids) {
    if (![...pins.values()].some(pin => pin.ruleId === id))
      throw new Error(
        `API field processing rule is absent from selected releases: ${id}`,
      )
  }
  return [...pins.values()].sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)),
  )
}
