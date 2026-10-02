import { expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { releaseSetVersionsForPublication } from './releaseSetVersions'

test('every declared domain primary has explicit publication versions', () => {
  const directory = resolve(
    import.meta.dir,
    '../../../../../fixtures/meta/apiCompositions',
  )
  for (const filename of readdirSync(directory).filter(name =>
    name.endsWith('.json'),
  )) {
    const composition = JSON.parse(readFileSync(join(directory, filename), 'utf8'))
    for (const domain of composition.domains) {
      expect(domain).not.toHaveProperty('rulesetVersion')
      for (const member of domain.members.filter(
        (row: { role: string }) => row.role === 'primary',
      )) {
        expect(
          releaseSetVersionsForPublication(
            member.resourceType,
            domain.code,
            member.variant,
          ),
        ).toEqual({
          schemaVersion: expect.any(String),
          rulesetVersion: expect.any(String),
        })
      }
    }
  }
})

test('native and curated geographic publications select their own explicit rulesets', () => {
  expect(
    releaseSetVersionsForPublication('division', 'geographic', 'overture')
      .rulesetVersion,
  ).toBe('rs-division-merge-v1')
  expect(
    releaseSetVersionsForPublication('division', 'geographic', 'saanseoi')
      .rulesetVersion,
  ).toBe('rs-division-merge-v2')
  expect(() =>
    releaseSetVersionsForPublication('division', 'unknown', 'overture'),
  ).toThrow('No explicit API release versions')
  expect(() =>
    releaseSetVersionsForPublication('division', 'geographic', 'unknown'),
  ).toThrow('No explicit API release versions')
})
