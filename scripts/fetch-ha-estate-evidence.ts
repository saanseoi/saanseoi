import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = 'https://www.housingauthority.gov.hk/json/property-location'
const output = resolve('.local/hkgov-dpo/ha-estate-evidence.json')
const get = async (url: string) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`${response.status}: ${url}`)
  return response.json()
}
const records: unknown[] = []
for (const [category, regionFile] of [
  ['PRH', 'prh-regions.json'],
  ['HOS', 'hos-regions.json'],
]) {
  const directory = await get(`${root}/${regionFile}`)
  const districts = directory.regionArray.flatMap(
    (area: { district: { id: number }[] }) => area.district,
  )
  for (let i = 0; i < districts.length; i += 4) {
    const results = await Promise.all(
      districts.slice(i, i + 4).map(async (district: { id: number }) => {
        const url = `${root}/detail/${category}/${district.id}.json`
        return {
          url,
          retrievedAt: new Date().toISOString(),
          category,
          profiles: await get(url),
        }
      }),
    )
    records.push(...results)
    console.info(
      `${category}: ${Math.min(i + 4, districts.length)}/${districts.length} districts`,
    )
  }
}
await mkdir(resolve('.local/hkgov-dpo'), { recursive: true })
await writeFile(output, `${JSON.stringify({ records }, null, 2)}\n`)
console.info(output)
