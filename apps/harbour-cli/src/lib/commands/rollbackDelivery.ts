import type { Database } from 'bun:sqlite'
import {
  captureNetSqlitePlan,
  type NetTablePolicy,
} from '../pipeline/local/netSqlitePlan.ts'
import type { NetStatement } from '../pipeline/local/netSqlitePlanTypes.ts'
import type { SqlDeliveryTarget } from '../pipeline/local/sqlDeliveryTypes.ts'
import type { LocalAddressDbContext } from '../dbCache/localDbCacheTypes.ts'
import { buildPublicationAssertionSql } from '@repo/core/pipeline/services/publication/sql.ts'
import {
  buildSearchSyncSql,
  type SearchIndexDefinition,
  type SearchScope,
} from '@repo/core/pipeline/services/search/incrementalIndex'
import { divisionSearchIndex } from '@repo/core/pipeline/services/search/divisions'
import { addressSearchIndex } from '@repo/core/pipeline/services/addresses/searchIndex'
import { placeSearchIndex } from '@repo/core/pipeline/services/places/searchIndex'

export type RollbackClaim = {
  table: string
  scopeId: string
  previous: { snapshotId: string; publicationToken: string } | null
  snapshotId: string | null
  publicationToken: string
  statistics?: { datasetCode: string; referencePeriodCode: string }
}

export type RollbackTerminal = {
  operation: 'rollback'
  releaseId: string
  catalogId: string
  apiVersionId: string
  regionCode: string
  claims: RollbackClaim[]
}

export const rollbackLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`
const statement = (sql: string): NetStatement => ({ sql, params: [] })

function tableName(table: string) {
  if (
    !/^(division|address|place|street|divisionArea|divisionBoundary)PublicationState$/.test(
      table,
    )
  )
    throw new Error('Invalid rollback publication table.')
  return `"${table}"`
}

export function rollbackClaimPredicate(claim: RollbackClaim, ready = false) {
  const snapshotId = claim.snapshotId ?? claim.previous?.snapshotId
  if (!snapshotId) throw new Error('Rollback scope has no publication identity.')
  if (claim.statistics) {
    return `EXISTS(SELECT 1 FROM statsPublicationState WHERE ${rollbackClaimScopePredicate(claim)} AND snapshotId=${rollbackLiteral(snapshotId)} AND status='${ready ? 'current' : 'restoring'}' AND updatedAt=${rollbackLiteral(claim.publicationToken)})`
  }
  const table = tableName(claim.table)
  return `EXISTS (SELECT 1 FROM ${table} WHERE scopeId=${rollbackLiteral(claim.scopeId)} AND snapshotId=${rollbackLiteral(snapshotId)} AND publicationToken=${rollbackLiteral(claim.publicationToken)} AND status='${ready ? 'current' : 'publishing'}' AND preparedAt IS ${ready ? 'NOT ' : ''}NULL)`
}

export function rollbackClaimScopePredicate(claim: RollbackClaim) {
  if (claim.statistics) {
    if (claim.table !== 'statsPublicationState')
      throw new Error('Invalid Statistics rollback table.')
    return `datasetCode=${rollbackLiteral(claim.statistics.datasetCode)} AND referencePeriodCode=${rollbackLiteral(claim.statistics.referencePeriodCode)}`
  }
  tableName(claim.table)
  return `scopeId=${rollbackLiteral(claim.scopeId)}`
}

export function rollbackClaimsGuard(claims: RollbackClaim[]) {
  return statement(
    buildPublicationAssertionSql(
      claims.map(claim => rollbackClaimPredicate(claim)).join(' AND ') || '1',
    ),
  )
}

function beginClaim(claim: RollbackClaim, timestamp: string): NetStatement[] {
  if (claim.statistics) {
    const previous = claim.previous
    if (!previous)
      throw new Error(
        'Statistics rollback requires an acknowledged exact-period selection.',
      )
    const scope = rollbackClaimScopePredicate(claim)
    return [
      statement(
        buildPublicationAssertionSql(
          `EXISTS(SELECT 1 FROM statsPublicationState WHERE ${scope} AND snapshotId=${rollbackLiteral(previous.snapshotId)} AND status='current' AND updatedAt=${rollbackLiteral(previous.publicationToken)})`,
        ),
      ),
      statement(
        `UPDATE statsPublicationState SET snapshotId=${rollbackLiteral(claim.snapshotId ?? previous.snapshotId)},status='restoring',updatedAt=${rollbackLiteral(claim.publicationToken)} WHERE ${scope}`,
      ),
      rollbackClaimsGuard([claim]),
    ]
  }
  const table = tableName(claim.table)
  const scope = rollbackLiteral(claim.scopeId)
  const previous = claim.previous
  const expected = previous
    ? `EXISTS(SELECT 1 FROM ${table} WHERE scopeId=${scope} AND snapshotId=${rollbackLiteral(previous.snapshotId)} AND publicationToken=${rollbackLiteral(previous.publicationToken)} AND preparedAt IS NOT NULL AND status='current')`
    : `NOT EXISTS(SELECT 1 FROM ${table} WHERE scopeId=${scope})`
  const snapshotId = claim.snapshotId ?? previous?.snapshotId
  if (!snapshotId) throw new Error('Cannot remove an unowned rollback scope.')
  return [
    statement(buildPublicationAssertionSql(expected)),
    statement(
      `INSERT INTO ${table}(scopeId,snapshotId,status,publicationToken,preparedAt,createdAt,updatedAt) VALUES(${scope},${rollbackLiteral(snapshotId)},'publishing',${rollbackLiteral(claim.publicationToken)},NULL,${rollbackLiteral(timestamp)},${rollbackLiteral(timestamp)}) ON CONFLICT(scopeId) DO UPDATE SET snapshotId=excluded.snapshotId,status='publishing',publicationToken=excluded.publicationToken,preparedAt=NULL,updatedAt=excluded.updatedAt`,
    ),
    rollbackClaimsGuard([claim]),
  ]
}

function searchDefinition(table: string): SearchIndexDefinition | undefined {
  return table === 'divisionPublicationState'
    ? divisionSearchIndex
    : table === 'addressPublicationState'
      ? addressSearchIndex
      : table === 'placePublicationState'
        ? placeSearchIndex
        : undefined
}

/** Every family keeps its complete future search selection, including unrelated scopes. */
export function rollbackSearchSql(current: Database, claims: RollbackClaim[]) {
  const statements: NetStatement[] = []
  for (const table of new Set(claims.map(claim => claim.table))) {
    const definition = searchDefinition(table)
    if (!definition) continue
    const affected = claims.filter(claim => claim.table === table)
    const existing = current
      .query<SearchScope, []>(
        `SELECT scopeId,snapshotId FROM ${definition.scopesTable}`,
      )
      .all()
    const scopes = existing.flatMap(scope => {
      const claim = affected.find(
        claim => claim.previous?.snapshotId === scope.snapshotId,
      )
      return claim
        ? claim.snapshotId
          ? [{ ...scope, snapshotId: claim.snapshotId }]
          : []
        : [scope]
    })
    for (const claim of affected) {
      if (
        claim.snapshotId &&
        !scopes.some(scope => scope.snapshotId === claim.snapshotId)
      )
        throw new Error(
          `Rollback is missing its retained ${definition.label} search selection.`,
        )
    }
    if (scopes.length)
      statements.push(...buildSearchSyncSql(definition, scopes).map(statement))
    else {
      // Explicit removal authority is required for an empty final selection.
      for (const scope of existing.filter(scope =>
        affected.some(claim => claim.previous?.snapshotId === scope.snapshotId),
      )) {
        if (
          current
            .query('SELECT 1 FROM sqlite_schema WHERE name=?')
            .get(definition.table)
        )
          statements.push({
            sql: `DELETE FROM ${definition.table} WHERE scopeId=?`,
            params: [scope.scopeId],
          })
        statements.push({
          sql: `DELETE FROM ${definition.scopesTable} WHERE scopeId=?`,
          params: [scope.scopeId],
        })
      }
    }
  }
  return statements
}

function apply(current: Database, statements: NetStatement[]) {
  current.transaction(() => {
    for (const item of statements) current.query(item.sql).run(...item.params)
  })()
}

/** Gate, change-only projection, catalogue switch, then atomic readiness and FTS. */
export async function captureRollbackDelivery(input: {
  context: LocalAddressDbContext
  tables: NetTablePolicy[]
  prepare: (
    current: Database,
    meta: Database,
  ) => Promise<{
    claims: RollbackClaim[]
    metadataGuard: NetStatement
    metadata: NetStatement[]
    terminal: RollbackTerminal
    details?: Record<string, unknown>
  }>
  append: (target: SqlDeliveryTarget, bytes: Uint8Array, kind: 'bound') => Promise<void>
}) {
  const files = input.context.state.files
  if (!files?.DB_CURRENT || !files.DB_META)
    throw new Error('Rollback requires a complete acknowledged mirror.')
  const target = (binding: string): SqlDeliveryTarget => ({
    bindingName: binding,
    databaseId:
      input.context.state.target === 'local'
        ? binding
        : (input.context.state.bindings[binding]?.databaseId ?? binding),
  })
  const emit = (binding: string, statements: NetStatement[]) => {
    const bytes = Buffer.from(JSON.stringify(statements))
    if (
      statements.length > 64 ||
      bytes.length > 4 * 1024 * 1024 ||
      statements.some(
        item => Buffer.byteLength(item.sql) > 100_000 || item.params.length > 100,
      )
    )
      throw new Error('Rollback atomic finalisation exceeds the SQL delivery budget.')
    return statements.length
      ? input.append(target(binding), bytes, 'bound')
      : Promise.resolve()
  }
  let prepared: Awaited<ReturnType<typeof input.prepare>> | undefined
  let begin: NetStatement[][] = []
  let finalise: NetStatement[] = []
  let started = false
  const start = async () => {
    if (started) return
    if (!prepared) throw new Error('Rollback reconstruction has not been validated.')
    await emit('DB_META', [prepared.metadataGuard])
    for (const claim of begin) await emit('DB_CURRENT', claim)
    started = true
  }
  const result = await captureNetSqlitePlan({
    targets: {
      DB_CURRENT: {
        path: files.DB_CURRENT,
        databaseId: target('DB_CURRENT').databaseId,
        tables: input.tables,
      },
      DB_META: {
        path: files.DB_META,
        databaseId: target('DB_META').databaseId,
        tables: [],
      },
    },
    limits: { maxStatements: 60, maxPayloadBytes: 4 * 1024 * 1024 - 16_384 },
    generate: async candidates => {
      const current = candidates.DB_CURRENT!.db
      const meta = candidates.DB_META!.db
      prepared = await input.prepare(current, meta)
      const timestamp = new Date().toISOString()
      begin = prepared.claims.map(claim => beginClaim(claim, timestamp))
      const validations: string[] = []
      for (const policy of input.tables) {
        const column = policy.rowScope?.column ?? 'snapshotId'
        for (const scope of policy.rowScope?.values ?? []) {
          const count = current
            .query<{ n: number }, [string]>(
              `SELECT count(*) AS n FROM "${policy.name}" WHERE "${column}"=?`,
            )
            .get(scope)!.n
          validations.push(
            `(SELECT count(*) FROM "${policy.name}" WHERE "${column}"=${rollbackLiteral(scope)})=${count}`,
          )
        }
      }
      finalise = [
        rollbackClaimsGuard(prepared.claims),
        statement(buildPublicationAssertionSql(validations.join(' AND ') || '1')),
      ]
      for (const claim of prepared.claims) {
        if (claim.statistics) {
          finalise.push(
            statement(
              claim.snapshotId
                ? `UPDATE statsPublicationState SET status='current',updatedAt=${rollbackLiteral(claim.publicationToken)} WHERE ${rollbackClaimScopePredicate(claim)}`
                : `DELETE FROM statsPublicationState WHERE ${rollbackClaimScopePredicate(claim)}`,
            ),
          )
          continue
        }
        finalise.push(
          statement(
            claim.snapshotId
              ? `UPDATE ${tableName(claim.table)} SET status='current',preparedAt=${rollbackLiteral(timestamp)},updatedAt=${rollbackLiteral(timestamp)} WHERE scopeId=${rollbackLiteral(claim.scopeId)}`
              : `DELETE FROM ${tableName(claim.table)} WHERE scopeId=${rollbackLiteral(claim.scopeId)}`,
          ),
        )
      }
      finalise.push(...rollbackSearchSql(current, prepared.claims))
      // Execute and roll back lifecycle/FTS SQL on the candidate before sealing.
      // The ordinary compiler sees only canonical data changes.
      current.exec('SAVEPOINT rollback_finalisation')
      try {
        for (const group of begin) apply(current, group)
        apply(current, finalise)
      } finally {
        current.exec('ROLLBACK TO rollback_finalisation; RELEASE rollback_finalisation')
      }
      meta.exec('SAVEPOINT rollback_metadata')
      try {
        apply(meta, prepared.metadata)
      } finally {
        meta.exec('ROLLBACK TO rollback_metadata; RELEASE rollback_metadata')
      }
      return { terminal: prepared.terminal, ...prepared.details }
    },
    append: async (destination, bytes) => {
      await start()
      if (!prepared || destination.bindingName !== 'DB_CURRENT')
        throw new Error('Unexpected rollback content target.')
      await emit('DB_CURRENT', [
        rollbackClaimsGuard(prepared.claims),
        ...(JSON.parse(new TextDecoder().decode(bytes)) as NetStatement[]),
      ])
    },
  })
  await start()
  if (!prepared) throw new Error('Rollback preparation is unavailable.')
  await emit('DB_META', prepared.metadata)
  await emit('DB_CURRENT', finalise)
  return { ...result.result, mutationSummary: result.summary }
}
