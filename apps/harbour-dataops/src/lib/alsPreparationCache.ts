import { continuityPredecessorFingerprint } from '../../../harbour-cli/src/lib/sources/hkgov/dpo/hkgovAlsConfidentContinuity'
import { emptyHkgovAlsIdentityHistory } from '../../../harbour-cli/src/lib/sources/hkgov/dpo/hkgovAlsDrift'
import { readFile, open, rename, rm, mkdir } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import {
  divisionLookupDependency,
  fingerprintTree,
  fingerprintRuntimeTree,
} from './isolatedAlsReview.ts'
import { fileSha256 } from '../../../harbour-cli/src/lib/pipeline/addresses/address3dImport.ts'
import {
  sha256,
  withDeliveryLock,
} from '../../../harbour-cli/src/lib/pipeline/local/sqlDeliveryFiles.ts'
import type { prepareHkgovAlsRelease } from '../commands/hkgovAls.ts'

type Input = Parameters<typeof prepareHkgovAlsRelease>[0]
type Result = Awaited<ReturnType<typeof prepareHkgovAlsRelease>>
const root = resolve(import.meta.dir, '../../../..')

/** Processing metadata is an input; catalogue and dataset composition are not. */
export async function alsPreparationMetadataFingerprint(
  metadataRoot = join(root, 'fixtures/meta'),
) {
  const dependencies = await Promise.all(
    [
      'curations',
      'processing-rules',
      'rulesetVersions',
      'snapshotProcessingRules.json',
      'divisionCodes',
      'patches',
    ].map(path => fingerprintTree(join(metadataRoot, path))),
  )
  return sha256(JSON.stringify(dependencies))
}

export async function alsPreparationKey(
  input: Input,
  observe?: (components: Record<string, string>) => void,
) {
  const dependencies = await Promise.all([
    ...[
      'apps/harbour-dataops/src',
      'apps/harbour-cli/src',
      'libs/core/src',
      'libs/db/src',
      'bun.lock',
    ].map(path =>
      path.endsWith('/src')
        ? fingerprintRuntimeTree(join(root, path))
        : fingerprintTree(join(root, path)),
    ),
    alsPreparationMetadataFingerprint(),
    fingerprintTree(input.sourceDir),
    divisionLookupDependency(input, true),
  ])
  const parameters = {
    version: 4,
    continuityPredecessor: await continuityPredecessorFingerprint(
      input.outputFile,
      input.sourceVersion,
      input.history ?? emptyHkgovAlsIdentityHistory(),
    ),
    runtime: Bun.version,
    dependencies,
    sourceVersion: input.sourceVersion,
    sourceDir: resolve(input.sourceDir),
    outputFile: resolve(input.outputFile),
    membershipFile: input.membershipFile,
    addressCohortKey: input.addressCohortKey,
    divisionCohortKey: input.divisionCohortKey,
    decisions: input.decisions,
    history: input.history,
    target: input.target,
    postProcessPremiseStructure: input.postProcessPremiseStructure,
    skipCurationChecks: input.args.options['skip-curation-checks'] === true,
  }
  observe?.({
    ...Object.fromEntries(
      [
        'dataops code',
        'CLI code',
        'core code',
        'DB code',
        'bun.lock',
        'processing metadata',
        'source files',
        'division lookup',
      ].map((name, index) => [name, sha256(JSON.stringify(dependencies[index]))]),
    ),
    parameters: sha256(JSON.stringify({ ...parameters, dependencies: undefined })),
  })
  return sha256(JSON.stringify(parameters))
}

/** Only reuse a complete preparation with unchanged dependencies and every sealed file. */
export async function cachedAlsPreparation(
  input: Input,
  prepare: () => Promise<Result>,
  keyFor: (input: Input) => Promise<string> = alsPreparationKey,
): Promise<Result> {
  if (input.writeOutput === false || input.args?.options['no-cache-artefacts'] === true)
    return prepare()
  const output = resolve(input.outputFile)
  const checkpoint = `${output}.preparation-cache.json`
  const paths = [
    output,
    `${output}.address3d.jsonl`,
    `${output}.address3d.meta.json`,
    `${output}.audit.json`,
    `${output}.review.json`,
    resolve(input.membershipFile ?? `${output}.membership.json`),
  ]
  return withDeliveryLock(`${output}.preparation.lock`, async () => {
    let before: Record<string, string> | undefined
    const key =
      keyFor === alsPreparationKey
        ? await alsPreparationKey(input, components => {
            before = components
          })
        : await keyFor(input)
    try {
      if (await preparationCheckpointMatchesKey(checkpoint, key)) {
        const cached = JSON.parse(await readFile(checkpoint, 'utf8'))
        if (
          cached?.key === key &&
          cached.result?.outputFile === output &&
          cached.result?.membership?.path === paths.at(-1) &&
          cached.resultSha256 === sha256(JSON.stringify(cached.result)) &&
          Array.isArray(cached.files) &&
          cached.files.length === paths.length &&
          (
            await Promise.all(
              paths.map(
                async (path, i) =>
                  cached.files[i]?.path === path &&
                  cached.files[i]?.sha256 === (await fileSha256(path)),
              ),
            )
          ).every(Boolean)
        ) {
          console.info(`Reusing prepared ALS release ${input.sourceVersion}`)
          return cached.result
        }
      }
    } catch (error) {
      // Missing, damaged or incomplete cache artefacts cannot establish reuse.
      if (
        !(error instanceof SyntaxError) &&
        (error as NodeJS.ErrnoException).code !== 'ENOENT'
      )
        throw error
    }
    const result = await prepare()
    const files = await Promise.all(
      paths.map(async path => ({ path, sha256: await fileSha256(path) })),
    )
    let after: Record<string, string> | undefined
    const finalKey =
      keyFor === alsPreparationKey
        ? await alsPreparationKey(input, components => {
            after = components
          })
        : await keyFor(input)
    if (finalKey !== key) {
      const changed =
        before && after
          ? Object.keys(before).filter(name => before![name] !== after![name])
          : []
      throw new Error(
        `ALS preparation dependencies changed during preparation; retry with stable inputs.${changed.length ? ` Changed: ${changed.join(', ')}.` : ''}`,
      )
    }
    await writePreparationCheckpoint(checkpoint, key, files, result)
    return result
  })
}

/** Hash and write the large result once, without constructing two complete JSON strings. */
async function writePreparationCheckpoint(
  checkpoint: string,
  key: string,
  files: Array<{ path: string; sha256: string }>,
  result: Result,
) {
  await mkdir(dirname(checkpoint), { recursive: true })
  const temporary = `${checkpoint}.${randomUUID()}.tmp`
  try {
    const file = await open(temporary, 'wx', 0o600)
    try {
      await file.writeFile(
        `{"key":${JSON.stringify(key)},"files":${JSON.stringify(files)},"result":`,
      )
      const hash = createHash('sha256')
      let pending = ''
      const append = async (text: string) => {
        hash.update(text)
        pending += text
        if (pending.length >= 64 * 1024) {
          await file.writeFile(pending)
          pending = ''
        }
      }
      await append('{')
      let first = true
      for (const [name, value] of Object.entries(result)) {
        if (value === undefined) continue
        await append(`${first ? '' : ','}${JSON.stringify(name)}:`)
        first = false
        if (Array.isArray(value)) {
          await append('[')
          for (let index = 0; index < value.length; index++)
            await append(`${index ? ',' : ''}${JSON.stringify(value[index]) ?? 'null'}`)
          await append(']')
        } else await append(JSON.stringify(value))
      }
      await append('}')
      if (pending) await file.writeFile(pending)
      await file.writeFile(`,"resultSha256":${JSON.stringify(hash.digest('hex'))}}`)
      await file.sync()
    } finally {
      await file.close()
    }
    await rename(temporary, checkpoint)
    const directory = await open(dirname(checkpoint), 'r')
    try {
      await directory.sync()
    } finally {
      await directory.close()
    }
  } finally {
    await rm(temporary, { force: true })
  }
}

/** Reject stale checkpoints before loading their large result into memory. */
export async function preparationCheckpointMatchesKey(checkpoint: string, key: string) {
  const expected = Buffer.from(`{"key":${JSON.stringify(key)},`)
  const file = await open(checkpoint, 'r')
  try {
    const actual = Buffer.alloc(expected.length)
    const { bytesRead } = await file.read(actual, 0, actual.length, 0)
    return bytesRead === expected.length && actual.equals(expected)
  } finally {
    await file.close()
  }
}
