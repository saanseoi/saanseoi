import {
  createMetaDb,
  eq,
  metaApiComposition,
  metaApiReleaseSets,
  metaApiVersions,
  or,
} from '@repo/db'

import type { PageServerLoad } from './$types'
import { runWithD1ReadRetry } from '#lib/server/d1.js'

import { buildUseTheApiGuideFamilies } from './useTheApiGuide'

export const load: PageServerLoad = async ({ platform }) => {
  const binding = platform?.env.DB_META
  if (!binding) throw new Error('D1 binding "DB_META" not found.')

  const db = createMetaDb(binding)
  const [apiVersions, compositions, releases] = await runWithD1ReadRetry(() =>
    Promise.all([
      db
        .select({
          familyType: metaApiVersions.familyType,
          id: metaApiVersions.id,
          status: metaApiVersions.status,
        })
        .from(metaApiVersions)
        .all(),
      db
        .select({
          apiVersionId: metaApiComposition.apiVersionId,
          i18n: metaApiComposition.i18n,
          status: metaApiComposition.status,
          version: metaApiComposition.version,
        })
        .from(metaApiComposition)
        .where(eq(metaApiComposition.status, 'current'))
        .all(),
      db
        .select({
          apiVersionId: metaApiReleaseSets.apiVersionId,
          code: metaApiReleaseSets.code,
          createdAt: metaApiReleaseSets.createdAt,
          domainCode: metaApiReleaseSets.domainCode,
          notes: metaApiReleaseSets.notes,
          publishedAt: metaApiReleaseSets.publishedAt,
          status: metaApiReleaseSets.status,
        })
        .from(metaApiReleaseSets)
        .where(
          or(
            eq(metaApiReleaseSets.status, 'current'),
            eq(metaApiReleaseSets.status, 'archived'),
          ),
        )
        .all(),
    ]),
  )

  return {
    apiFamilies: buildUseTheApiGuideFamilies(
      apiVersions.map(api => ({
        familyType: api.familyType,
        status: api.status,
        apiComposition: compositions.filter(
          composition => composition.apiVersionId === api.id,
        ),
        releases: releases.filter(release => release.apiVersionId === api.id),
      })),
    ),
  }
}
