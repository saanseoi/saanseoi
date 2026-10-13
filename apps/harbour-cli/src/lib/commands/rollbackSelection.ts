import type { Database } from 'bun:sqlite'
import { buildApiCatalogRevisionCode, computeVersionHash } from '@repo/db'
import { buildDeterministicApiCatalogRevisionId } from '@repo/core/db/metaRegistry'
import { publicationScopeId } from '@repo/core/pipeline/services/publication/scope.ts'
import type { NetStatement } from '../pipeline/local/netSqlitePlanTypes.ts'
import type { RollbackTerminal } from './rollbackDelivery.ts'
import { buildRollbackMetadataGuard } from './rollbackMetadataGuard.ts'

export type RollbackSnapshot = {
  id: string
  resourceType:
    | 'division'
    | 'divisionArea'
    | 'divisionBoundary'
    | 'address'
    | 'place'
    | 'street'
    | 'divisionStatistic'
  snapshotLineageId: string
  parentSnapshotId: string | null
  cohortKey: string
}
type ReleaseSet = {
  id: string
  apiVersionReleaseSetId: string
  apiVersionId: string
  regionCode: string
  domainCode: string
  cohortKey: string
  previousRevisionApiReleaseSetId: string | null
  status: string
}
type Catalog = {
  id: string
  apiVersionId: string
  regionCode: string
  publishedAt: string
  defaultDomainCode: string | null
}
type Member = {
  apiVersionReleaseSetId: string
  apiReleaseSetId: string
  domainCode: string
  cohortKey: string
  isDefault: number
}

const getSnapshotMembers = (db: Database, id: string) =>
  db
    .query<RollbackSnapshot, [string]>(
      `SELECT DISTINCT s.id,sl.resourceType,s.snapshotLineageId,s.parentSnapshotId,s.cohortKey FROM snapshots s JOIN snapshotLineages sl ON sl.id = s.snapshotLineageId JOIN apiReleaseSetSnapshots m ON m.snapshotId=s.id WHERE m.apiReleaseSetId=? ORDER BY s.id`,
    )
    .all(id)

const getSnapshotMembersForVersionReleaseSet = (db: Database, id: string) => {
  const releaseSet = db
    .query<{ apiReleaseSetId: string }, [string]>(
      'SELECT apiReleaseSetId FROM apiVersionReleaseSets WHERE id=?',
    )
    .get(id)
  return releaseSet ? getSnapshotMembers(db, releaseSet.apiReleaseSetId) : []
}
export const rollbackSnapshotScope = (snapshot: RollbackSnapshot) =>
  publicationScopeId(
    snapshot.resourceType,
    snapshot.snapshotLineageId,
    snapshot.cohortKey,
  )

/** Resolve published ownership through the latest catalogue, preserving other domains/cohorts. */
export function resolveRollbackSelection(meta: Database, resourceReleaseId: string) {
  const release = meta
    .query<
      {
        id: string
        code: string
        resourceType: RollbackSnapshot['resourceType']
        status: string
        datasetId: string
      },
      [string]
    >('SELECT id,code,resourceType,status,datasetId FROM resourceReleases WHERE id=?')
    .get(resourceReleaseId)
  if (release?.status !== 'current')
    throw new Error('Rollback requires a published source release.')
  const candidates = meta
    .query<ReleaseSet, [string]>(
      `SELECT DISTINCT r.id,vrs.id AS apiVersionReleaseSetId,vrs.apiVersionId,r.regionCode,r.domainCode,r.cohortKey,vrs.previousRevisionApiReleaseSetId,vrs.status FROM apiReleaseSets r JOIN apiVersionReleaseSets vrs ON vrs.apiReleaseSetId=r.id JOIN apiReleaseSetSnapshots m ON m.apiReleaseSetId=r.id JOIN snapshotResourceReleases s ON s.snapshotId=m.snapshotId WHERE s.resourceReleaseId=? AND s.role<>'lookup' AND vrs.status<>'draft'`,
    )
    .all(resourceReleaseId)
  const catalogs = new Map<string, Catalog>()
  const selected: Array<{ current: ReleaseSet; previous: ReleaseSet | null }> = []
  for (const candidate of candidates) {
    const catalog = meta
      .query<Catalog, [string, string]>(
        `SELECT * FROM apiCatalogRevisions WHERE apiVersionId=? AND regionCode=? AND status='current' ORDER BY publishedAt DESC,revision DESC LIMIT 1`,
      )
      .get(candidate.apiVersionId, candidate.regionCode)
    if (
      !catalog ||
      !meta
        .query(
          'SELECT 1 FROM apiCatalogRevisionReleaseSets WHERE apiCatalogRevisionId=? AND apiVersionReleaseSetId=?',
        )
        .get(catalog.id, candidate.apiVersionReleaseSetId)
    )
      continue
    catalogs.set(catalog.id, catalog)
    const members = getSnapshotMembers(meta, candidate.id)
    const owned = members.filter(
      snapshot =>
        snapshot.resourceType === release.resourceType &&
        meta
          .query(
            "SELECT 1 FROM snapshotResourceReleases WHERE snapshotId=? AND resourceReleaseId=? AND role<>'lookup'",
          )
          .get(snapshot.id, resourceReleaseId),
    )
    if (owned.length !== 1 && release.resourceType !== 'divisionStatistic')
      throw new Error(
        'Rollback cannot infer ownership of a composite source release; select a release with one owned snapshot per composition.',
      )
    const parentIds = owned
      .map(snapshot => snapshot.parentSnapshotId)
      .filter((id): id is string => Boolean(id))
    let previous: ReleaseSet | null = null
    if (candidate.previousRevisionApiReleaseSetId)
      previous = meta
        .query<ReleaseSet, [string, string]>(
          `SELECT r.*,vrs.id AS apiVersionReleaseSetId,vrs.apiVersionId,vrs.previousRevisionApiReleaseSetId,vrs.status FROM apiReleaseSets r JOIN apiVersionReleaseSets vrs ON vrs.apiReleaseSetId=r.id WHERE r.id=? AND vrs.apiVersionId=?`,
        )
        .get(candidate.previousRevisionApiReleaseSetId, candidate.apiVersionId)
    if (!previous && parentIds.length === 1)
      previous = meta
        .query<ReleaseSet, [string, string, string, string]>(
          `SELECT r.*,vrs.id AS apiVersionReleaseSetId,vrs.apiVersionId,vrs.previousRevisionApiReleaseSetId,vrs.status FROM apiReleaseSets r JOIN apiVersionReleaseSets vrs ON vrs.apiReleaseSetId=r.id JOIN apiReleaseSetSnapshots m ON m.apiReleaseSetId=r.id WHERE m.snapshotId=? AND vrs.apiVersionId=? AND r.regionCode=? AND r.domainCode=? AND vrs.status<>'draft' ORDER BY vrs.publishedAt DESC,r.revision DESC LIMIT 1`,
        )
        .get(
          parentIds[0]!,
          candidate.apiVersionId,
          candidate.regionCode,
          candidate.domainCode,
        )
    if (parentIds.length && !previous)
      throw new Error('Rollback predecessor has no retained API composition.')
    if (
      previous &&
      (previous.id === candidate.id ||
        previous.apiVersionId !== candidate.apiVersionId ||
        previous.regionCode !== candidate.regionCode ||
        previous.domainCode !== candidate.domainCode ||
        previous.status === 'draft')
    )
      throw new Error(
        'Rollback predecessor has a different API scope or is unpublished.',
      )
    if (
      previous &&
      parentIds.some(
        id =>
          !getSnapshotMembers(meta, previous!.id).some(snapshot => snapshot.id === id),
      )
    )
      throw new Error(
        'Rollback predecessor composition does not contain the exact parent snapshot.',
      )
    selected.push({ current: candidate, previous })
  }
  if (catalogs.size !== 1 || !selected.length)
    throw new Error(
      'Rollback requires one unambiguous active API catalogue for this source release.',
    )
  const catalog = [...catalogs.values()][0]!
  const oldMembers = meta
    .query<Member, [string]>(
      'SELECT c.apiVersionReleaseSetId,v.apiReleaseSetId,c.domainCode,c.cohortKey,c.isDefault FROM apiCatalogRevisionReleaseSets c JOIN apiVersionReleaseSets v ON v.id=c.apiVersionReleaseSetId WHERE c.apiCatalogRevisionId=? ORDER BY c.domainCode,c.cohortKey',
    )
    .all(catalog.id)
  const newMembers = oldMembers.filter(
    member =>
      !selected.some(
        pair => pair.current.apiVersionReleaseSetId === member.apiVersionReleaseSetId,
      ),
  )
  for (const { previous } of selected)
    if (
      previous &&
      !newMembers.some(
        member => member.apiVersionReleaseSetId === previous.apiVersionReleaseSetId,
      )
    ) {
      const conflict = newMembers.find(
        member =>
          member.domainCode === previous.domainCode &&
          member.cohortKey === previous.cohortKey,
      )
      if (conflict)
        throw new Error('Rollback would replace an unrelated catalogue member.')
      newMembers.push({
        apiVersionReleaseSetId: previous.apiVersionReleaseSetId,
        apiReleaseSetId: previous.id,
        domainCode: previous.domainCode,
        cohortKey: previous.cohortKey,
        isDefault: 0,
      })
    }
  for (const domain of new Set(oldMembers.map(member => member.domainCode))) {
    const candidates = newMembers
      .filter(member => member.domainCode === domain)
      .sort((a, b) => b.cohortKey.localeCompare(a.cohortKey))
    const oldDefault = oldMembers.find(
      member => member.domainCode === domain && member.isDefault,
    )
    const replacement = selected.find(
      pair =>
        pair.current.apiVersionReleaseSetId === oldDefault?.apiVersionReleaseSetId,
    )?.previous
    const next =
      replacement?.apiVersionReleaseSetId ??
      candidates.find(
        member => member.apiVersionReleaseSetId === oldDefault?.apiVersionReleaseSetId,
      )?.apiVersionReleaseSetId ??
      candidates[0]?.apiVersionReleaseSetId
    for (const member of candidates)
      member.isDefault = Number(member.apiVersionReleaseSetId === next)
  }
  newMembers.sort(
    (a, b) =>
      a.domainCode.localeCompare(b.domainCode) ||
      a.cohortKey.localeCompare(b.cohortKey),
  )
  const currentSnapshots = [
    ...new Map(
      oldMembers
        .flatMap(member => getSnapshotMembers(meta, member.apiReleaseSetId))
        .map(snapshot => [snapshot.id, snapshot]),
    ).values(),
  ]
  const previousSnapshots = [
    ...new Map(
      newMembers
        .flatMap(member => getSnapshotMembers(meta, member.apiReleaseSetId))
        .map(snapshot => [snapshot.id, snapshot]),
    ).values(),
  ]
  const changes = currentSnapshots.filter(
    snapshot => !previousSnapshots.some(previous => previous.id === snapshot.id),
  )
  const restores = previousSnapshots.filter(
    snapshot => !currentSnapshots.some(current => current.id === snapshot.id),
  )
  for (const snapshot of [...changes, ...restores])
    if (!snapshot.snapshotLineageId)
      throw new Error('Rollback requires explicit snapshot lineage identity.')
  const removedScopes = new Set(changes.map(rollbackSnapshotScope))
  for (const snapshot of restores) removedScopes.delete(rollbackSnapshotScope(snapshot))
  return {
    release,
    catalog,
    oldMembers,
    newMembers,
    selected,
    changes,
    restores,
    removedScopes,
    defaultDomainCode: newMembers.some(
      member => member.domainCode === catalog.defaultDomainCode,
    )
      ? catalog.defaultDomainCode
      : (newMembers[0]?.domainCode ?? null),
  }
}

export function prepareRollbackMetadata(
  meta: Database,
  selection: ReturnType<typeof resolveRollbackSelection>,
  timestamp: string,
) {
  const { release, catalog, selected, newMembers } = selection
  const version = meta
    .query<
      {
        familyType: 'addresses' | 'divisions' | 'places' | 'streets' | 'stats'
        version: string
      },
      [string]
    >('SELECT familyType,version FROM apiVersions WHERE id=?')
    .get(catalog.apiVersionId)
  if (!version) throw new Error('Rollback API version is missing.')
  if (timestamp <= catalog.publishedAt)
    throw new Error('Rollback publication time must follow the latest catalogue.')
  const date = timestamp.slice(0, 10)
  const revision = meta
    .query<{ n: number }, [string, string, string]>(
      'SELECT coalesce(max(revision),-1)+1 AS n FROM apiCatalogRevisions WHERE apiVersionId=? AND regionCode=? AND publicationDate=?',
    )
    .get(catalog.apiVersionId, catalog.regionCode, date)!.n
  const code = buildApiCatalogRevisionCode(
    catalog.regionCode,
    version.familyType,
    version.version,
    date,
    revision,
  )
  const catalogId = buildDeterministicApiCatalogRevisionId(code)
  const guard = buildRollbackMetadataGuard(meta, {
    resourceReleaseId: release.id,
    datasetId: release.datasetId,
    catalogId: catalog.id,
    apiVersionId: catalog.apiVersionId,
    regionCode: catalog.regionCode,
    releaseSetIds: [
      ...new Set(
        [...selection.oldMembers, ...newMembers].map(member => member.apiReleaseSetId),
      ),
    ],
  })
  const metadata: NetStatement[] = [
    guard,
    {
      sql: "UPDATE apiCatalogRevisions SET status='archived',updatedAt=? WHERE apiVersionId=? AND regionCode=? AND status='current'",
      params: [timestamp, catalog.apiVersionId, catalog.regionCode],
    },
    {
      sql: "INSERT INTO apiCatalogRevisions(id,apiVersionId,code,regionCode,publicationDate,revision,defaultDomainCode,status,publishedAt,versionHash,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,'current',?,?,?,?)",
      params: [
        catalogId,
        catalog.apiVersionId,
        code,
        catalog.regionCode,
        date,
        revision,
        selection.defaultDomainCode,
        timestamp,
        computeVersionHash({ code, members: newMembers, publishedAt: timestamp }),
        timestamp,
        timestamp,
      ],
    },
    {
      sql: `INSERT INTO apiCatalogRevisionReleaseSets(apiCatalogRevisionId,apiVersionReleaseSetId,domainCode,cohortKey,isDefault,createdAt) SELECT ?,json_extract(value,'$.apiVersionReleaseSetId'),json_extract(value,'$.domainCode'),json_extract(value,'$.cohortKey'),json_extract(value,'$.isDefault'),? FROM json_each(?)`,
      params: [catalogId, timestamp, JSON.stringify(newMembers)],
    },
  ]
  for (const pair of selected) {
    metadata.push({
      sql: "UPDATE apiVersionReleaseSets SET status='archived',validTo=?,updatedAt=? WHERE id=?",
      params: [timestamp, timestamp, pair.current.apiVersionReleaseSetId],
    })
    if (
      pair.previous &&
      newMembers.some(
        member =>
          member.apiVersionReleaseSetId === pair.previous!.apiVersionReleaseSetId &&
          member.isDefault,
      )
    )
      metadata.push({
        sql: "UPDATE apiVersionReleaseSets SET status='current',validTo=NULL,updatedAt=? WHERE id=?",
        params: [timestamp, pair.previous.apiVersionReleaseSetId],
      })
  }
  // Canonical/source rows and published snapshot evidence stay immutable and retained.
  metadata.push({
    sql: "UPDATE resourceReleases SET status='revoked',revokedAt=?,revocationReason='Published rollback',supersededByResourceReleaseId=NULL,updatedAt=? WHERE id=?",
    params: [timestamp, timestamp, release.id],
  })
  metadata.push({
    sql: "UPDATE resourceReleases SET status='current',supersededByResourceReleaseId=NULL,updatedAt=? WHERE supersededByResourceReleaseId=? AND datasetId=?",
    params: [timestamp, release.id, release.datasetId],
  })
  metadata.push({
    sql: `INSERT INTO releaseSetLifecycleJournal(id,resourceReleaseId,action,statusFrom,statusTo,metadataJson,createdAt) VALUES(?,?,'rolled_back','current','revoked',?,?)`,
    params: [
      crypto.randomUUID(),
      release.id,
      JSON.stringify({
        catalogId,
        replacedApiReleaseSetIds: selected.map(pair => pair.current.id),
        restoredApiReleaseSetIds: selected.flatMap(pair =>
          pair.previous ? [pair.previous.id] : [],
        ),
      }),
      timestamp,
    ],
  })
  const terminal: RollbackTerminal = {
    operation: 'rollback',
    resourceReleaseId: release.id,
    catalogId,
    apiVersionId: catalog.apiVersionId,
    regionCode: catalog.regionCode,
    claims: [],
  }
  return { metadata, metadataGuard: guard, terminal }
}
