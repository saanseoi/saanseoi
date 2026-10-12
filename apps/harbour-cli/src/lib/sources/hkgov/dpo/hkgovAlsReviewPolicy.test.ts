import { expect, test } from 'bun:test'
import policy from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-review-policy.json'
import {
  alsReviewScope,
  parseAlsReviewPolicy,
  permitsAlsReviewIssue,
} from './hkgovAlsReviewPolicy'

test('review policies preserve the authorised year boundary without extrapolating', () => {
  for (const code of ['confident-continuity', 'defer-investigation'] as const) {
    expect(alsReviewScope(code, '2025-12-31.9')).toBeUndefined()
    expect(alsReviewScope(code, '2026-01-01.0')).toBeDefined()
    expect(alsReviewScope(code, '2026-12-31.9')).toBeDefined()
    expect(alsReviewScope(code, '2027-01-01.0')).toBeUndefined()
  }
  expect(alsReviewScope('confident-continuity', '2026-08-19.0')?.id).toBe(
    'confident-2026-continuity',
  )
  expect(permitsAlsReviewIssue('reviewed-inventory-omission', '2026-08-19.0')).toBe(
    true,
  )
  expect(permitsAlsReviewIssue('reviewed-inventory-omission', '2025-12-16.0')).toBe(
    false,
  )
  expect(permitsAlsReviewIssue('invalid-parent', '2026-08-19.0')).toBe(false)
})

test('unknown, structural, overlapping and unbounded policies fail before execution', () => {
  for (const change of [
    (p: any) => {
      p.scopes[0].code = 'skip-all-checks'
    },
    (p: any) => {
      p.scopes[0].sourceVersionBefore = undefined
    },
    (p: any) => {
      p.scopes.push(p.scopes[0])
    },
    (p: any) => {
      p.scopes[1].issueCodes.push('invalid-parent')
    },
  ]) {
    const changed = structuredClone(policy)
    change(changed)
    expect(() => parseAlsReviewPolicy(changed)).toThrow()
  }
})

test('DPO runtime keeps release literals and monthly review handlers in data', async () => {
  const { readdir, readFile } = await import('node:fs/promises')
  const months =
    '(January|February|March|April|May|June|July|August|September|October|November|December)'
  for (const name of await readdir(import.meta.dir)) {
    if (!name.endsWith('.ts') || name.endsWith('.test.ts')) continue
    expect(name).not.toMatch(new RegExp(`${months}(?:20\\d{2})?Review\\.ts$`))
    const source = await readFile(`${import.meta.dir}/${name}`, 'utf8')
    expect(source).not.toMatch(/['"`]20\d{2}-\d{2}-\d{2}\.\d+['"`]/)
    expect(source).not.toMatch(/startsWith\(['"]20\d{2}-['"]\)/)
  }
})
