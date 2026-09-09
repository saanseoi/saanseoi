import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import policy from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-house-retentions.json'

const cachePath = resolve(
  import.meta.dir,
  '../../../../../../.local/hkgov-dpo/curations/house-retention-evidence.jsonl',
)

type Evidence = { feature: unknown; [key: string]: unknown }
type CachedEvidence = {
  version: 1
  retentions: Record<string, { evidence2d: Evidence[]; evidence3d: Evidence[] }>
}
type RetentionEvidence = {
  feature: any
  hash: string
  evidenceSourceVersion: string
  sourceVersions: string[]
}
type HouseRetentionRule = Omit<
  (typeof policy.retentions)[number],
  'evidence2d' | 'evidence3d'
> & {
  evidence2d: RetentionEvidence[]
  evidence3d: RetentionEvidence[]
}
type HouseRetentionFixture = Omit<typeof policy, 'retentions'> & {
  retentions: HouseRetentionRule[]
}

function loadCache(): CachedEvidence {
  if (!existsSync(cachePath)) {
    const repositoryRoot = resolve(import.meta.dir, '../../../../../../')
    execFileSync('bun', ['scripts/build-als-house-retention-evidence.ts'], {
      cwd: repositoryRoot,
      stdio: 'inherit',
    })
  }
  if (existsSync(cachePath)) {
    const [header, ...records] = readFileSync(cachePath, 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))
    if (header?.version !== 1) throw new Error('Invalid ALS house-retention cache.')
    return {
      version: 1,
      retentions: Object.fromEntries(
        records.map(record => [record.id, record.evidence]),
      ),
    }
  }
  throw new Error(
    `Missing ALS house-retention evidence cache at ${cachePath}. Run bun scripts/build-als-house-retention-evidence.ts.`,
  )
}

/**
 * Publisher features are replayable source evidence, not a human decision. Keep them
 * out of versioned curation and merge them only at ingestion/test time.
 */
// JSON import inference cannot express the separately cached publisher features.
export function loadHouseRetentionFixture(): HouseRetentionFixture {
  const cache = loadCache()
  return {
    ...policy,
    retentions: policy.retentions.map(rule => {
      const evidence = cache.retentions[rule.id]
      if (!evidence)
        throw new Error(`Missing cached evidence for house retention ${rule.id}.`)
      return { ...rule, ...evidence }
    }),
  } as HouseRetentionFixture
}

export function writeHouseRetentionEvidenceCache(value: CachedEvidence) {
  mkdirSync(resolve(cachePath, '..'), { recursive: true })
  writeFileSync(
    cachePath,
    [
      JSON.stringify({ version: value.version }),
      ...Object.entries(value.retentions).map(([id, evidence]) =>
        JSON.stringify({ id, evidence }),
      ),
    ].join('\n') + '\n',
  )
}
