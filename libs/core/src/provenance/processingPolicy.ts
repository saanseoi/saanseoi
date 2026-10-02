import {
  computeVersionHash,
  getTableColumns,
  getTableName,
  sourceSchema,
  currentSchema,
} from '@repo/db'
import type { RuleDeclaration } from './auditTypes'

export type ProcessingField = {
  origin: 'publisher' | 'source' | 'canonical' | 'intermediate' | 'curation'
  collection: string
  path: string
}
export type ProcessingRuleReference = {
  rulesetVersion: string
  operationCodes: string[]
}
export type ProcessingRule = {
  operationCode: string
  kind: 'bulk' | 'record'
  inputs: string[]
  outputs: string[]
  sourceFields?: ProcessingField[]
  targetFields?: ProcessingField[]
  definition?: RuleDeclaration
  definitions?: RuleDeclaration[]
  i18n: Record<string, { description: string }>
}
export type ProcessingRules = {
  stage: 'ingestion' | 'assembly'
  rulesets: Array<{
    rulesetVersion: string
    rulesetVersionHash: string
    rules: ProcessingRule[]
  }>
}
export type ProcessingRulesetFixture = {
  code: string
  versionHash: string
  stage?: 'ingestion' | 'assembly'
  mergeRules?: Array<{
    operationCode: string
    ruleFixture: string | string[]
    sourceFields?: ProcessingField[]
    targetFields?: ProcessingField[]
  }>
  [key: string]: unknown
}

const tables: Record<'source' | 'canonical', Map<string, Record<string, unknown>>> = {
  source: new Map(
    Object.values(sourceSchema)
      .filter(value => {
        try {
          getTableName(value as never)
          return !!getTableColumns(value as never)
        } catch {
          return false
        }
      })
      .map(table => [getTableName(table as never), getTableColumns(table as never)]),
  ),
  canonical: new Map(
    Object.values(currentSchema)
      .filter(value => {
        try {
          getTableName(value as never)
          return !!getTableColumns(value as never)
        } catch {
          return false
        }
      })
      .map(table => [getTableName(table as never), getTableColumns(table as never)]),
  ),
}

export function validateProcessingFields(fields: ProcessingField[] | undefined) {
  if (fields === undefined) return
  if (!Array.isArray(fields) || !fields.length)
    throw new Error('Processing field references must be a non-empty array.')
  for (const field of fields) {
    if (
      !['publisher', 'source', 'canonical', 'intermediate', 'curation'].includes(
        field.origin,
      ) ||
      !/^[A-Za-z][A-Za-z0-9_.-]*$/.test(field.collection) ||
      !/^(?:\*|[A-Za-z_][A-Za-z0-9_-]*(?:\[\]|\[\d+\]|\.[A-Za-z_][A-Za-z0-9_-]*)*)$/.test(
        field.path,
      )
    )
      throw new Error(`Invalid processing field reference: ${JSON.stringify(field)}.`)
    if (field.origin === 'source' || field.origin === 'canonical') {
      const columns = tables[field.origin].get(field.collection)
      const column = field.path.split(/[.[]/)[0]!
      if (!columns || (column !== '*' && !Object.hasOwn(columns, column)))
        throw new Error(
          `Unknown ${field.origin} field: ${field.collection}.${field.path}.`,
        )
    }
  }
}

export function resolveProcessingRuleset(
  fixture: ProcessingRulesetFixture,
  definitions: ReadonlyMap<string, RuleDeclaration>,
) {
  if (!fixture.stage)
    throw new Error(`Processing ruleset ${fixture.code} must declare its stage.`)
  const operations = new Set<string>()
  const rules = (fixture.mergeRules ?? []).map(rule => {
    if (operations.has(rule.operationCode))
      throw new Error(`Duplicate processing operation: ${rule.operationCode}.`)
    operations.add(rule.operationCode)
    validateProcessingFields(rule.sourceFields)
    validateProcessingFields(rule.targetFields)
    const names = Array.isArray(rule.ruleFixture)
      ? rule.ruleFixture
      : [rule.ruleFixture]
    if (!names.length) throw new Error('Processing rule references must not be empty.')
    const selected = names.map(name => {
      const definition = definitions.get(name)
      if (!definition) throw new Error(`Unknown processing rule fixture: ${name}.`)
      return structuredClone(definition)
    })
    const first = selected[0]!
    if (selected.some(definition => definition.scope !== first.scope))
      throw new Error('One operation cannot combine bulk and individual rules.')
    if (
      fixture.stage === 'ingestion' &&
      rule.targetFields?.some(field => field.origin === 'canonical')
    )
      throw new Error('Ingestion rules cannot write canonical fields.')
    return {
      operationCode: rule.operationCode,
      kind: first.scope === 'bulk' ? ('bulk' as const) : ('record' as const),
      inputs: [...new Set(selected.flatMap(definition => definition.inputs))],
      outputs: [...new Set(selected.flatMap(definition => definition.outputs))],
      ...(rule.sourceFields ? { sourceFields: rule.sourceFields } : {}),
      ...(rule.targetFields ? { targetFields: rule.targetFields } : {}),
      i18n: Object.fromEntries(
        ['en', 'zh-hant', 'zh-hans'].map(locale => [
          locale,
          {
            description: selected
              .map(definition => {
                const i18n = (
                  definition as RuleDeclaration & {
                    i18n?: Record<string, { description: string }>
                  }
                ).i18n
                if (locale === 'en') return definition.summary
                if (!i18n?.[locale]?.description)
                  throw new Error(
                    `Processing rule ${definition.id} is missing ${locale}.`,
                  )
                return i18n[locale].description
              })
              .join(' '),
          },
        ]),
      ),
      ...(selected.length === 1 ? { definition: first } : { definitions: selected }),
    }
  })
  // Retain referenced definitions, field references and stage in the immutable identity.
  return {
    rulesetVersion: fixture.code,
    rulesetVersionHash: computeVersionHash({ ...fixture, mergeRules: rules }),
    rules,
  }
}

export function resolveProcessingReferences(
  references: ProcessingRuleReference[],
  stage: ProcessingRules['stage'],
  rulesets: readonly ProcessingRulesetFixture[],
  definitions: ReadonlyMap<string, RuleDeclaration>,
): ProcessingRules {
  const selections = new Set<string>()
  return {
    stage,
    rulesets: references.map(reference => {
      if (selections.has(reference.rulesetVersion))
        throw new Error(
          `Duplicate processing ruleset selection: ${reference.rulesetVersion}.`,
        )
      selections.add(reference.rulesetVersion)
      const fixture = rulesets.find(
        fixture => fixture.code === reference.rulesetVersion,
      )
      if (!fixture || fixture.stage !== stage)
        throw new Error(
          `Wrong or missing ${stage} processing ruleset: ${reference.rulesetVersion}.`,
        )
      const resolved = resolveProcessingRuleset(fixture, definitions)
      if (
        !reference.operationCodes.length ||
        new Set(reference.operationCodes).size !== reference.operationCodes.length
      )
        throw new Error('Processing operation selections must be non-empty and unique.')
      return {
        ...resolved,
        rules: reference.operationCodes.map(operation => {
          const rule = resolved.rules.find(rule => rule.operationCode === operation)
          if (!rule)
            throw new Error(
              `Processing ruleset ${fixture.code} does not define operation ${operation}.`,
            )
          return rule
        }),
      }
    }),
  }
}
