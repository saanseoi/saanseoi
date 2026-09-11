import { requireDefined } from '../../requireDefined'
import {
  buildDeterministicUuidV5,
  computeVersionHash,
  eq,
  metaSchema,
  toIsoTimestamp,
  type MetaDatabase,
} from '@repo/db'
import type { HarbourReadableDb, HarbourWritableDb } from '../../lib/db/types'
import type { ResourceType } from '../../types'

const namespace = '747dc748-4086-5dc5-a0de-7d1fefcd0c51'
const {
  metaSnapshots,
  metaSnapshotSources,
  metaSnapshotAssembly,
  metaSnapshotAssemblySources,
  metaSnapshotAssemblyRuns,
} = metaSchema

/** Records the effective input recipe, not a catalogue of hypothetical inputs.
 * Recipes are content addressed; a draft run follows its evolving selection.
 * Published runs retain the recipe that produced the published snapshot. */
export async function recordEffectiveSnapshotAssembly(
  db: HarbourReadableDb & HarbourWritableDb,
  args: {
    snapshotId: string
    resourceType: ResourceType
    anchorCohortKey: string
    anchorReleaseId?: string | null
    selectionSummaryJson?: Record<string, unknown> | null
    allowPlanning?: boolean
  },
) {
  const snapshot = await db
    .select({
      status: metaSnapshots.status,
      resourceType: metaSnapshots.resourceType,
      cohortKey: metaSnapshots.cohortKey,
    })
    .from(metaSnapshots)
    .where(eq(metaSnapshots.id, args.snapshotId))
    .get()
  if (!snapshot || snapshot.resourceType !== args.resourceType)
    throw new Error(
      `Assembly snapshot is missing or has the wrong resource type: ${args.snapshotId}.`,
    )
  const existing = await db
    .select()
    .from(metaSnapshotAssemblyRuns)
    .where(eq(metaSnapshotAssemblyRuns.snapshotId, args.snapshotId))
    .get()
  if (snapshot.status !== 'draft') {
    if (!existing)
      throw new Error(`Published snapshot has no assembly record: ${args.snapshotId}.`)
    return { id: String(existing.snapshotAssemblyId) }
  }
  const sources = await db
    .select({
      datasetId: metaSnapshotSources.datasetId,
      sourceReleaseId: metaSnapshotSources.resourceReleaseId,
      role: metaSnapshotSources.role,
      selectedByRule: metaSnapshotSources.selectedByRule,
      selectionMode: metaSnapshotSources.selectionMode,
      anchorReleaseId: metaSnapshotSources.anchorReleaseId,
      sourceCohortKey: metaSnapshotSources.sourceCohortKey,
    })
    .from(metaSnapshotSources)
    .where(eq(metaSnapshotSources.snapshotId, args.snapshotId))
    .all()
  sources.sort((a, b) =>
    `${a.datasetId}:${a.role}:${a.sourceReleaseId}`.localeCompare(
      `${b.datasetId}:${b.role}:${b.sourceReleaseId}`,
    ),
  )
  if (!sources.length && !args.allowPlanning)
    throw new Error(
      `Cannot record an assembly without selected sources: ${args.snapshotId}.`,
    )
  const inputs = new Map<
    string,
    {
      datasetId: string
      role: string
      rules: Array<{ selectedByRule: string; selectionMode: string }>
    }
  >()
  for (const source of sources) {
    if (!source.selectedByRule || !source.selectionMode)
      throw new Error(
        `Assembly selection rule is missing for ${args.snapshotId}/${source.sourceReleaseId}.`,
      )
    const key = `${source.datasetId}:${source.role}`
    const input = inputs.get(key) ?? {
      datasetId: source.datasetId,
      role: source.role,
      rules: [],
    }
    const rule = {
      selectedByRule: source.selectedByRule,
      selectionMode: source.selectionMode,
    }
    if (
      !input.rules.some(
        value =>
          value.selectedByRule === rule.selectedByRule &&
          value.selectionMode === rule.selectionMode,
      )
    )
      input.rules.push(rule)
    input.rules.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    inputs.set(key, input)
  }
  const recipe = {
    version: 1,
    resourceType: args.resourceType,
    inputs: [...inputs.values()],
  }
  const versionHash = computeVersionHash(recipe)
  const code = `snapshot-assembly-${args.resourceType}-v1-${versionHash}`
  const assemblyId = buildDeterministicUuidV5(namespace, code)
  const now = toIsoTimestamp()
  await db
    .insert(metaSnapshotAssembly)
    .values({
      id: assemblyId,
      code,
      resourceType: args.resourceType,
      version: 1,
      status: 'scoped',
      versionHash,
      notes:
        'Effective source selection recipe; required inputs reproduce this recorded selection.',
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run()
  for (const input of inputs.values()) {
    await db
      .insert(metaSnapshotAssemblySources)
      .values({
        snapshotAssemblyId: assemblyId,
        datasetId: input.datasetId,
        role: input.role,
        isRequired: true,
        selectorType:
          input.rules.length === 1
            ? requireDefined(input.rules[0]).selectionMode
            : 'multiple',
        anchorDatasetId: null,
        maxLagDays: null,
        priority: 0,
        configJson: { rules: input.rules },
      })
      .onConflictDoNothing()
      .run()
  }
  const previousSummary = existing?.selectionSummaryJson as
    | Record<string, unknown>
    | null
    | undefined
  const summary = {
    ...(previousSummary && typeof previousSummary === 'object' ? previousSummary : {}),
    ...args.selectionSummaryJson,
    ...(previousSummary?.lookupSnapshotIds ||
    args.selectionSummaryJson?.lookupSnapshotIds
      ? {
          lookupSnapshotIds: {
            ...(previousSummary?.lookupSnapshotIds as
              | Record<string, string>
              | undefined),
            ...(args.selectionSummaryJson?.lookupSnapshotIds as
              | Record<string, string>
              | undefined),
          },
        }
      : {}),
    sources,
  }
  const primary = sources.find(source => source.role === 'primary')
  const values = {
    snapshotAssemblyId: assemblyId,
    anchorReleaseId:
      primary?.anchorReleaseId ??
      primary?.sourceReleaseId ??
      args.anchorReleaseId ??
      null,
    anchorCohortKey: snapshot.cohortKey ?? args.anchorCohortKey,
    status: sources.length ? 'selected' : 'planning',
    selectionSummaryJson: summary,
    updatedAt: now,
  }
  await db
    .insert(metaSnapshotAssemblyRuns)
    .values({
      id:
        existing?.id ??
        buildDeterministicUuidV5(namespace, `snapshot-assembly-run:${args.snapshotId}`),
      snapshotId: args.snapshotId,
      ...values,
      createdAt: now,
    })
    .onConflictDoUpdate({ target: metaSnapshotAssemblyRuns.id, set: values })
    .run()
  return { id: assemblyId, code }
}

/** Parent rows must be replayed before their runs, including on an empty target. */
export async function readSnapshotAssemblySql(
  database: HarbourReadableDb | MetaDatabase,
  snapshotId: string,
  includeRuns = false,
) {
  const db = database as HarbourReadableDb
  const runs = await db
    .select()
    .from(metaSnapshotAssemblyRuns)
    .where(eq(metaSnapshotAssemblyRuns.snapshotId, snapshotId))
    .all()
  if (!runs.length) throw new Error(`Snapshot assembly run is missing: ${snapshotId}.`)
  const statements: string[] = []
  for (const id of new Set(runs.map(run => String(run.snapshotAssemblyId)))) {
    const assembly = await db
      .select()
      .from(metaSnapshotAssembly)
      .where(eq(metaSnapshotAssembly.id, id))
      .get()
    if (!assembly) throw new Error(`Snapshot assembly recipe is missing: ${id}.`)
    statements.push(insertSql('snapshotAssembly', assembly))
    const sources = await db
      .select()
      .from(metaSnapshotAssemblySources)
      .where(eq(metaSnapshotAssemblySources.snapshotAssemblyId, id))
      .all()
    statements.push(
      ...sources.map(source => insertSql('snapshotAssemblySources', source)),
    )
  }
  if (includeRuns)
    statements.push(...runs.map(run => insertSql('snapshotAssemblyRuns', run, 'id')))
  return statements
}

function insertSql(table: string, row: Record<string, unknown>, updateKey?: string) {
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`
  const literal = (value: unknown): string => {
    if (value === null || value === undefined) return 'NULL'
    if (typeof value === 'boolean') return value ? '1' : '0'
    if (typeof value === 'number') return String(value)
    const text = typeof value === 'string' ? value : JSON.stringify(value)
    return `'${text.replaceAll("'", "''")}'`
  }
  const columns = Object.keys(row)
  const conflict = updateKey
    ? `ON CONFLICT (${quote(updateKey)}) DO UPDATE SET ${columns
        .filter(key => key !== updateKey)
        .map(key => `${quote(key)} = excluded.${quote(key)}`)
        .join(', ')}`
    : 'ON CONFLICT DO NOTHING'
  return `INSERT INTO ${quote(table)} (${columns.map(quote).join(', ')}) VALUES (${columns.map(key => literal(row[key])).join(', ')}) ${conflict};`
}
