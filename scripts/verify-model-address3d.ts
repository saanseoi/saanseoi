import { execFileSync } from 'node:child_process'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { prepareAls3dCollections } from '../apps/harbour-cli/src/lib/sources/hkgov/dpo/hkgovAls3dPreparation'
import { readAls3dFeatures } from '../apps/harbour-cli/src/lib/sources/hkgov/dpo/hkgovAls3d'
import { validateAddress3dPreparation } from '../apps/harbour-cli/src/lib/pipeline/addresses/address3dImport'
import { normaliseAddressRowForPipeline } from '../libs/core/src/pipeline/services/addressPipeline/normalisation'

const output = resolve('.local/hkgov-dpo/model-address3d-verification')
await mkdir(output, { recursive: true })
const rows = JSON.parse(
  execFileSync(
    'duckdb',
    [
      '-json',
      '-c',
      "SELECT * FROM read_parquet('.local/hkgov-dpo/prepared/hkgov-hk-2026-08-19.0-address.parquet') WHERE enEstateName = 'MODEL HOUSING ESTATE';",
    ],
    { encoding: 'utf8' },
  ),
)
const features = []
for await (const { feature } of readAls3dFeatures(
  'data/hkgov/dpo/ALS/20260819-1047-ALS-GeoJSON/als_addresses_3d_(public_rental_housing).geojson',
)) {
  if (
    feature.properties.Address.PremisesAddress.EngPremisesAddress?.EngEstate
      ?.EstateName === 'MODEL HOUSING ESTATE'
  )
    features.push(feature)
}
await writeFile(
  `${output}/als_addresses_3d_(public_rental_housing).geojson`,
  JSON.stringify({ type: 'FeatureCollection', features }, null, 2),
)
const preparedPath = `${output}/model.parquet`
const stats = await prepareAls3dCollections({
  sourceDir: output,
  sourceVersion: '2026-08-19.0',
  outputFile: preparedPath,
  rows,
})
await validateAddress3dPreparation(`${preparedPath}.address3d.jsonl`, '2026-08-19.0')
const collections = (await readFile(`${preparedPath}.address3d.jsonl`, 'utf8'))
  .trim()
  .split('\n')
  .map(line => JSON.parse(line))
  .filter(row => row.kind === 'collection')
const normalised = rows.map((row: Record<string, unknown>) =>
  normaliseAddressRowForPipeline(row),
)
const result = {
  stats,
  rows: normalised.map(row => ({
    id: row.canonicalId,
    parentId: row.base.parentAddressId,
    granularity: row.base.granularity,
    name: row.i18n.find(x => x.locale === 'en')?.formattedAddress,
  })),
  collections: collections.map(row => ({
    id: row.id,
    ownerId: row.address2dId,
    unitCount: row.unitCount,
    sourceOccurrences: row.sourceRecordIds.length,
    unresolvedSections: row.unresolvedSectionIds.length,
  })),
}
await writeFile(`${output}/result.json`, JSON.stringify(result, null, 2))
console.info(JSON.stringify(result, null, 2))
