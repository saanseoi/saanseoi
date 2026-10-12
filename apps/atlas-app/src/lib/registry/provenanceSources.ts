import {
  and,
  eq,
  metaDatasets,
  metaResourceReleases,
  metaSourceReleases,
  metaSnapshotResourceReleases,
} from '@repo/db'
import type { ReleaseBinding } from '@repo/db/fieldLineageTypes'
import type { getMetaDb } from './server'

export type ProvenanceSource = {
  id: string
  datasetCode: string
  releaseCode: string
  resourceType: string
  sourceVersion: string
  label?: string
  role: 'published' | 'preprocessing'
}

/** Follow only exact source links anchored to the bound release and its pinned snapshots. */
export async function loadProvenanceSources(
  db: ReturnType<typeof getMetaDb>,
  binding: ReleaseBinding | null,
) {
  const result: Record<string, ProvenanceSource[]> = {}
  if (!binding) return result
  const snapshots = [
    ...new Set(
      binding.scopes.flatMap(scope => [
        ...(scope.snapshotIds ?? []),
        ...(scope.snapshotId ? [scope.snapshotId] : []),
      ]),
    ),
  ]
  const cache = new Map<string, ProvenanceSource[]>()
  for (const scope of binding.scopes) {
    if (!scope.resourceReleaseId) continue
    const cached = cache.get(scope.resourceReleaseId)
    if (cached) {
      result[scope.scopeId] = cached
      continue
    }
    const releases = metaResourceReleases,
      datasets = metaDatasets,
      links = metaSnapshotResourceReleases
    const selection = {
      id: releases.id,
      datasetCode: datasets.code,
      releaseCode: metaSourceReleases.code,
      resourceType: releases.resourceType,
      sourceVersion: releases.sourceVersion,
      datasetName: datasets.i18n,
    }
    const direct = await db
      .select(selection)
      .from(releases)
      .innerJoin(datasets, eq(datasets.id, releases.datasetId))
      .innerJoin(
        metaSourceReleases,
        eq(metaSourceReleases.id, releases.sourceReleaseId),
      )
      .where(eq(releases.id, scope.resourceReleaseId))
      .get()
    const sources: ProvenanceSource[] = direct
      ? [
          {
            ...direct,
            label:
              direct.datasetName?.en?.nameShort ??
              direct.datasetName?.en?.name ??
              direct.datasetCode,
            role: 'published',
          },
        ]
      : []
    for (const snapshotId of snapshots) {
      const inputs = await db
        .select(selection)
        .from(links)
        .innerJoin(releases, eq(releases.id, links.resourceReleaseId))
        .innerJoin(datasets, eq(datasets.id, releases.datasetId))
        .innerJoin(
          metaSourceReleases,
          eq(metaSourceReleases.id, releases.sourceReleaseId),
        )
        .where(
          and(
            eq(links.snapshotId, snapshotId),
            eq(links.anchorReleaseId, scope.resourceReleaseId),
            eq(links.selectedByRule, 'provenance:curated-division:build-inputs:v1'),
            eq(links.selectionMode, 'exact_ref'),
          ),
        )
        .all()
      for (const input of inputs)
        if (!sources.some(source => source.id === input.id))
          sources.push({
            ...input,
            label:
              input.datasetName?.en?.nameShort ??
              input.datasetName?.en?.name ??
              input.datasetCode,
            role: 'preprocessing',
          })
    }
    cache.set(scope.resourceReleaseId, sources)
    result[scope.scopeId] = sources
  }
  return result
}
