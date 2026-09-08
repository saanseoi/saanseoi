import { serialise } from './objects'
import type { RuleDeclaration } from './auditTypes'
import type { JsonRecord } from './types'

/** Resolve a closed catalogue without filesystem access in worker processors. */
export function resolveRuleFixtureCatalog(
  fixtures: Record<
    string,
    { parameters: JsonRecord; dependencyIds?: string[]; [key: string]: unknown }
  >,
) {
  const resolved = new Map<string, RuleDeclaration>()
  const byId = new Map<string, string>()
  for (const [name, fixture] of Object.entries(fixtures)) {
    const id = (fixture as unknown as { id: string }).id
    if (byId.has(id)) throw new Error(`Duplicate processing rule ID: ${id}.`)
    byId.set(id, name)
  }
  const visiting = new Set<string>()
  function resolve(name: string): RuleDeclaration {
    const existing = resolved.get(name)
    if (existing) return existing
    if (visiting.has(name))
      throw new Error(`Cyclic processing rule dependency: ${name}.`)
    const fixture = fixtures[name]
    if (!fixture) throw new Error(`Unknown processing rule: ${name}.`)
    visiting.add(name)
    const dependencies = (
      (fixture as unknown as { dependencyIds?: string[] }).dependencyIds ?? []
    ).map(id => {
      const dependency = byId.get(id)
      if (!dependency) throw new Error(`Unknown processing rule dependency: ${id}.`)
      return resolve(dependency)
    })
    const declaration = ruleDeclarationFromFixture(fixture, dependencies)
    visiting.delete(name)
    resolved.set(name, declaration)
    return declaration
  }
  for (const name of Object.keys(fixtures)) resolve(name)
  return resolved
}

/** Validate JSON declarations while preserving the executor's inferred parameter types. */
export function ruleDeclarationFromFixture<F extends { parameters: JsonRecord }>(
  fixture: F,
  dependencies: RuleDeclaration[] = [],
): RuleDeclaration & { parameters: F['parameters'] } {
  if (!fixture || typeof fixture !== 'object' || Array.isArray(fixture))
    throw new Error('Invalid processing rule declaration fixture.')
  const value = fixture as unknown as Record<string, unknown>
  const text = (v: unknown) => typeof v === 'string' && v.trim().length > 0
  const strings = (v: unknown) => Array.isArray(v) && v.every(text)
  const implementation = value.implementation as Record<string, unknown> | undefined
  if (
    value.kind !== 'processing-rule' ||
    value.schemaVersion !== 1 ||
    !text(value.id) ||
    !text(value.summary) ||
    !['bulk', 'individual'].includes(String(value.scope)) ||
    !['code', 'fixture'].includes(String(value.basis)) ||
    !strings(value.inputs) ||
    !strings(value.outputs) ||
    !value.parameters ||
    typeof value.parameters !== 'object' ||
    Array.isArray(value.parameters) ||
    !implementation ||
    !text(implementation.path) ||
    !text(implementation.symbol)
  )
    throw new Error('Invalid processing rule declaration fixture.')
  serialise(value)
  if (value.review !== undefined) {
    const review = value.review as {
      kind?: string
      guard?: { id?: string; summary?: string; consequence?: string }
    }
    if (
      !review ||
      value.basis !== 'fixture' ||
      (review.kind !== 'patch' && review.kind !== 'curation') ||
      (review.kind === 'patch' && review.guard !== undefined) ||
      (review.kind === 'curation' &&
        (!text(review.guard?.id) ||
          !text(review.guard?.summary) ||
          !['block-ingestion', 'report'].includes(String(review.guard?.consequence))))
    ) {
      throw new Error(
        'Curations require a related guard; patches must not declare a triggering guard.',
      )
    }
  }
  const ids = value.dependencyIds
  if (
    ids !== undefined &&
    (!strings(ids) || new Set(ids as string[]).size !== (ids as string[]).length)
  )
    throw new Error('Invalid processing rule dependency IDs.')
  if (JSON.stringify(ids ?? []) !== JSON.stringify(dependencies.map(rule => rule.id)))
    throw new Error(
      'Processing rule dependencies must resolve exactly in declared order.',
    )
  for (const dependency of dependencies)
    ruleDeclarationFromFixture(dependency, dependency.dependencies ?? [])
  return (dependencies.length ? { ...fixture, dependencies } : fixture) as F &
    RuleDeclaration
}
