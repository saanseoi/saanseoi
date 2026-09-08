import { hashValue, MAX_OBJECT_BYTES, retainObject, serialise } from './objects'
import type { Application, JsonRecord, ProvenanceStore, RecordKey } from './types'
import { requireDefined } from '../requireDefined'

export type ObservedApplication = Omit<
  Application,
  'schemaVersion' | 'kind' | 'inputs' | 'effects'
> & {
  evidenceValues?: Array<{ role: string; value: JsonRecord }>
  inputs: Array<RecordKey & { value: JsonRecord }>
  effects: Array<{
    target: RecordKey
    before: JsonRecord | null
    after: JsonRecord | null
  }>
}

/** Capture actual values at the producer boundary, without running transformations. */
export async function* recordApplications(
  store: ProvenanceStore,
  observed: Iterable<ObservedApplication> | AsyncIterable<ObservedApplication>,
): AsyncGenerator<Application> {
  let pending: ObservedApplication[] = []
  let values: JsonRecord[] = []
  let encodedBytes = 64
  async function* flush() {
    if (!pending.length) return
    const pack = values.length
      ? await retainObject(store, {
          schemaVersion: 1,
          kind: 'processing-values',
          values,
        })
      : null
    let ordinal = 0
    const valuePack = requireDefined(pack)
    for (const application of pending) {
      const { inputs, effects, evidenceValues = [], ...definition } = application
      const evidence = [...definition.evidence]
      const recordedInputs = await Promise.all(
        inputs.map(async ({ value, ...key }) => {
          evidence.push({
            object: valuePack,
            pointer: `/values/${ordinal++}`,
            role: `guarded-input:${key.collection}:${key.id}`,
          })
          return { ...key, hash: await hashValue(value) }
        }),
      )
      for (const item of evidenceValues)
        evidence.push({
          object: valuePack,
          pointer: `/values/${ordinal++}`,
          role: item.role,
        })
      const recordedEffects = await Promise.all(
        effects.map(async effect => {
          if (effect.before !== null)
            evidence.push({
              object: valuePack,
              pointer: `/values/${ordinal++}`,
              role: `guarded-before:${effect.target.collection}:${effect.target.id}`,
            })
          const after =
            effect.after === null
              ? null
              : { ...valuePack, pointer: `/values/${ordinal++}` }
          return {
            target: effect.target,
            before: effect.before === null ? null : await hashValue(effect.before),
            after,
          }
        }),
      )
      yield {
        ...definition,
        schemaVersion: 1 as const,
        kind: 'processing-application' as const,
        inputs: recordedInputs,
        effects: recordedEffects,
        evidence,
      }
    }
    pending = []
    values = []
    encodedBytes = 64
  }
  for await (const incoming of observed) {
    // Do not retain references a producer could subsequently mutate.
    const application = structuredClone(incoming)
    const outputs = [
      ...application.inputs.map(input => input.value),
      ...(application.evidenceValues ?? []).map(item => item.value),
      ...application.effects.flatMap(effect =>
        [effect.before, effect.after].filter(
          (value): value is JsonRecord => value !== null,
        ),
      ),
    ]
    const size = outputs.reduce(
      (total, value) => total + new TextEncoder().encode(serialise(value)).length + 1,
      0,
    )
    if (size + 64 > MAX_OBJECT_BYTES)
      throw new Error(
        'Application outputs exceed value pack limit; partition the operation.',
      )
    if (
      pending.length &&
      (pending.length >= 256 || encodedBytes + size > MAX_OBJECT_BYTES)
    )
      yield* flush()
    pending.push(application)
    values.push(...outputs)
    encodedBytes += size
  }
  yield* flush()
}
