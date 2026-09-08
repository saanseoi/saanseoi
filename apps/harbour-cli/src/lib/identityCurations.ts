import ruleFixture from '../../../../fixtures/meta/processing-rules/geography-identities.json'
import { ruleDeclarationFromFixture } from '@repo/core/provenance'
import { requireDefined } from '@repo/core/requireDefined'
import { registerRule } from '@repo/core/provenance'
import { captureCurationDocuments } from './curationDocuments'
import { readFileSync, readdirSync } from 'node:fs'
import { computeVersionHash } from '@repo/db'

export type IdentityCuration = {
  versionHash: string
  resourceType: string
  cohortKey: string
  domain: string
  authority: string
  sourceDatasetCode: string
  sourceReleaseCode: string
  mappingMethod: string
  reviewStatus: string
  mappings: Array<{ externalId: string; externalCode?: string; canonicalId: string }>
}

/** Reviewed source evidence; never synchronised into the metadata database. */
export function readIdentityCurations() {
  const directory = new URL(
    '../../../../fixtures/meta/curations/identity/',
    import.meta.url,
  )
  return readdirSync(directory)
    .filter(name => name.endsWith('.json'))
    .sort()
    .map(name => {
      const fixture = JSON.parse(
        readFileSync(new URL(name, directory), 'utf8'),
      ) as IdentityCuration
      if (
        fixture.versionHash !== computeVersionHash(fixture) ||
        fixture.reviewStatus !== 'reviewed'
      ) {
        throw new Error(`Identity curation ${name} requires valid reviewed content.`)
      }
      return fixture
    })
}

function resolveIdentityCurationInternal(
  authority: string,
  cohortKey: string,
  domain: string,
) {
  const fixtures = readIdentityCurations().filter(
    fixture =>
      fixture.resourceType === 'division' &&
      fixture.authority === authority &&
      fixture.cohortKey === cohortKey &&
      fixture.domain === domain,
  )
  if (fixtures.length !== 1)
    throw new Error(
      `Expected one reviewed identity curation for ${authority}/${domain}/${cohortKey}; found ${fixtures.length}.`,
    )
  const rows = requireDefined(fixtures[0]).mappings
  if (
    !rows.length ||
    new Set(rows.map(row => row.externalId)).size !== rows.length ||
    rows.some(row => !row.externalId || !row.canonicalId)
  ) {
    throw new Error(
      `Incomplete or duplicate identity curation for ${authority}/${domain}/${cohortKey}.`,
    )
  }
  return captureCurationDocuments(
    rows.map(row => ({ ...row, externalCode: row.externalCode ?? null })),
    [{ type: 'identity-mappings', document: requireDefined(fixtures[0]) }],
  )
}

export const identityCurationRule = registerRule(
  ruleDeclarationFromFixture(ruleFixture),
  (input: { authority: string; cohortKey: string; domain: string }) =>
    resolveIdentityCurationInternal(input.authority, input.cohortKey, input.domain),
)

export function resolveIdentityCuration(
  authority: string,
  cohortKey: string,
  domain: string,
) {
  return identityCurationRule.execute({ authority, cohortKey, domain })
}
