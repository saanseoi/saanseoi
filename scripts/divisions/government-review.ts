import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { readHkgovHadDistrictArchive } from '../../apps/harbour-cli/src/lib/sources/hkgov/had/hkgovHad'
import { parseHkgovCenstatdDistrictGml } from '../../apps/harbour-cli/src/lib/sources/hkgov/censtatd/hkgovCenstatdGml'
import identities from '../../fixtures/meta/curations/identity/dr-hk-hkgov-censtatd-division-statistic-subdivided-units-district-2021.json'

/** Review-only alternatives: never merged into active reference areas or hierarchy. */
export async function governmentDistrictCandidates(root: string) {
  const profiles = [
    {
      path: 'data/hkgov/csdi/hkgov-censtatd-division-statistic-land-area-population-density-district/2021.0.gml',
      hash: '1311120e4bbcbb07995df993b9af6d859d242e13ad4c288f018fb84204f9667f',
      layer: 'Density_2024',
      label: 'C&SD 2024 · district extent',
      variant: 'hkgov-censtatd-2024',
      edition: '2024',
    },
    {
      path: 'data/hkgov/csdi/archive/had_rcd_1634523272907_75218/2025-Q3/source.zip',
      hash: 'a330392727b8354df7e094b3ba2c5d2c500d75b15569739805ce149ca99c6678',
      layer: '',
      label: 'HAD 2022 · native district extent',
      variant: 'hkgov-had',
      edition: '2022',
    },
    {
      path: 'data/hkgov/censtatd/district-council-districts-2021.gml',
      hash: '95d8d1dd508dc7508df65633504e8fe08eda10ff30d465539337d17c0ead9f38',
      layer: 'DC_21C_SDU',
      label: 'C&SD 2021 · detailed census boundary',
      variant: 'hkgov-censtatd-2021',
      edition: '2021',
    },
  ]
  const features = []
  for (const profile of profiles) {
    const bytes = await readFile(resolve(root, profile.path))
    if (createHash('sha256').update(bytes).digest('hex') !== profile.hash)
      throw new Error(`Government review source checksum mismatch: ${profile.path}`)
    const rows = profile.layer
      ? parseHkgovCenstatdDistrictGml(bytes.toString('utf8'), profile.layer)
      : (await readHkgovHadDistrictArchive(bytes)).features
    const seen = new Set<string>()
    for (const row of rows) {
      const p = row.properties as Record<string, unknown>
      const identity = identities.mappings.find(mapping =>
        profile.layer
          ? mapping.externalCode === String(Number(p.DC ?? p.dc))
          : mapping.externalId === p.AREA_ID,
      )
      if (!identity || seen.has(identity.canonicalId))
        throw new Error(
          `Unresolved or duplicate government district: ${JSON.stringify(p)}`,
        )
      seen.add(identity.canonicalId)
      features.push({
        type: 'Feature' as const,
        geometry: row.geometry,
        properties: {
          divisionId: identity.canonicalId,
          variant: profile.variant,
          sourceLabel: profile.label,
          sourceCohort: profile.edition,
          sourceAreaId: String(p.CSDI_ADMIN_AREA_ID ?? p.DC ?? p.dc),
          sourceFile: profile.path,
          sourceSha256: profile.hash,
          reviewOnly: true,
        },
      })
    }
    if (seen.size !== 18)
      throw new Error(`Expected 18 government districts: ${profile.path}`)
  }
  return { type: 'FeatureCollection' as const, features }
}
