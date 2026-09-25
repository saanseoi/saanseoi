/** Resume only unpublished failed resources; never reopen a published snapshot. */
export function sqlDeliveryRecoveryStatusSql(resourceReleaseId: string) {
  return `UPDATE resourceReleases SET status = 'processing'
WHERE id = '${resourceReleaseId.replaceAll("'", "''")}' AND status = 'failed'
AND NOT EXISTS (
  SELECT 1 FROM snapshotResourceReleases ss JOIN snapshots s ON s.id = ss.snapshotId
  WHERE ss.resourceReleaseId = resourceReleases.id AND s.status = 'published'
) RETURNING id, status;`
}
