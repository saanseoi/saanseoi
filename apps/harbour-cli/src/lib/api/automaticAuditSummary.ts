import type { ReleaseProcessingAction } from '@repo/core/provenance/processingAction'

/** Automatic execution retains bounded operation summaries, never row evidence. */
export function summariseAutomaticActions(actions: ReleaseProcessingAction[]) {
  const summaries = new Map<string, Omit<ReleaseProcessingAction, 'evidence'>>()
  for (const action of actions) {
    if (action.mode !== 'automatic')
      throw new Error('Reviewed decisions require individual audit capture.')
    if (
      !Number.isSafeInteger(action.affectedRecordCount) ||
      action.affectedRecordCount < 0
    )
      throw new Error('Invalid automatic audit count.')
    const previous = summaries.get(action.action)
    if (previous && previous.summary !== action.summary)
      throw new Error(
        `Automatic audit operation requires one stable description: ${action.action}`,
      )
    const count = (previous?.affectedRecordCount ?? 0) + action.affectedRecordCount
    if (!Number.isSafeInteger(count)) throw new Error('Automatic audit count overflow.')
    summaries.set(action.action, {
      action: action.action,
      mode: 'automatic',
      summary: action.summary,
      affectedRecordCount: count,
    })
  }
  return [...summaries.values()].sort((left, right) =>
    left.action.localeCompare(right.action),
  )
}
