import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'

const fixturePath = 'fixtures/meta/curations/hkgov-dpo-address-hierarchies.json'
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))
const audit = JSON.parse(
  await readFile('fixtures/meta/curations/hkgov-dpo-address-estate-audit.json', 'utf8'),
)
const rows = JSON.parse(
  execFileSync(
    'duckdb',
    [
      '-json',
      '-c',
      "SELECT hkgovCsuId,enEstateName,zhHantEstateName,enBuildingName,zhHantBuildingName,enBlockNumber,enStreetNumberFrom,enStreetNumberTo,enDistrict FROM read_parquet('.local/hkgov-dpo/prepared/hkgov-hk-2026-08-19.0-address.parquet') WHERE enEstateName IS NOT NULL;",
    ],
    { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 },
  ),
)
const clean = (value: string | null) =>
  value?.replace(/\s*\([^()]*\)$/, '').trim() ?? null
const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
const relationships = fixture.relationships.filter(
  (r: { generatedBy?: string }) => r.generatedBy !== 'build-als-verified-hierarchies',
)
const skips = []
for (const estate of audit.estates) {
  if (
    estate.status !== 'source_unique_with_current_ha_name_corroboration' ||
    relationships.some((r: any) => r.complex.enName === estate.name)
  )
    continue
  const complexCandidates = rows.filter(
    (row: any) =>
      row.enEstateName === estate.name &&
      !row.enBuildingName &&
      !row.enBlockNumber &&
      !row.enStreetNumberFrom &&
      !row.enStreetNumberTo,
  )
  if (complexCandidates.length > 1) {
    skips.push(estate.name)
    continue
  }
  const buildings = []
  let valid = true
  for (const building of estate.buildingReviews) {
    if (!building.unitCount) continue
    const candidates = rows.filter(
      (row: any) =>
        row.enEstateName === estate.name &&
        row.hkgovCsuId === building.csu &&
        clean(row.enBuildingName) === building.building,
    )
    if (candidates.length !== 1 || !candidates[0].zhHantBuildingName) {
      valid = false
      break
    }
    const row = candidates[0]
    buildings.push({
      id: `${slug(estate.name)}-${slug(building.building)}-${slug(building.csu)}`,
      source: { hkgovCsuId: building.csu },
      expected: {
        enBuildingName: row.enBuildingName,
        zhHantBuildingName: row.zhHantBuildingName,
        enBlockNumber: row.enBlockNumber,
        enStreetNumberFrom: row.enStreetNumberFrom,
        enStreetNumberTo: row.enStreetNumberTo,
      },
      threeDMapping: 'building_range',
      evidence: `One source occurrence and one matching prepared 2D premise. Building name corroborated by ${estate.externalEvidence[0].url}; no unit-to-section partition is asserted.`,
    })
  }
  if (!valid || !buildings.length) {
    skips.push(estate.name)
    continue
  }
  const template = rows.find((row: any) => row.enEstateName === estate.name)
  relationships.push({
    id: slug(estate.name),
    revision: 1,
    sourceVersionFrom: '2026-08-19.0',
    sourceVersionTo: '2026-08-19.0',
    generatedBy: 'build-als-verified-hierarchies',
    complex: {
      enName: estate.name,
      zhHantName: template.zhHantEstateName,
      streetName: '',
      zhHantStreetName: '',
    },
    buildings,
    evidence: estate.externalEvidence.map(
      (e: any) =>
        `${e.url} retrieved ${e.retrievedAt}; current estate and building names only.`,
    ),
    reason:
      'Create a source-guarded estate complex and retain each independently corroborated building as its direct child and unit-collection owner.',
  })
}
fixture.relationships = relationships
fixture.additional2dReview = skips
await writeFile(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`)
console.info(
  JSON.stringify(
    { relationships: relationships.length, additional2dReview: skips },
    null,
    2,
  ),
)
