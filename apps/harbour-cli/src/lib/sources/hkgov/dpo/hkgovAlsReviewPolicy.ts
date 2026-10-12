import { strict as assert } from 'node:assert'
import policy from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-review-policy.json'
import { object, string, strings, version } from './hkgovAlsReviewValidation'

type Scope = { sourceVersionFrom: string; sourceVersionBefore: string } & (
  | { code: 'confident-continuity'; id: string; authority: string }
  | { code: 'defer-investigation'; issueCodes: string[] }
)
const deferrableIssueCodes = new Set([
  'identity-drift',
  'unverified-curation',
  'street-component-conflict',
  'reviewed-inventory-omission',
  'hierarchy-evidence-conflict',
])
export function parseAlsReviewPolicy(input: unknown): {
  scopes: Scope[]
  retentionAliasFiles: string[]
  coalescenceAliasFiles: string[]
} {
  object(input)
  assert.equal(input.schemaVersion, 1, 'Unsupported ALS review policy version')
  strings(input.retentionAliasFiles)
  strings(input.coalescenceAliasFiles)
  assert(Array.isArray(input.scopes), 'Missing review policy scopes')
  const scopes: Scope[] = []
  for (const raw of input.scopes) {
    object(raw)
    version(raw.sourceVersionFrom)
    version(raw.sourceVersionBefore)
    assert(raw.sourceVersionFrom < raw.sourceVersionBefore, 'Empty review policy scope')
    assert(
      !scopes.some(
        s =>
          s.code === raw.code &&
          s.sourceVersionFrom < (raw.sourceVersionBefore as string) &&
          (raw.sourceVersionFrom as string) < s.sourceVersionBefore,
      ),
      'Overlapping review policy scopes',
    )
    if (raw.code === 'confident-continuity') {
      string(raw.id)
      string(raw.authority)
    } else {
      assert.equal(raw.code, 'defer-investigation', 'Unknown review policy code')
      strings(raw.issueCodes)
      assert(
        raw.issueCodes.every(code => deferrableIssueCodes.has(code)),
        'Structural or unknown issues cannot be deferred',
      )
    }
    scopes.push(raw as Scope)
  }
  return {
    scopes,
    retentionAliasFiles: input.retentionAliasFiles,
    coalescenceAliasFiles: input.coalescenceAliasFiles,
  }
}
export const alsReviewPolicy = parseAlsReviewPolicy(policy)
export function alsReviewScope<C extends Scope['code']>(
  code: C,
  sourceVersion: string,
): Extract<Scope, { code: C }> | undefined {
  return alsReviewPolicy.scopes.find(
    s =>
      s.code === code &&
      sourceVersion >= s.sourceVersionFrom &&
      sourceVersion < s.sourceVersionBefore,
  ) as Extract<Scope, { code: C }> | undefined
}
export function permitsAlsReviewIssue(code: string, sourceVersion: string) {
  return (
    alsReviewScope('defer-investigation', sourceVersion)?.issueCodes.includes(code) ??
    false
  )
}
