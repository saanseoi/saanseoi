type Row = Record<string, unknown>
type Binding = { prepare(sql: string): { all(): Promise<{ results: Row[] }> } }
export type StatsResetReadContext = {
  metaBinding?: Binding
  currentBinding?: Binding
  historyTargets: Array<{ bindingName: string; binding?: Binding }>
}

export function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

export async function resetRows(binding: Binding | undefined, sql: string) {
  if (!binding) throw new Error('Stats reset requires a complete database context.')
  return (await binding.prepare(sql).all()).results
}

const geometryTypes = new Set(['division', 'divisionArea', 'divisionBoundary'])

/** Retract derived geography, without treating its other source inputs as owned. */
export async function collectStatsResetDependencies(
  context: StatsResetReadContext,
  releases: Row[],
  roots: Row[],
) {
  const meta = context.metaBinding
  const allSnapshots = await resetRows(meta, 'SELECT * FROM snapshots ORDER BY id')
  const sources = await resetRows(
    meta,
    'SELECT * FROM snapshotSources ORDER BY snapshotId, resourceReleaseId',
  )
  const assemblies = await resetRows(
    meta,
    'SELECT * FROM snapshotAssemblyRuns ORDER BY id',
  )
  const publications = await resetRows(
    context.currentBinding,
    ['division', 'divisionArea', 'divisionBoundary']
      .map(family => `SELECT '${family}' AS family, * FROM ${family}PublicationState`)
      .join(' UNION ALL '),
  )
  const releaseIds = new Set(releases.map(row => String(row.id)))
  const selected = new Set(roots.map(row => String(row.id)))
  const geometrySnapshots = new Set(
    allSnapshots
      .filter(row => geometryTypes.has(String(row.resourceType)))
      .map(row => String(row.id)),
  )
  for (const source of [...sources, ...assemblies]) {
    if (
      geometrySnapshots.has(String(source.snapshotId)) &&
      (releaseIds.has(String(source.resourceReleaseId)) ||
        releaseIds.has(String(source.anchorReleaseId)))
    ) {
      selected.add(String(source.snapshotId))
    }
  }
  const visited = new Set<string>()
  while (true) {
    for (const snapshot of allSnapshots) {
      if (
        geometrySnapshots.has(String(snapshot.id)) &&
        selected.has(String(snapshot.parentSnapshotId))
      )
        selected.add(String(snapshot.id))
    }
    const pending = [...selected].filter(
      id => geometrySnapshots.has(id) && !visited.has(id),
    )
    if (!pending.length) break
    for (let offset = 0; offset < pending.length; offset += 50) {
      const batch = pending.slice(offset, offset + 50)
      const ids = batch.map(sqlLiteral).join(', ')
      for (const [current, binding] of [
        [true, context.currentBinding],
        ...context.historyTargets.map(target => [false, target.binding] as const),
      ] as const) {
        const divisions = `SELECT id FROM divisions WHERE snapshotId IN (${current ? `SELECT scopeId FROM divisionPublicationState WHERE snapshotId IN (${ids})` : ids})`
        const dependants = await resetRows(
          binding,
          current
            ? `SELECT DISTINCT state.snapshotId FROM divisionAreas row JOIN divisionAreaPublicationState state ON state.scopeId=row.snapshotId WHERE row.divisionId IN (${divisions}) UNION SELECT DISTINCT state.snapshotId FROM divisionBoundaries row JOIN divisionBoundaryPublicationState state ON state.scopeId=row.snapshotId WHERE row.leftDivisionId IN (${divisions}) OR row.rightDivisionId IN (${divisions})`
            : `SELECT DISTINCT snapshotId FROM divisionAreas WHERE divisionId IN (${divisions}) UNION SELECT DISTINCT snapshotId FROM divisionBoundaries WHERE leftDivisionId IN (${divisions}) OR rightDivisionId IN (${divisions})`,
        )
        for (const row of dependants) {
          if (geometrySnapshots.has(String(row.snapshotId)))
            selected.add(String(row.snapshotId))
        }
      }
      for (const id of batch) visited.add(id)
    }
  }
  const snapshots = allSnapshots.filter(row => selected.has(String(row.id)))
  const members = await resetRows(
    meta,
    'SELECT * FROM apiReleaseSetSnapshots ORDER BY apiReleaseSetId, snapshotId',
  )
  const affectedSetIds = new Set(
    members
      .filter(
        row =>
          selected.has(String(row.snapshotId)) ||
          selected.has(String(row.anchorSnapshotId)),
      )
      .map(row => String(row.apiReleaseSetId)),
  )
  const allSets = await resetRows(
    meta,
    'SELECT a.*, v.familyType FROM apiReleaseSets a JOIN apiVersions v ON v.id = a.apiVersionId ORDER BY a.id',
  )
  const releaseSets = allSets.filter(
    row =>
      row.familyType === 'stats' ||
      (row.familyType === 'divisions' && affectedSetIds.has(String(row.id))),
  )
  const setIds = new Set(releaseSets.map(row => String(row.id)))
  const catalogMembers = await resetRows(
    meta,
    'SELECT * FROM apiCatalogRevisionReleaseSets ORDER BY apiCatalogRevisionId, apiReleaseSetId',
  )
  const affectedCatalogIds = new Set(
    catalogMembers
      .filter(row => setIds.has(String(row.apiReleaseSetId)))
      .map(row => String(row.apiCatalogRevisionId)),
  )
  const catalogRevisions = (
    await resetRows(
      meta,
      'SELECT c.*, v.familyType FROM apiCatalogRevisions c JOIN apiVersions v ON v.id = c.apiVersionId ORDER BY c.id',
    )
  ).filter(row => row.familyType === 'stats' || affectedCatalogIds.has(String(row.id)))
  return {
    snapshots,
    releaseSets,
    catalogRevisions,
    // Retain dependency edges in the plan so confirmation revalidation detects
    // changed compositions even when their selected IDs remain the same.
    dependencies: {
      publications: publications.filter(row => selected.has(String(row.snapshotId))),
      sources: sources.filter(
        row =>
          selected.has(String(row.snapshotId)) ||
          releaseIds.has(String(row.resourceReleaseId)) ||
          releaseIds.has(String(row.anchorReleaseId)),
      ),
      assemblies: assemblies.filter(
        row =>
          selected.has(String(row.snapshotId)) ||
          releaseIds.has(String(row.anchorReleaseId)),
      ),
      members: members.filter(
        row =>
          setIds.has(String(row.apiReleaseSetId)) ||
          selected.has(String(row.snapshotId)) ||
          selected.has(String(row.anchorSnapshotId)),
      ),
      catalogMembers: catalogMembers.filter(row =>
        affectedCatalogIds.has(String(row.apiCatalogRevisionId)),
      ),
    },
  }
}
