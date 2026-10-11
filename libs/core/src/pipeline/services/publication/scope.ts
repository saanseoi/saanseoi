/** Scope boundaries preserve independently requestable geometry cohorts and variants. */
export function publicationScopeId(
  family: string,
  snapshotLineageId: string,
  cohortKey: string,
) {
  return family === 'divisionArea' || family === 'divisionBoundary'
    ? JSON.stringify([snapshotLineageId, cohortKey])
    : snapshotLineageId
}

/** Exact history replays retain an older Division inventory beside its latest lineage. */
export function retainedDivisionScopeId(snapshotLineageId: string, snapshotId: string) {
  return JSON.stringify([snapshotLineageId, 'snapshot', snapshotId])
}
