import { env } from 'cloudflare:workers'
import { query } from '$app/server'
import { z } from 'zod'
import { metaDatasets } from '@repo/db'
import { getRegistryApiField } from '@repo/core/db/metaRegistry'
import { getMetaDb } from './server'

export const getReleaseProvenance = query(z.string().uuid(), async releaseSetId => {
  if (!env.R2_GUIDE_ASSETS) throw new Error('Provenance storage is unavailable.')
  const result = await getRegistryApiField(
    getMetaDb(),
    releaseSetId,
    env.R2_GUIDE_ASSETS,
  )
  if (!result) return null
  const datasets = await getMetaDb()
    .select({ id: metaDatasets.id, code: metaDatasets.code })
    .from(metaDatasets)
    .all()
  const codes = new Map(datasets.map(dataset => [dataset.id, dataset.code]))
  const scopeLabels = Object.fromEntries(
    result.definition.scopes.map(scope => [
      scope.id,
      scope.datasetCode ??
        (scope.sourceDatasetId ? codes.get(scope.sourceDatasetId) : undefined) ??
        scope.kind.replaceAll('-', ' '),
    ]),
  )
  return { definition: result.definition, binding: result.binding, scopeLabels }
})
