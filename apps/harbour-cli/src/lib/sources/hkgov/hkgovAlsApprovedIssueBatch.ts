import { AssertionError, strict as assert } from 'node:assert'
import { isDeepStrictEqual } from 'node:util'
import { buildDeterministicUuidV5 } from '@repo/db'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-approved-issue-batch.json'
import { als3dHash, type Als3dFeature } from './hkgovAls3d'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

const curationFile = 'hkgov-dpo-address-approved-issue-batch.json'
const namespace = '3fc33c3e-2837-4fc7-a331-439be8c2c981'
type Decision = (typeof fixture.decisions)[number]
function matches(rule: Decision, csu: string | null | undefined, en: any) {
  return (
    rule.csus.includes(csu ?? '') &&
    en?.EngEstate?.EstateName === rule.estate &&
    new RegExp(rule.pattern).test(en?.BuildingName ?? '')
  )
}
function rowEvidence(row: PreparedHkgovAlsRow) {
  return {
    premises: {
      BuildingCsuInformation: { CsuId: row.hkgovCsuId },
      ChiPremisesAddress: JSON.parse(row.chiPremisesAddressJson ?? '{}'),
      EngPremisesAddress: JSON.parse(row.engPremisesAddressJson ?? '{}'),
      GeoAddress: row.geoAddress,
    },
    geometry: JSON.parse(row.geometry ?? 'null'),
  }
}

/** Reviewed records only; raw bilingual assertions remain unchanged for 3D ownership. */
export function applyApprovedIssueBatch(
  rows: PreparedHkgovAlsRow[],
  version: string,
  skipCurationChecks = false,
) {
  for (const rule of fixture.decisions) {
    try {
      const release = rule.releases.find(r => r.version === version)
      if (!release || !rows.some(r => r.enEstateName === rule.estate)) continue
      const candidates = rows.filter(r =>
        matches(rule, r.hkgovCsuId, JSON.parse(r.engPremisesAddressJson ?? '{}')),
      )
      assert.equal(
        candidates.length,
        release.count,
        `Issue ${rule.id}: source count changed`,
      )
      for (const row of candidates)
        assert(
          rule.assertions.some(
            a =>
              a.kind === '2d' &&
              a.versions.includes(version) &&
              isDeepStrictEqual(a.evidence, rowEvidence(row)),
          ),
          `Issue ${rule.id}: source evidence changed`,
        )
      if (!candidates.length) continue
      const evidence = candidates.map(row => ({ ...row }))
      let owner: PreparedHkgovAlsRow | undefined
      if (rule.action === 'suppress') {
        if ('ownerCsu' in rule && rule.ownerCsu) {
          const owners = rows.filter(
            r =>
              r.hkgovCsuId === rule.ownerCsu &&
              r.enEstateName === rule.estate &&
              new RegExp(rule.ownerPattern!).test(
                JSON.parse(r.engPremisesAddressJson ?? '{}').BuildingName ?? '',
              ),
          )
          assert.equal(owners.length, 1, `Issue ${rule.id}: retained owner changed`)
          owner = owners[0]
          assert(
            rule.assertions.some(
              a =>
                a.kind === 'owner2d' &&
                a.versions.includes(version) &&
                isDeepStrictEqual(a.evidence, rowEvidence(owner!)),
            ),
            `Issue ${rule.id}: owner evidence changed`,
          )
        }
        const discarded = new Set(candidates)
        rows.splice(0, rows.length, ...rows.filter(r => !discarded.has(r)))
      } else {
        owner = candidates.find(r => r.enStreetNumberFrom === '6H') ?? candidates[0]!
        const discarded = new Set(candidates.filter(r => r !== owner))
        rows.splice(0, rows.length, ...rows.filter(r => !discarded.has(r)))
        if (rule.action === 'number' || rule.action === 'street') {
          for (const language of ['en', 'zhHant'] as const) {
            const previous = owner[`${language}StreetNumberFrom`]
            if (previous)
              owner[`${language}FormattedAddress`] =
                owner[`${language}FormattedAddress`]?.replace(previous, rule.number!) ??
                null
            owner[`${language}StreetNumberFrom`] = rule.number!
          }
          owner.identityNumberFrom = rule.number!
          owner.identitySummary = {
            ...owner.identitySummary,
            numberFrom: rule.number!,
          }
        }
        if (rule.action === 'street') {
          for (const [language, street] of [
            ['en', rule.enStreet],
            ['zhHant', rule.zhStreet],
          ] as const) {
            const previous = owner[`${language}StreetName`]
            if (previous)
              owner[`${language}FormattedAddress`] =
                owner[`${language}FormattedAddress`]?.replace(previous, street!) ?? null
            owner[`${language}StreetName`] = street!
          }
          owner.identityRouteNames = JSON.stringify([rule.enStreet, rule.zhStreet])
          owner.identitySummary = {
            ...owner.identitySummary,
            routeKind: 'street',
            routeName: rule.enStreet!,
          }
        }
        if (rule.action === 'label') {
          for (const [language, name] of [
            ['en', rule.enName],
            ['zhHant', rule.zhName],
          ] as const) {
            const previous = owner[`${language}BuildingName`]
            if (previous)
              owner[`${language}FormattedAddress`] =
                owner[`${language}FormattedAddress`]?.replace(previous, name!) ?? null
            owner[`${language}BuildingName`] = name!
          }
          owner.identitySummary = {
            ...owner.identitySummary,
            buildingName: rule.enName!,
          }
        }
        {
          const id = `ss-${buildDeterministicUuidV5(namespace, rule.id)}`
          owner.identityAlias = owner.id
          owner.id = owner.canonicalId = owner.identityBuildingId = id
          owner.identityKey =
            owner.identityContinuityKey = `reviewed-premise:${rule.id}`
          owner.identityMatchMethod = 'reviewed-premise-consolidation'
        }
      }
      if (owner)
        owner.sources = JSON.stringify({
          ...JSON.parse(owner.sources),
          hkgovAlsApprovedIssues: [
            ...(JSON.parse(owner.sources).hkgovAlsApprovedIssues ?? []),
            {
              id: rule.id,
              authority: fixture.authority,
              curationFile,
              sourceVersion: version,
              sourceEvidence: evidence,
            },
          ],
        })
    } catch (error) {
      if (!skipCurationChecks || !(error instanceof AssertionError)) throw error
      console.warn(
        `Unresolved curation retained without applying ${rule.id}: ${error.message}`,
      )
    }
  }
}

/** Keep the raw 3D source, but never materialise the reviewed duplicate collection. */
export function approvedIssue3dSuppression(feature: Als3dFeature, version: string) {
  const p = feature.properties.Address.PremisesAddress
  const rule = fixture.decisions.find(
    r =>
      r.action === 'suppress' &&
      r.releases.some(v => v.version === version) &&
      matches(r, p.BuildingCsuInformation?.CsuId, p.EngPremisesAddress),
  )
  if (!rule) return undefined
  const premises = structuredClone(p)
  delete premises.EngPremisesAddress?.Eng3dAddress
  delete premises.ChiPremisesAddress?.Chi3dAddress
  const inventoryHash = als3dHash([
    p.EngPremisesAddress?.Eng3dAddress,
    p.ChiPremisesAddress?.Chi3dAddress,
  ])
  assert(
    rule.assertions.some(
      a =>
        a.kind === '3d' &&
        a.versions.includes(version) &&
        a.inventory?.hash === inventoryHash &&
        isDeepStrictEqual(a.evidence, { premises, geometry: feature.geometry }),
    ),
    `Issue ${rule.id}: 3D source evidence changed`,
  )
  return {
    id: rule.id,
    dataset: 'saanseoi-address3d-suppression',
    sourceFile: curationFile,
    sourceVersion: version,
    authority: fixture.authority,
  }
}
