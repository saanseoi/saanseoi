import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { UploadTarget } from '../cli/options.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../../../')
const LOCAL_RELEASE_ROOT = resolve(REPO_ROOT, '.local/harbour-sql/releases')

/**
 * Removes derived pipeline artefacts after a release has published. The raw
 * source object and release state remain available for a later reprocessing
 * run, while normalised/resolved records and generated SQL are regenerated.
 */
export async function discardDerivedReleaseArtefacts(
  target: UploadTarget,
  releaseCode: string,
  releaseRootBase = LOCAL_RELEASE_ROOT,
) {
  for (const targetDirectory of resolveReleaseTargetDirectories(target)) {
    const targetReleaseRoot = resolve(releaseRootBase, targetDirectory)
    const releaseRoot = resolve(targetReleaseRoot, releaseCode)
    const processedRoot = resolve(releaseRoot, 'objects/processed')

    if (
      !releaseRoot.startsWith(`${targetReleaseRoot}/`) ||
      !processedRoot.startsWith(`${releaseRoot}/`)
    ) {
      throw new Error(`Refusing to discard artefacts outside ${releaseRoot}.`)
    }

    await rm(processedRoot, { force: true, recursive: true })
  }
}

export function shouldCacheArtefacts(options: Record<string, string | boolean>) {
  return (
    options.cacheArtefacts === true ||
    options['cache-artefacts'] === true ||
    process.env.SAANSEOI_CACHE_ARTEFACTS === '1'
  )
}

function resolveReleaseTargetDirectories(target: UploadTarget) {
  if (!target.remote) {
    return ['local']
  }

  // SQL processors introduced at different times use both layouts. Clear
  // derived artefacts from either while keeping the raw release object intact.
  return [target.environment, 'remote']
}
