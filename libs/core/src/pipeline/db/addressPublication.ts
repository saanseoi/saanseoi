export type AddressPublicationReceipt = {
  scopeId: string
  snapshotId: string
  status: 'publishing' | 'current'
  publicationToken: string
  preparedAt: string | null
  updatedAt: string
}

export type AddressPublicationOwner = {
  scopeId: string
  snapshotId: string
  publicationToken: string
}

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`

/** SQLite evaluates the overflowing integer only when ownership has been lost. */
export function buildAddressPublicationGuardSql(owner: AddressPublicationOwner) {
  return `SELECT CASE WHEN EXISTS (SELECT 1 FROM addressPublicationState
WHERE scopeId = ${literal(owner.scopeId)} AND snapshotId = ${literal(owner.snapshotId)}
AND publicationToken = ${literal(owner.publicationToken)} AND status = 'publishing'
AND preparedAt IS NULL) THEN 1 ELSE abs(-9223372036854775808) END;`
}

/** Claim the exact baseline; another draft or a newer completed delivery cannot be replaced. */
export function buildBeginAddressPublicationSql(
  owner: AddressPublicationOwner,
  previous: AddressPublicationReceipt | null,
) {
  // The sealed token identifies the predecessor across remote delivery and local
  // replay. Their acknowledgement clocks and publication timing may differ.
  const previousMatch = previous?.preparedAt
    ? `addressPublicationState.snapshotId = ${literal(previous.snapshotId)}
AND addressPublicationState.publicationToken = ${literal(previous.publicationToken)}
AND addressPublicationState.preparedAt IS NOT NULL
AND addressPublicationState.status IN ('current', 'publishing')`
    : '0'
  return `INSERT INTO addressPublicationState
(scopeId, snapshotId, status, publicationToken, preparedAt, createdAt, updatedAt)
VALUES (${literal(owner.scopeId)}, ${literal(owner.snapshotId)}, 'publishing', ${literal(owner.publicationToken)}, NULL, datetime('now'), datetime('now'))
ON CONFLICT(scopeId) DO UPDATE SET snapshotId = excluded.snapshotId, status = 'publishing',
publicationToken = excluded.publicationToken, preparedAt = NULL, updatedAt = excluded.updatedAt
WHERE ${previousMatch};
${buildAddressPublicationGuardSql(owner)}`
}

/** Delivery evidence only. Publication finalisation separately certifies published readiness. */
export function buildPrepareAddressPublicationSql(
  owner: AddressPublicationOwner,
  validationSql: string,
) {
  return `${buildAddressPublicationGuardSql(owner)}
SELECT CASE WHEN (${validationSql}) THEN 1 ELSE abs(-9223372036854775808) END;
UPDATE addressPublicationState SET preparedAt = datetime('now'), updatedAt = datetime('now')
WHERE scopeId = ${literal(owner.scopeId)} AND snapshotId = ${literal(owner.snapshotId)}
AND publicationToken = ${literal(owner.publicationToken)} AND status = 'publishing' AND preparedAt IS NULL;`
}
