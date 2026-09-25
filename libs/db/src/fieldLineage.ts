import type { ApiFieldInput, ApiFieldRulePin, PublisherFields } from './apiFieldInputs'
import { computeVersionHash } from './versioning'

export type FieldLineageMapping = {
  resourceType: string
  apiField: string
  variant: string | null
  sourceDatasetId: string
  inputs: ApiFieldInput[]
  canonicalInputs: string[]
  responseRule?:
    | 'project-field'
    | 'project-locales'
    | 'project-relationship'
    | 'decode-geometry'
  resolverCode: string
  ruleIds: string[]
  contributionType: string
  priority: number
  confidence: number | null
}

/** General definitions contain no release IDs, record IDs, cohorts or selected values. */
export type FieldLineageDefinition = {
  version: 1
  responseRuleset: {
    code: 'canonical-response-v1'
    rules: Record<string, string>
  }
  processingDefinitions: Array<{ datasetCode: string; definitionId: string }>
  rulesets: Array<{ version: string; hash: string }>
  rules: Array<{ id: string; ruleset: string; definitionHash: string }>
  ingestion: Array<{
    sourceDatasetId: string
    sourceField: string
    rawFields: string[]
    rule: 'publisher-field-selection'
  }>
  fields: FieldLineageMapping[]
}

export function buildFieldLineageDefinition(
  rows: Array<
    Omit<FieldLineageMapping, 'ruleIds'> & { resolverRules: ApiFieldRulePin[] }
  >,
  publisherFields: ReadonlyMap<string, PublisherFields[string]>,
  processingDefinitions: FieldLineageDefinition['processingDefinitions'] = [],
) {
  const rulesets = new Map<string, FieldLineageDefinition['rulesets'][number]>()
  const rules = new Map<string, FieldLineageDefinition['rules'][number]>()
  const fields = rows.map(({ resolverRules, ...row }) => {
    const ruleIds: string[] = []
    for (const pin of resolverRules) {
      rulesets.set(pin.rulesetVersionHash, {
        version: pin.rulesetVersion,
        hash: pin.rulesetVersionHash,
      })
      const id = `${pin.rulesetVersionHash}/${pin.ruleId}`
      const rule = {
        id: pin.ruleId,
        ruleset: pin.rulesetVersionHash,
        definitionHash: pin.definitionHash,
      }
      if (rules.has(id) && rules.get(id)!.definitionHash !== rule.definitionHash)
        throw new Error('Conflicting field lineage rule definitions.')
      rules.set(id, rule)
      if (!ruleIds.includes(id)) ruleIds.push(id)
    }
    return {
      ...row,
      responseRule: (row.apiField.startsWith('relationships.')
        ? 'project-relationship'
        : row.apiField.includes('.i18n')
          ? 'project-locales'
          : row.apiField === 'attributes.geometry'
            ? 'decode-geometry'
            : 'project-field') as NonNullable<FieldLineageMapping['responseRule']>,
      ruleIds: ruleIds.sort(),
    }
  })
  const sort = <T>(rows: T[]) =>
    rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  const definition: FieldLineageDefinition = {
    version: 1,
    processingDefinitions: sort([
      ...new Map(processingDefinitions.map(pin => [JSON.stringify(pin), pin])).values(),
    ]),
    responseRuleset: {
      code: 'canonical-response-v1',
      rules: {
        'project-field':
          'Project the declared canonical field into the requested API profile.',
        'project-locales':
          'Project canonical locale-keyed values using the requested locale and profile.',
        'project-relationship':
          'Resolve relationship identifiers from the declared canonical inputs within the release-selected snapshots.',
        'decode-geometry':
          'Present the canonical geometry as GeoJSON when included by the requested profile.',
      },
    },
    rulesets: sort([...rulesets.values()]),
    rules: sort([...rules.values()]),
    ingestion: sort(
      [...publisherFields].flatMap(([sourceDatasetId, fields]) =>
        Object.entries(fields).map(([sourceField, raw]) => ({
          sourceDatasetId,
          sourceField,
          rawFields: typeof raw === 'string' ? [raw] : raw,
          rule: 'publisher-field-selection' as const,
        })),
      ),
    ),
    fields: sort(fields),
  }
  return { id: computeVersionHash(definition), definition }
}
