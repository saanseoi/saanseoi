import type { AuditGuard } from './auditTypes'

export type GuardDefinition = Pick<AuditGuard, 'id' | 'summary' | 'consequence'>
export class ProcessingGuardError extends Error {
  constructor(
    message: string,
    readonly guards: AuditGuard[],
  ) {
    super(message)
    this.name = 'ProcessingGuardError'
  }
}

/** Register before processing so an interrupted run still exposes checks not reached. */
export function guardSession(definitions: readonly GuardDefinition[]) {
  const results = new Map(
    definitions.map(d => [
      d.id,
      {
        ...d,
        status: 'not-run',
        checked: 0,
        failed: 0,
        reason: 'This check has not run.',
      } as AuditGuard,
    ]),
  )
  const snapshot = () => [...results.values()].map(g => ({ ...g }))
  return {
    snapshot,
    notApplicable(id: string, reason: string) {
      const result = results.get(id)
      if (!result) throw new Error(`Unregistered processing guard: ${id}.`)
      if (result.checked) throw new Error(`Cannot skip an executed guard: ${id}.`)
      result.status = 'not-applicable'
      result.reason = reason
    },
    check<T>(id: string, run: () => T): T {
      const result = results.get(id)
      if (!result) throw new Error(`Unregistered processing guard: ${id}.`)
      result.checked++
      try {
        const value = run()
        result.status = result.failed ? 'failed' : 'passed'
        result.reason = 'All checked inputs satisfy this requirement.'
        return value
      } catch (error) {
        result.failed++
        result.status = 'failed'
        result.reason = error instanceof Error ? error.message : String(error)
        throw new ProcessingGuardError(result.reason, snapshot())
      }
    },
  }
}

export const statisticGuardDefinitions: GuardDefinition[] = [
  {
    id: 'statistic-reference-period',
    summary:
      'Require the source identifiers and a valid reference period for the selected dataset.',
    consequence: 'block-ingestion',
  },
  {
    id: 'statistic-area-companion',
    summary: 'Require valid configured area companion cohort, variant and domain.',
    consequence: 'block-ingestion',
  },
  {
    id: 'statistic-measure-registration',
    summary: 'Every reviewed field must reference a registered measure.',
    consequence: 'block-ingestion',
  },
  {
    id: 'statistic-measure-localisations',
    summary: 'A measure and locale must have one consistent localisation.',
    consequence: 'block-ingestion',
  },
  {
    id: 'statistic-dimension-field-uniqueness',
    summary:
      'Fields and geography metadata must be unambiguous within each dataset, exact reference period and semantic geography.',
    consequence: 'block-ingestion',
  },
]
