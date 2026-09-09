import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import policy from '../fixtures/meta/curations/hkgov-dpo-address-house-retentions.json'

const sourceRoot = 'data/hkgov/dpo/ALS'
const outputPath = '.local/hkgov-dpo/curations/house-retention-evidence.jsonl'
const releases = await readdir(sourceRoot)
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')

async function featureFor(
  sourceVersion: string,
  expectedHash: string,
  kind: '2d' | '3d',
) {
  const date = sourceVersion.replaceAll('-', '').slice(0, 8)
  const release = releases.find(value => value.startsWith(`${date}-`))
  if (!release) throw new Error(`No retained ALS release for ${sourceVersion}.`)
  const directory = `${sourceRoot}/${release}`
  const files = (await readdir(directory)).filter(
    file =>
      file.endsWith('.geojson') &&
      (kind === '3d'
        ? file === 'als_addresses_3d_(public_rental_housing).geojson'
        : !file.startsWith('als_addresses_3d_')),
  )
  for (const file of files) {
    const payload = JSON.parse(await readFile(`${directory}/${file}`, 'utf8'))
    const feature = payload.features?.find(
      (candidate: unknown) => hash(candidate) === expectedHash,
    )
    if (feature) return feature
  }
  throw new Error(`Could not recover ${kind} evidence ${expectedHash} from ${release}.`)
}

const retentions: Record<string, unknown> = {}
for (const rule of policy.retentions) {
  retentions[rule.id] = {
    evidence2d: await Promise.all(
      rule.evidence2d.map(async evidence => ({
        ...evidence,
        feature: await featureFor(evidence.evidenceSourceVersion, evidence.hash, '2d'),
      })),
    ),
    evidence3d: await Promise.all(
      rule.evidence3d.map(async evidence => ({
        ...evidence,
        feature: await featureFor(evidence.evidenceSourceVersion, evidence.hash, '3d'),
      })),
    ),
  }
}
await mkdir('.local/hkgov-dpo/curations', { recursive: true })
await writeFile(
  outputPath,
  [
    JSON.stringify({ version: 1 }),
    ...Object.entries(retentions).map(([id, evidence]) =>
      JSON.stringify({ id, evidence }),
    ),
  ].join('\n') + '\n',
)
console.info(`Wrote ${outputPath}.`)
