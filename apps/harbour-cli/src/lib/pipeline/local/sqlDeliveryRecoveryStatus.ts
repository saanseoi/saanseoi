/** Resume only unpublished failed resources; never reopen a published snapshot. */
export function sqlDeliveryRecoveryStatusSql(releaseId: string) {
  return `UPDATE releases SET status = 'processing'
WHERE id = '${releaseId.replaceAll("'", "''")}' AND status = 'failed'
AND NOT EXISTS (
  SELECT 1 FROM snapshotSources ss JOIN snapshots s ON s.id = ss.snapshotId
  WHERE ss.resourceReleaseId = releases.id AND s.status = 'published'
) RETURNING id, status;`
}
