/** Operational phases have one explicit processing boundary. */
export type ProcessingStage = 'ingestion' | 'assembly' | 'composition'

export function processingStageForPhase(phase: string): ProcessingStage {
  if (/publish|compose|reconcile/i.test(phase)) return 'composition'
  if (/source|raw|download|extract|parse|register|upload/i.test(phase))
    return 'ingestion'
  return 'assembly'
}
