import { globSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import {
  als3dHash,
  readAls3dFeatures,
} from '../apps/harbour-cli/src/lib/sources/hkgov/dpo/hkgovAls3d'

const root = resolve(process.argv[2] ?? 'data/hkgov/dpo/ALS')
const output = resolve(process.argv[3] ?? '.local/hkgov-dpo/address3d-audit.json')
const files = globSync(`${root}/*/als_addresses_3d_*.geojson`).sort()
const reports = []
for (const file of files) {
  const release = basename(dirname(file))
  const groups = new Map<
    string,
    {
      estate: string
      building: string
      csu: string
      district: string
      occurrences: unknown[]
      inventories: Set<string>
      unitCount: number
    }
  >()
  const estates2d = new Map<string, { count: number; buildings: Set<string> }>()
  for (const districtFile of globSync(
    `${dirname(file)}/als_addresses_(*_district).geojson`,
  )) {
    const data = JSON.parse(await readFile(districtFile, 'utf8'))
    for (const feature of data.features) {
      const en = feature.properties?.Address?.PremisesAddress?.EngPremisesAddress
      const name = en?.EngEstate?.EstateName
      if (!name) continue
      const estate = estates2d.get(name) ?? { count: 0, buildings: new Set<string>() }
      estate.count++
      if (en.BuildingName) estate.buildings.add(en.BuildingName)
      estates2d.set(name, estate)
    }
  }
  let featureCount = 0
  let sourceUnits = 0
  for await (const { feature, featureIndexOneBased } of readAls3dFeatures(file)) {
    const p = feature.properties.Address.PremisesAddress
    const en = p.EngPremisesAddress
    const zh = p.ChiPremisesAddress
    const estate = en?.EngEstate?.EstateName ?? ''
    const building = en?.BuildingName ?? ''
    const csu = p.BuildingCsuInformation?.CsuId ?? ''
    const district = en?.EngDistrict ?? ''
    // Candidate grouping only: repeated payloads still require reviewed ownership.
    const key = JSON.stringify([district, estate, building, csu, en?.EngBlock ?? null])
    const group = groups.get(key) ?? {
      estate,
      building,
      csu,
      district,
      occurrences: [],
      inventories: new Set<string>(),
      unitCount: 0,
    }
    const english = en?.Eng3dAddress ?? []
    const chinese = zh?.Chi3dAddress ?? []
    const hash = als3dHash([
      english.map(x => JSON.stringify(x)).sort(),
      chinese.map(x => JSON.stringify(x)).sort(),
    ])
    group.inventories.add(hash)
    group.unitCount = english.length
    group.occurrences.push({
      featureIndexOneBased,
      enStreet: en?.EngStreet,
      zhStreet: zh?.ChiStreet,
      coordinates: feature.geometry.coordinates,
      unitCount: english.length,
      inventoryHash: hash,
    })
    groups.set(key, group)
    featureCount++
    sourceUnits += english.length
  }
  const estates3d = new Set([...groups.values()].map(x => x.estate).filter(Boolean))
  const report = {
    release,
    featureCount,
    sourceUnits,
    estateCount3d: estates3d.size,
    estates2d: [...estates2d]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, e]) => ({
        name,
        records: e.count,
        buildingCount: e.buildings.size,
        has3d: estates3d.has(name),
      })),
    groups: [...groups.values()].map(({ inventories, ...g }) => ({
      ...g,
      inventoryCount: inventories.size,
      reviewReasons: [
        ...(!g.estate ? ['missing_estate'] : []),
        ...(!g.building ? ['missing_building'] : []),
        ...(g.occurrences.length > 1 ? ['multiple_source_occurrences'] : []),
        ...(inventories.size > 1 ? ['different_unit_inventories'] : []),
      ],
    })),
  }
  reports.push(report)
  console.info(
    JSON.stringify({
      release,
      featureCount,
      estates2d: estates2d.size,
      estates3d: estates3d.size,
      reviewGroups: report.groups.filter(x => x.reviewReasons.length).length,
    }),
  )
}
await mkdir(dirname(output), { recursive: true })
await writeFile(output, `${JSON.stringify({ version: 1, reports }, null, 2)}\n`)
console.info(`Audit written to ${output}`)
