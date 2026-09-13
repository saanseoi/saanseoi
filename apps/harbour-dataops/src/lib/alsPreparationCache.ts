import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { divisionLookupDependency, fingerprintTree } from './isolatedAlsReview.ts'
import { fileSha256 } from '../../../harbour-cli/src/lib/pipeline/addresses/address3dImport.ts'
import {
  sha256,
  withDeliveryLock,
  writeDeliveryFile,
} from '../../../harbour-cli/src/lib/pipeline/local/sqlDeliveryFiles.ts'
import type { prepareHkgovAlsRelease } from '../commands/hkgovAls.ts'

type Input = Parameters<typeof prepareHkgovAlsRelease>[0]
type Result = Awaited<ReturnType<typeof prepareHkgovAlsRelease>>
const root = resolve(import.meta.dir, '../../../..')

export async function alsPreparationKey(input: Input) {
  const dependencies = await Promise.all([
    ...[
      'apps/harbour-dataops/src',
      'apps/harbour-cli/src',
      'libs/core/src',
      'libs/db/src',
      'fixtures/meta',
      'bun.lock',
    ].map(path =>
      fingerprintTree(join(root, path), file =>
        /\.(test|spec)\.[cm]?[jt]sx?$/.test(file),
      ),
    ),
    fingerprintTree(input.sourceDir),
    divisionLookupDependency(input, true),
  ])
  return sha256(
    JSON.stringify({
      version: 1,
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
    }),
  )
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
    resolve(input.membershipFile ?? `${output}.membership.json`),
  ]
  return withDeliveryLock(`${output}.preparation.lock`, async () => {
    const key = await keyFor(input)
    try {
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
    if ((await keyFor(input)) !== key)
      throw new Error(
        'ALS preparation dependencies changed during preparation; retry with stable inputs.',
      )
    await writeDeliveryFile(
      dirname(checkpoint),
      checkpoint.slice(dirname(checkpoint).length + 1),
      JSON.stringify({
        key,
        files,
        result,
        resultSha256: sha256(JSON.stringify(result)),
      }),
    )
    return result
  })
}
