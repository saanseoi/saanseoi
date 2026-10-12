import { env } from 'cloudflare:workers'
import { query } from '$app/server'
import { z } from 'zod'
import { metaDatasets, metaPublishers } from '@repo/db'
import { eq } from 'drizzle-orm'
import { getRegistryApiField } from '@repo/core/db/metaRegistry'
import { getMetaDb } from './server'
import { loadProvenanceSources } from './provenanceSources'
import { provenanceScopeLabels } from '#lib/bits/pages/docs/components/releaseProvenance/presentation.js'

export const getReleaseProvenance = query(z.string().uuid(), async releaseSetId => {
  if (!env.R2_GUIDE_ASSETS) throw new Error('Provenance storage is unavailable.')
  const result = await getRegistryApiField(
    getMetaDb(),
    releaseSetId,
    env.R2_GUIDE_ASSETS,
  )
  if (!result) return null
  const datasets = await getMetaDb()
    .select({
      id: metaDatasets.id,
      code: metaDatasets.code,
      i18n: metaDatasets.i18n,
      publisher: metaPublishers.i18n,
      publisherCode: metaPublishers.code,
    })
    .from(metaDatasets)
    .innerJoin(metaPublishers, eq(metaDatasets.publisherId, metaPublishers.id))
    .all()
  const scopeLabels = provenanceScopeLabels(
    result.definition,
    result.binding,
    Object.fromEntries(
      datasets.map(dataset => [
        dataset.id,
        `${dataset.publisher.en?.nameShort ?? dataset.publisher.en?.name ?? dataset.publisherCode} · ${dataset.i18n.en?.nameShort ?? dataset.i18n.en?.name ?? dataset.code}`,
      ]),
    ),
  )
  return {
    definition: result.definition,
    binding: result.binding,
    scopeLabels,
    sources: await loadProvenanceSources(getMetaDb(), result.binding),
  }
})
