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
