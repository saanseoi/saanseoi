import { stableJsonStringify } from '@repo/core/pipeline/utils'
import { createHash } from 'node:crypto'
import type { ReviewDivision } from '@repo/core/pipeline/services/divisions/geographicReview'

export type UpdateDecision = {
  fingerprint: string
  action: 'keep' | 'delete' | 'accept'
  reason: string
}
export type UpdatePolicy = {
  coreLocales: string[]
  excludedNewNamePatterns: string[]
}

export const divisionUpdateFingerprint = (value: unknown) => {
  const document = stableJsonStringify(value)
  if (document === null) throw new Error('Missing division update evidence')
  return createHash('sha256').update(document).digest('hex')
}

/** Decisions bind to the exact accepted and proposed values, never just an ID. */
export function reviewDivisionUpdates(
  accepted: ReviewDivision[],
  proposed: ReviewDivision[],
  policy: UpdatePolicy,
  decisions: UpdateDecision[],
) {
  const before = new Map(accepted.map(row => [row.id, row]))
  const after = new Map(proposed.map(row => [row.id, structuredClone(row)]))
  const events: Array<{
    divisionId: string
    field: string
    before: unknown
    proposed: unknown
    fingerprint: string
    status: 'pending' | 'keep' | 'delete' | 'accept' | 'restored' | 'added' | 'excluded'
    reason?: string
  }> = []
  function event(id: string, field: string, oldValue: unknown, newValue: unknown) {
    const value = { divisionId: id, field, before: oldValue, proposed: newValue }
    const fingerprint = divisionUpdateFingerprint(value)
    const matches = decisions.filter(item => item.fingerprint === fingerprint)
    if (matches.length > 1 || matches.some(item => !item.reason.trim()))
      throw new Error(`Invalid or duplicate Division update decision: ${fingerprint}`)
    return { ...value, fingerprint, decision: matches[0] }
  }
  for (const previous of accepted) {
    const candidate = after.get(previous.id)
    if (!candidate) {
      const { decision, ...change } = event(previous.id, '$record', previous, null)
      if (decision && !['keep', 'delete'].includes(decision.action))
        throw new Error(`Removal requires keep/delete: ${change.fingerprint}`)
      if (decision?.action === 'keep') after.set(previous.id, structuredClone(previous))
      events.push({
        ...change,
        status:
          decision?.action === 'delete'
            ? 'delete'
            : decision?.action === 'keep'
              ? 'keep'
              : 'pending',
        reason: decision?.reason,
      })
      continue
    }
    for (const locale of policy.coreLocales) {
      const oldName = previous.names[locale]
      const newName = candidate.names[locale]
      if (!oldName || oldName === newName) continue
      const { decision, ...change } = event(
        previous.id,
        `names.${locale}.name`,
        oldName,
        newName ?? null,
      )
      if (!newName?.trim()) {
        candidate.names[locale] = oldName
        events.push({
          ...change,
          status: 'restored',
          reason: 'Accepted core-locale names cannot be deleted.',
        })
      } else {
        if (decision && !['keep', 'accept'].includes(decision.action))
          throw new Error(
            `Name replacement requires keep/accept: ${change.fingerprint}`,
          )
        if (decision?.action !== 'accept') candidate.names[locale] = oldName
        events.push({
          ...change,
          status:
            decision?.action === 'keep'
              ? 'keep'
              : decision?.action === 'accept'
                ? 'accept'
                : 'pending',
          reason: decision?.reason,
        })
      }
    }
  }
  const patterns = policy.excludedNewNamePatterns.map(
    pattern => new RegExp(pattern, 'iu'),
  )
  for (const candidate of proposed) {
    if (before.has(candidate.id)) continue
    const excludedByPolicy = Object.values(candidate.names).some(
      name => name && patterns.some(pattern => pattern.test(name)),
    )
    const { decision, ...change } = event(candidate.id, '$record', null, candidate)
    if (decision && !['delete', 'accept'].includes(decision.action))
      throw new Error(`New division requires accept/delete: ${change.fingerprint}`)
    const excluded = decision ? decision.action === 'delete' : excludedByPolicy
    if (excluded) after.delete(candidate.id)
    events.push({
      ...change,
      status: decision
        ? excluded
          ? 'delete'
          : 'accept'
        : excluded
          ? 'excluded'
          : 'added',
      reason:
        decision?.reason ??
        (excluded ? 'New identity matches the coverage exclusion policy.' : undefined),
    })
  }
  return {
    divisions: [...after.values()],
    events,
    pending: events.filter(event => event.status === 'pending'),
  }
}

/** Read explicit Overture names only: never infer or translate Simplified Chinese. */
export function publisherSimplifiedNames(
  rows: Array<{ id: string; names?: { common?: unknown } }>,
) {
  const result = new Map<string, string>()
  for (const row of rows) {
    const common = row.names?.common
    if (!common || typeof common !== 'object') continue
    const entries: Array<[string, unknown]> = Array.isArray(common)
      ? common.map(value =>
          Array.isArray(value) ? [value[0], value[1]] : [value.language, value.value],
        )
      : Object.entries(common)
    // Prefer the explicitly named script over regional fallbacks.
    for (const locale of ['zh-sg', 'zh-cn', 'zh-hans'])
      for (const [language, name] of entries)
        if (
          String(language).toLowerCase() === locale &&
          typeof name === 'string' &&
          name.trim()
        )
          result.set(row.id, name)
  }
  return result
}
