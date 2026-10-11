/** Ownership follows the output of the transition, not the input archive. */
export type AuditScope =
  | { stage: 'preparation' | 'ingestion'; ownerId: string }
  | { stage: 'assembly'; ownerId: string }
  | { stage: 'composition'; ownerId: string }

export const auditStages = [
  'preparation',
  'ingestion',
  'assembly',
  'composition',
] as const

export function validateAuditScope(value: unknown): asserts value is AuditScope {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Audit requires a lifecycle stage and output owner.')
  const scope = value as Record<string, unknown>
  if (
    !auditStages.includes(scope.stage as AuditScope['stage']) ||
    typeof scope.ownerId !== 'string' ||
    !scope.ownerId.trim() ||
    Object.keys(scope).some(key => key !== 'stage' && key !== 'ownerId')
  )
    throw new Error('Invalid audit lifecycle stage or output owner.')
}
