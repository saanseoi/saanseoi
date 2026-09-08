import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { resolveLocalAddressDbContext } from '../../../harbour-cli/src/lib/dbCache/localDbCache.ts'
import { loadDivisionLookupMaps } from '../../../harbour-cli/src/lib/sources/hkgov/hkgovAlsDivisions.ts'
import type { DivisionLookupMaps } from '../../../harbour-cli/src/lib/sources/hkgov/hkgovAlsTypes.ts'
import type { prepareHkgovAlsRelease } from '../commands/hkgovAls.ts'

type Input = Parameters<typeof prepareHkgovAlsRelease>[0]
type Result = Awaited<ReturnType<typeof prepareHkgovAlsRelease>>
export type ReviewResult = Pick<
  Result,
  'identityRecords' | 'driftCandidates' | 'curationApplications' | 'divisionQuality'
>
const root = resolve(import.meta.dir, '../../../..')

// Stream large source files: fingerprinting must not allocate another GeoJSON copy.
export async function fingerprintTree(path: string): Promise<string> {
  const hash = createHash('sha256')
  async function visit(file: string) {
    const info = await stat(file).catch(error => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    hash.update(file)
    if (!info) {
      hash.update('missing')
      return
    }
    if (info.isDirectory()) {
      for (const name of (await readdir(file)).sort()) await visit(join(file, name))
    } else {
      for await (const chunk of createReadStream(file)) hash.update(chunk)
    }
  }
  await visit(path)
  return hash.digest('hex')
}

function sortedMapEntries(values: ReadonlyMap<string, string>) {
  return [...values.entries()].sort(([left], [right]) => left.localeCompare(right))
}

function sortedSetValues(values: ReadonlySet<string>) {
  return [...values].sort((left, right) => left.localeCompare(right))
}

/**
 * ALS review only reads the selected Overture division lookup. Address uploads
 * write several local D1 databases, none of which alter that lookup; keying the
 * checkpoint from the whole persistence root therefore defeated --continue.
 */
export function divisionLookupFingerprint(lookup: DivisionLookupMaps) {
  return {
    ambiguousAreaEn: sortedSetValues(lookup.ambiguousAreaEn),
    ambiguousAreaZh: sortedSetValues(lookup.ambiguousAreaZh),
    ambiguousDistrictEn: sortedSetValues(lookup.ambiguousDistrictEn),
    ambiguousDistrictZh: sortedSetValues(lookup.ambiguousDistrictZh),
    areaByEn: sortedMapEntries(lookup.areaByEn),
    areaByZh: sortedMapEntries(lookup.areaByZh),
    countryId: lookup.countryId,
    districtByEn: sortedMapEntries(lookup.districtByEn),
    districtByZh: sortedMapEntries(lookup.districtByZh),
    snapshotId: lookup.snapshotId,
  }
}

export async function divisionLookupDependency(input: Input) {
  // Remote targets do not reuse preflight checkpoints, so never make an extra
  // remote lookup merely to construct a cache key.
  if (input.target.remote) return null

  const dbPath =
    typeof input.args.options.db === 'string'
      ? resolve(input.args.options.db)
      : undefined
  const context = dbPath
    ? null
    : await resolveLocalAddressDbContext(
        input.target,
        'hk',
        input.addressCohortKey.slice(0, 4),
        { cacheTableProfile: 'address', includeAllHistoryShardYears: true },
      )
  try {
    return divisionLookupFingerprint(
      await loadDivisionLookupMaps({
        cohortKey: input.divisionCohortKey,
        dbPath,
        currentDb: context?.currentDb,
        historyDb: context?.historyDb,
        historyShards: context
          ? new Map(
              context.historyTargets.map(target => [
                target.bindingName,
                { bindingName: target.bindingName, db: target.db as never },
              ]),
            )
          : undefined,
        metaDb: context?.metaDb,
        environment: input.target.environment,
      }),
    )
  } finally {
    await context?.cleanup()
  }
}

export async function isolatedAlsReview(input: Input): Promise<ReviewResult> {
  const dependencies = await Promise.all([
    ...[
      'apps/harbour-dataops/src',
      'apps/harbour-cli/src',
      'libs/core/src',
      'libs/db/src',
      'fixtures/meta/curations',
      'bun.lock',
    ].map(path => fingerprintTree(join(root, path))),
    fingerprintTree(input.sourceDir),
    divisionLookupDependency(input),
  ])
  const key = createHash('sha256')
    .update(JSON.stringify({ version: 2, runtime: Bun.version, input, dependencies }))
    .digest('hex')
  const directory = join(root, '.local/hkgov-dpo/preflight-cache')
  await mkdir(directory, { recursive: true })
  const checkpoint = join(directory, `${key}.json`)
  // Local, pinned one-off reuse for the approved Block 4 geometry-only correction.
  // Old successful reviews have identical identity, division and estate results.
  if (
    !input.target.remote &&
    input.sourceVersion >= '2024-07-25.0' &&
    input.sourceVersion < '2026-04-25.0'
  ) {
    const approval = await Bun.file(join(directory, '../block-4-cache-reuse.json'))
      .json()
      .catch(() => null)
    const previousDependencies = block4ReviewDependencies(dependencies, approval)
    if (previousDependencies) {
      const previousKey = createHash('sha256')
        .update(
          JSON.stringify({
            version: 2,
            runtime: Bun.version,
            input,
            dependencies: previousDependencies,
          }),
        )
        .digest('hex')
      const previousCheckpoint = join(directory, `${previousKey}.json`)
      if (await Bun.file(previousCheckpoint).exists())
        return cachedReviewChild(input, previousCheckpoint, previousKey)
    }
  }
  return cachedReviewChild(input, checkpoint, key)
}

export function block4ReviewDependencies(
  dependencies: unknown[],
  approval: unknown,
): unknown[] | null {
  if (!approval || typeof approval !== 'object') return null
  const value = approval as { current?: unknown; previous?: unknown }
  if (
    !Array.isArray(value.current) ||
    !Array.isArray(value.previous) ||
    value.current.length !== 6 ||
    value.previous.length !== 6 ||
    !value.previous.every(
      item => typeof item === 'string' && /^[a-f0-9]{64}$/.test(item),
    ) ||
    JSON.stringify(dependencies.slice(0, 6)) !== JSON.stringify(value.current)
  )
    return null
  return [...value.previous, ...dependencies.slice(6)]
}

export async function cachedReviewChild(
  input: Input,
  checkpoint: string,
  key: string,
  worker = join(import.meta.dir, 'isolatedAlsReviewWorker.ts'),
): Promise<ReviewResult> {
  if (!input.target.remote && (await Bun.file(checkpoint).exists())) {
    try {
      const cached = await Bun.file(checkpoint).json()
      if (
        cached.key === key &&
        cached.result?.identityRecords &&
        cached.result?.divisionQuality &&
        Array.isArray(cached.result?.driftCandidates) &&
        Array.isArray(cached.result?.curationApplications)
      ) {
        console.info(`Reusing cached ALS preflight ${input.sourceVersion}`)
        return cached.result
      }
    } catch {
      /* A damaged checkpoint is rebuilt by a fresh child. */
    }
  }
  const temporary = `${checkpoint}.${process.pid}.${crypto.randomUUID()}`
  const request = `${temporary}.request`
  try {
    await Bun.write(request, JSON.stringify(input))
    const child = Bun.spawn([process.execPath, worker, request, temporary], {
      cwd: process.cwd(),
      env: process.env,
      stdout: 'inherit',
      stderr: 'inherit',
      stdin: 'ignore',
    })
    const code = await child.exited
    if (code !== 0) {
      const failure = await Bun.file(`${temporary}.failure.json`)
        .json()
        .catch(() => null)
      throw new Error(
        `${failure?.message ? `${failure.message}\n` : ''}ALS preflight ${input.sourceVersion} child exited with ${code}${child.signalCode ? ` (${child.signalCode})` : ''}; completed release checkpoints are retained.`,
      )
    }
    const result: ReviewResult = await Bun.file(temporary).json()
    await Bun.write(temporary, JSON.stringify({ key, result }))
    await rename(temporary, checkpoint)
    return result
  } finally {
    await rm(request, { force: true })
    await rm(temporary, { force: true })
    await rm(`${temporary}.failure.json`, { force: true })
  }
}
