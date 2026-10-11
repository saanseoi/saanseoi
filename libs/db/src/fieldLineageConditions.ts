import type { Condition, DefinitionRef } from './fieldLineageTypes'

/** Evaluate applicability from retained inputs; unknown predicates never become false/fallback. */
export function evaluateFieldLineageCondition(
  condition: Condition,
  inputs: Readonly<Record<string, unknown>>,
  predicate?: (
    definition: DefinitionRef,
    arguments_: Record<string, unknown>,
  ) => boolean,
): boolean {
  const read = (name: string) => {
    if (!Object.hasOwn(inputs, name))
      throw new Error(`Missing lineage condition input ${name}`)
    return inputs[name]
  }
  switch (condition.kind) {
    case 'unresolved':
      throw new Error(`Unresolved lineage condition: ${condition.reason}`)
    case 'always':
      return true
    case 'all':
      return condition.conditions.every(child =>
        evaluateFieldLineageCondition(child, inputs, predicate),
      )
    case 'any':
      return condition.conditions.some(child =>
        evaluateFieldLineageCondition(child, inputs, predicate),
      )
    case 'not':
      return !evaluateFieldLineageCondition(condition.condition, inputs, predicate)
    case 'predicate': {
      if (!predicate)
        throw new Error(
          `No evaluator for retained predicate ${condition.definition.definitionId}`,
        )
      return predicate(
        condition.definition,
        Object.fromEntries(
          Object.entries(condition.arguments).map(([name, input]) => [
            name,
            read(input),
          ]),
        ),
      )
    }
    case 'compare': {
      const value = read(condition.input)
      switch (condition.operator) {
        case 'exists':
          return value !== undefined
        case 'eq':
          return Object.is(value, condition.value)
        case 'in': {
          if (!Array.isArray(condition.value))
            throw new Error('Lineage membership requires an array.')
          return condition.value.some(candidate => Object.is(candidate, value))
        }
        case 'matches': {
          if (typeof condition.value !== 'string')
            throw new Error('Lineage pattern requires a string.')
          return (
            typeof value === 'string' && new RegExp(condition.value, 'u').test(value)
          )
        }
      }
    }
  }
}
