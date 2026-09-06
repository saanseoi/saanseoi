import { readdir } from 'node:fs/promises'
import {
  createPlaceAddressMatcher,
  normaliseAddressText,
  parsePlaceAddress,
  type PlaceAddressDefinition,
} from '../apps/harbour-cli/src/lib/placeSql/placeAddressMatcher.ts'

// Read-only diagnostic: raw CSU identifiers are reference evidence, not API IDs.
const source =
  'data/overture/2025-09-24.0/divisions/China/Hong Kong/place.division.intersects.clipSmart.parquet'
const als = 'data/hkgov/dpo/ALS/20250903-1043-ALS-GeoJSON'
const definitions: PlaceAddressDefinition[] = []
const villages = new Set<string>()
for (const file of (await readdir(als)).sort()) {
  if (!file.endsWith('.geojson') || file.includes('_3d_')) continue
  const collection = await Bun.file(`${als}/${file}`).json()
  for (const feature of collection.features) {
    const p = feature.properties.Address.PremisesAddress
    for (const [prefix, locale] of [
      ['Eng', 'en'],
      ['Chi', 'zh-hant'],
    ] as const) {
      const a = p[`${prefix}PremisesAddress`]
      if (!a) continue
      const street = a[`${prefix}Street`]
      const village = a[`${prefix}Village`]
      if (village?.VillageName) villages.add(normaliseAddressText(village.VillageName))
      definitions.push({
        addressId: p.GeoAddress,
        locale,
        formattedAddress: null,
        buildingName: a.BuildingName ?? null,
        estateName: a[`${prefix}Estate`]?.EstateName ?? null,
        streetName: street?.StreetName ?? null,
        buildingNumberFrom: street?.BuildingNoFrom ?? null,
        buildingNumberTo: street?.BuildingNoTo ?? null,
        buildingNumberExpression: null,
        blockExpression: null,
        phaseExpression: null,
      })
    }
  }
}
const matcher = createPlaceAddressMatcher(definitions)
const villagePatterns = [...villages]
  .filter(Boolean)
  .map(
    name =>
      new RegExp(
        `(?:^|[^A-Z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^A-Z0-9])`,
        'u',
      ),
  )
const process = Bun.spawn(
  [
    'duckdb',
    '-json',
    '-c',
    `SELECT id, names.primary AS name, addresses[1].country AS country, to_json(list_transform(addresses, a -> a.freeform)) AS texts FROM read_parquet('${source}')`,
  ],
  { stdout: 'pipe', stderr: 'pipe' },
)
const output = await new Response(process.stdout).text()
if (await process.exited) throw new Error(await new Response(process.stderr).text())
const rows = JSON.parse(output)
const counts: Record<string, number> = {}
const examples: Record<string, unknown[]> = {}
const cache = new Map<string, string>()
const priority = [
  'street_number',
  'named_building_or_estate',
  'village_reference',
  'street_only',
  'unrecognised',
]
let excluded = 0,
  missingCountry = 0,
  withoutFreeform = 0
for (const row of rows) {
  if (['CN', 'MO'].includes(row.country?.toUpperCase())) {
    excluded++
    continue
  }
  if (!row.country) missingCountry++
  const texts = (
    typeof row.texts === 'string' ? JSON.parse(row.texts) : (row.texts ?? [])
  ).filter((s: unknown) => typeof s === 'string' && s.trim()) as string[]
  if (!texts.length) {
    withoutFreeform++
    continue
  }
  const categories = texts.map(text => {
    const cached = cache.get(text)
    if (cached) return cached
    const parsed = parsePlaceAddress(text, matcher)
    const category =
      parsed.disposition === 'premise-candidate'
        ? 'street_number'
        : parsed.recognised2dComponents.length
          ? 'named_building_or_estate'
          : villagePatterns.some(pattern =>
                pattern.test(parsed.normalisedAddress2dText),
              )
            ? 'village_reference'
            : parsed.street
              ? 'street_only'
              : 'unrecognised'
    cache.set(text, category)
    return category
  })
  const category = priority.find(category => categories.includes(category))
  if (!category) throw new Error(`No address category found for Place ${row.id}`)
  counts[category] = (counts[category] ?? 0) + 1
  examples[category] ??= []
  const sample = examples[category]
  if (sample.length < 50)
    sample.push({ id: row.id, name: row.name, country: row.country, texts })
}
const denominator = Object.values(counts).reduce((a, b) => a + b, 0)
console.log(
  JSON.stringify(
    {
      source,
      als,
      method:
        'Mutually exclusive best evidence per eligible Place across all freeforms. ALS bilingual streets/buildings/estates; village name detection is audit-only. No identity resolution or accuracy claim. No geometry or aliases. No newer LandsD streets.',
      rawPlaces: rows.length,
      excluded,
      missingCountry,
      withoutFreeform,
      denominator,
      distinctFreeforms: cache.size,
      categories: Object.fromEntries(
        Object.entries(counts).map(([key, count]) => [
          key,
          { count, percent: +((100 * count) / denominator).toFixed(2) },
        ]),
      ),
      examples,
    },
    null,
    2,
  ),
)
