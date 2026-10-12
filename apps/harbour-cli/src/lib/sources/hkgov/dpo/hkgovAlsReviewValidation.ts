import { strict as assert } from 'node:assert'

export function object(value: unknown): asserts value is Record<string, unknown> {
  assert(
    value && typeof value === 'object' && !Array.isArray(value),
    'Expected review object',
  )
}
export function string(value: unknown): asserts value is string {
  assert(
    typeof value === 'string' && value.length > 0,
    'Expected non-empty review string',
  )
}
export function strings(value: unknown): asserts value is string[] {
  assert(Array.isArray(value), 'Expected review string array')
  value.forEach(string)
}
export function version(value: unknown): asserts value is string {
  string(value)
  assert(/^\d{4}-\d{2}-\d{2}\.\d+$/.test(value), `Invalid source version: ${value}`)
}
export function coordinates(value: unknown) {
  assert(
    Array.isArray(value) &&
      value.length >= 2 &&
      value.every(n => typeof n === 'number' && Number.isFinite(n)),
    'Invalid review coordinates',
  )
}

export function sourceBounds(rule: {
  sourceVersionFrom: string
  sourceVersionTo: string
}) {
  version(rule.sourceVersionFrom)
  version(rule.sourceVersionTo)
  assert(
    rule.sourceVersionFrom <= rule.sourceVersionTo,
    'Invalid reviewed source bounds',
  )
}

export function sourceEpochs(rule: {
  sourceVersionFrom: string
  sourceVersionTo: string
  epochs: { sourceVersionFrom: string }[]
}) {
  sourceBounds(rule)
  assert(rule.epochs.length > 0, 'Missing reviewed source epochs')
  let previous = ''
  for (const epoch of rule.epochs) {
    version(epoch.sourceVersionFrom)
    assert(
      epoch.sourceVersionFrom > previous &&
        epoch.sourceVersionFrom <= rule.sourceVersionTo,
      'Unordered or out-of-bounds source epoch',
    )
    previous = epoch.sourceVersionFrom
  }
  assert(
    rule.epochs[0]!.sourceVersionFrom <= rule.sourceVersionFrom,
    'Uncovered source epoch',
  )
}
