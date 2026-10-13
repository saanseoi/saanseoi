import { resolveSnapshotProcessingRules } from '../../provenance/processingPolicyCatalogue'
import type { ProcessingRules } from '../../provenance/processingPolicy'
import { retainProcessingRules } from '../../lib/db/processingRuleDefinitions'
import { recordSnapshotDependencies } from './snapshotDependencies'
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
import { currentRowChangedSqlText } from '../services/publication/currentWrites'

const namespace = '747dc748-4086-5dc5-a0de-7d1fefcd0c51'
const {
  metaSnapshotLineages,
  metaSnapshots,
  metaSnapshotResourceReleases,
  metaSnapshotRecipes,
  metaSnapshotRecipeInputs,
  metaSnapshotAssemblies,
} = metaSchema

/** Records the effective input recipe, not a catalogue of hypothetical inputs.
 * Recipes are content addressed; a draft assembly follows its evolving selection.
 * Published assemblies retain the recipe that produced the published snapshot. */
export async function recordEffectiveSnapshotAssembly(
  db: HarbourReadableDb & HarbourWritableDb,
  args: {
    snapshotId: string
    resourceType: ResourceType
    anchorReleaseId?: string | null
    dependencies?: Record<string, string>
    processingRules?: ProcessingRules
    allowPlanning?: boolean
  },
) {
  const snapshot = await db
    .select({
      status: metaSnapshots.status,
      resourceType: metaSnapshotLineages.resourceType,
      cohortKey: metaSnapshots.cohortKey,
    })
    .from(metaSnapshots)
    .innerJoin(
      metaSnapshotLineages,
      eq(metaSnapshots.snapshotLineageId, metaSnapshotLineages.id),
    )
    .where(eq(metaSnapshots.id, args.snapshotId))
    .get()
  if (!snapshot || snapshot.resourceType !== args.resourceType)
    throw new Error(
      `Assembly snapshot is missing or has the wrong resource type: ${args.snapshotId}.`,
    )
  const existing = await db
    .select({
      id: metaSnapshotAssemblies.id,
      snapshotRecipeId: metaSnapshotAssemblies.snapshotRecipeId,
    })
    .from(metaSnapshotAssemblies)
    .where(eq(metaSnapshotAssemblies.snapshotId, args.snapshotId))
    .get()
  if (snapshot.status !== 'draft') {
    if (!existing)
      throw new Error(`Published snapshot has no assembly record: ${args.snapshotId}.`)
    return { id: String(existing.snapshotRecipeId) }
  }
  const sources = await db
    .select({
      datasetId: metaSnapshotResourceReleases.datasetId,
      datasetCode: metaSchema.metaDatasets.code,
      sourceReleaseId: metaSnapshotResourceReleases.resourceReleaseId,
      role: metaSnapshotResourceReleases.role,
      selectedByRule: metaSnapshotResourceReleases.selectedByRule,
      selectionMode: metaSnapshotResourceReleases.selectionMode,
      anchorReleaseId: metaSnapshotResourceReleases.anchorReleaseId,
      sourceCohortKey: metaSnapshotResourceReleases.sourceCohortKey,
    })
    .from(metaSnapshotResourceReleases)
    .innerJoin(
      metaSchema.metaDatasets,
      eq(metaSnapshotResourceReleases.datasetId, metaSchema.metaDatasets.id),
    )
    .where(eq(metaSnapshotResourceReleases.snapshotId, args.snapshotId))
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
  const processingRules =
    args.processingRules ??
    resolveSnapshotProcessingRules(
      [...new Set(sources.map(source => source.datasetCode))],
      args.resourceType,
    )
  if (processingRules.stage !== 'assembly')
    throw new Error('Snapshot recipes require assembly rules.')
  const retainedRules = await retainProcessingRules(db, processingRules)
  const recipe = {
    version: 1,
    resourceType: args.resourceType,
    inputs: [...inputs.values()],
    processingRules,
  }
  const versionHash = computeVersionHash(recipe)
  const code = `sa-${args.resourceType}-v1-${versionHash}`
  const assemblyId = buildDeterministicUuidV5(namespace, code)
  const now = toIsoTimestamp()
  await db
    .insert(metaSnapshotRecipes)
    .values({
      id: assemblyId,
      code,
      resourceType: args.resourceType,
      version: 1,
      versionHash,
      processingRules: retainedRules,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run()
  for (const input of inputs.values()) {
    await db
      .insert(metaSnapshotRecipeInputs)
      .values({
        snapshotRecipeId: assemblyId,
        datasetId: input.datasetId,
        role: input.role,
        isRequired: true,
        maxLagDays: null,
        priority: 0,
        selectionPolicyJson: { rules: input.rules },
      })
      .onConflictDoNothing()
      .run()
  }
  await recordSnapshotDependencies(db, args.snapshotId, args.dependencies ?? {})
  const primary = sources.find(source => source.role === 'primary')
  const values = {
    snapshotRecipeId: assemblyId,
    anchorReleaseId:
      primary?.anchorReleaseId ??
      primary?.sourceReleaseId ??
      args.anchorReleaseId ??
      null,
    updatedAt: now,
  }
  await db
    .insert(metaSnapshotAssemblies)
    .values({
      id:
        existing?.id ??
        buildDeterministicUuidV5(namespace, `snapshot-assembly-run:${args.snapshotId}`),
      snapshotId: args.snapshotId,
      ...values,
      createdAt: now,
    })
    .onConflictDoUpdate({ target: metaSnapshotAssemblies.id, set: values })
    .run()
  return { id: assemblyId, code }
}

/** Parent rows must be replayed before their runs, including on an empty target. */
export async function readSnapshotAssemblySql(
  database: HarbourReadableDb | MetaDatabase,
  snapshotId: string,
  includeAssemblies = false,
) {
  const db = database as HarbourReadableDb
  const runs = await db
    .select()
    .from(metaSnapshotAssemblies)
    .where(eq(metaSnapshotAssemblies.snapshotId, snapshotId))
    .all()
  if (!runs.length) throw new Error(`Snapshot assembly run is missing: ${snapshotId}.`)
  const statements: string[] = []
  for (const id of new Set(runs.map(run => String(run.snapshotRecipeId)))) {
    const assembly = await db
      .select()
      .from(metaSnapshotRecipes)
      .where(eq(metaSnapshotRecipes.id, id))
      .get()
    if (!assembly) throw new Error(`Snapshot assembly recipe is missing: ${id}.`)
    if (assembly.processingRules) {
      if (typeof assembly.processingRules !== 'string')
        throw new Error(`Snapshot assembly processing reference must be a hash: ${id}.`)
      const definition = await db
        .select()
        .from(metaSchema.metaProcessingRuleDefinitions)
        .where(
          eq(metaSchema.metaProcessingRuleDefinitions.id, assembly.processingRules),
        )
        .get()
      if (!definition)
        throw new Error(`Snapshot assembly processing policy is missing: ${id}.`)
      statements.push(insertSql('processingRuleDefinitions', definition))
    }
    statements.push(insertSql('snapshotRecipes', assembly))
    const sources = await db
      .select()
      .from(metaSnapshotRecipeInputs)
      .where(eq(metaSnapshotRecipeInputs.snapshotRecipeId, id))
      .all()
    statements.push(...sources.map(source => insertSql('snapshotRecipeInputs', source)))
  }
  if (includeAssemblies)
    statements.push(...runs.map(run => insertSql('snapshotAssemblies', run, 'id')))
  const dependencies = await db
    .select()
    .from(metaSchema.metaSnapshotDependencies)
    .where(eq(metaSchema.metaSnapshotDependencies.snapshotId, snapshotId))
    .all()
  statements.push(
    ...dependencies.map(dependency =>
      insertSql('snapshotDependencies', dependency, ['snapshotId', 'role']),
    ),
  )
  return statements
}

function insertSql(
  table: string,
  row: Record<string, unknown>,
  updateKey?: string | string[],
) {
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`
  const literal = (value: unknown): string => {
    if (value === null || value === undefined) return 'NULL'
    if (typeof value === 'boolean') return value ? '1' : '0'
    if (typeof value === 'number') return String(value)
    const text = typeof value === 'string' ? value : JSON.stringify(value)
    return `'${text.replaceAll("'", "''")}'`
  }
  const columns = Object.keys(row)
  const updateKeys = typeof updateKey === 'string' ? [updateKey] : updateKey
  const conflict = updateKeys
    ? `ON CONFLICT (${updateKeys.map(quote).join(', ')}) DO UPDATE SET ${columns
        .filter(key => !updateKeys.includes(key))
        .map(key => `${quote(key)} = excluded.${quote(key)}`)
        .join(', ')} WHERE ${currentRowChangedSqlText(table, columns, [])}`
    : 'ON CONFLICT DO NOTHING'
  return `INSERT INTO ${quote(table)} (${columns.map(quote).join(', ')}) VALUES (${columns.map(key => literal(row[key])).join(', ')}) ${conflict};`
}
