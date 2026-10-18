import { canonicaliseApiFieldSourceSchemas } from '../../core/src/lib/db/metaRegistry'
import { Database } from 'bun:sqlite'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { resolveApiFieldFixture } from '../src/apiFieldFixtures'
import { resolveApiResponseFields } from '../src/apiResponseFields'
import { pinApiFieldRules } from '../src/apiFieldInputs'
import { compileFieldLineage, type LineageSource } from '../src/fieldLineageCompiler'
import {
  validateFieldLineageBinding,
  validateFieldLineageDefinition,
} from '../src/fieldLineageGraph'
import type { LineageDefinition, ReleaseBinding } from '../src/fieldLineageTypes'
import { computeVersionHash } from '../src/versioning'
import {
  readFieldLineage,
  retainFieldLineage,
} from '../../core/src/provenance/fieldLineageStorage'
import { stageLocalLineageObjects } from './localFieldLineageObjects'

// Local-only, additive R2 retention followed by one compare-and-swap META transaction.
// The existing definitions and every source/snapshot/publication record remain retained.
const [metaPathArg, outputArg, applyArg] = process.argv.slice(2)
if (!metaPathArg || !outputArg || (applyArg && applyArg !== '--apply'))
  throw new Error(
    'Usage: bun libs/db/scripts/refresh-field-lineage-local.ts META.sqlite OUTPUT_DIRECTORY [--apply]',
  )
const root = resolve(import.meta.dir, '../../..')
const metaPath = resolve(metaPathArg),
  output = resolve(outputArg)
if (!metaPath.startsWith(`${resolve(root, '.local/d1/dev')}/`))
  throw new Error('Only the local development registry is supported.')
const apply = applyArg === '--apply'
const db = new Database(metaPath, { readonly: !apply, readwrite: apply, create: false })
const r2Directory = resolve(root, '.local/d1/dev/v3/r2')
const bucketConfig = JSON.parse(
  await Bun.file(resolve(root, 'apps/harbour-api/wrangler.jsonc')).text(),
)
const bucketName = bucketConfig.r2_buckets.find(
  (entry: { binding: string }) => entry.binding === 'R2_ASSETS',
).bucket_name
const r2Paths = [
  ...new Bun.Glob('*.sqlite').scanSync(join(r2Directory, 'miniflare-R2BucketObject')),
]
const r2 = r2Paths
  .map(
    path =>
      new Database(join(r2Directory, 'miniflare-R2BucketObject', path), {
        readonly: true,
      }),
  )
  .find(candidate => {
    if (
      candidate.query("SELECT 1 FROM sqlite_master WHERE name='_mf_objects'").get() &&
      candidate
        .query("SELECT 1 FROM _mf_objects WHERE key LIKE 'provenance/%' LIMIT 1")
        .get()
    )
      return true
    candidate.close()
    return false
  })
if (!r2) throw new Error('Missing retained local provenance bucket.')
const reader = {
  async get(key: string) {
    const row = r2.query('SELECT blob_id FROM _mf_objects WHERE key=?').get(key) as {
      blob_id: string
    } | null
    return row ? Bun.file(join(r2Directory, bucketName, 'blobs', row.blob_id)) : null
  },
  async put() {
    throw new Error('Read-only retained store.')
  },
}
const staged = stageLocalLineageObjects()
mkdirSync(output, { recursive: true })
try {
  const releases = db
    .query(`SELECT s.*,v.code AS apiVersion,a.id AS apiVersionReleaseSetId,p.definitionId,p.binding
    FROM apiReleaseSets s JOIN apiVersionReleaseSets a ON a.apiReleaseSetId=s.id
    JOIN apiVersions v ON v.id=a.apiVersionId JOIN apiFieldProvenance p ON p.apiReleaseSetId=s.id ORDER BY s.id`)
    .all() as Array<Record<string, any>>
  const preservedTables = [
    'apiReleaseSets',
    'apiVersionReleaseSets',
    'apiReleaseSetSnapshots',
    'snapshots',
    'snapshotAssemblies',
    'snapshotResourceReleases',
    'resourceReleases',
    'sourceReleases',
  ]
  const fingerprint = () =>
    computeVersionHash(
      preservedTables.map(table => [
        table,
        db.query(`SELECT * FROM ${table} ORDER BY rowid`).all(),
      ]),
    )
  const before = fingerprint()
  const definitions = new Map<string, LineageDefinition>()
  const plans: Array<{
    releaseSetId: string
    code: string
    previousDefinitionId: string
    previousBinding: string
    reference: Awaited<ReturnType<typeof retainFieldLineage>>
    binding: ReleaseBinding
    fields: number
  }> = []
  for (const release of releases) {
    let old = definitions.get(release.definitionId)
    if (!old) {
      const ref = db
        .query('SELECT * FROM fieldLineageDefinitions WHERE id=?')
        .get(release.definitionId) as any
      old = (await readFieldLineage(reader, ref)) as LineageDefinition
      validateFieldLineageDefinition(old)
      definitions.set(release.definitionId, old)
    }
    const binding = JSON.parse(release.binding) as ReleaseBinding
    validateFieldLineageBinding(old, binding)
    if (
      binding.apiReleaseSetId !== release.id ||
      binding.apiVersionReleaseSetId !== release.apiVersionReleaseSetId
    )
      throw new Error('Release binding identity mismatch.')
    const sources: LineageSource[] = old.scopes
      .filter(scope => scope.kind === 'source-release')
      .map(scope => {
        const pin = binding.scopes.find(pin => pin.scopeId === scope.id)!
        if (
          !pin.resourceReleaseId ||
          !scope.sourceDatasetId ||
          !scope.datasetCode ||
          !scope.schemaVersion
        )
          throw new Error('Incomplete retained source identity.')
        const policies = (pin.definitionHashes ?? []).map(
          hash => old!.definitions[hash],
        )
        if (policies.length > 1 || policies.some(value => !value))
          throw new Error('Ambiguous retained source policy.')
        const owners = binding.scopes
          .filter(b => b.dependency?.ownerScopeId === scope.id)
          .flatMap(b => b.dependency!.ownerSnapshotIds)
        return {
          sourceDatasetId: scope.sourceDatasetId,
          datasetCode: scope.datasetCode,
          resourceType: scope.resourceType,
          sourceSchemaVersion: scope.schemaVersion,
          resourceReleaseId: pin.resourceReleaseId,
          sourceReleaseId: pin.sourceReleaseId,
          processingRules: policies[0] ?? null,
          processingManifest: pin.processingManifest,
          producerSnapshotIds: [...new Set(owners)],
        }
      })
    const snapshots = db
      .query(`SELECT m.snapshotId,l.resourceType,a.snapshotRecipeId,r.processingRules FROM apiReleaseSetSnapshots m
      JOIN snapshots s ON s.id=m.snapshotId JOIN snapshotLineages l ON l.id=s.snapshotLineageId
      LEFT JOIN snapshotAssemblies a ON a.snapshotId=s.id LEFT JOIN snapshotRecipes r ON r.id=a.snapshotRecipeId
      WHERE m.apiReleaseSetId=?`)
      .all(release.id) as Array<{
      snapshotId: string
      resourceType: string
      snapshotRecipeId: string | null
      processingRules: string | null
    }>
    const contextSnapshots = snapshots.map(s => ({
      snapshotId: s.snapshotId,
      resourceType: s.resourceType,
      ...(s.snapshotRecipeId ? { snapshotRecipeId: s.snapshotRecipeId } : {}),
      processingRules: s.processingRules
        ? s.processingRules.startsWith('sha256:')
          ? old!.definitions[s.processingRules]
          : JSON.parse(s.processingRules)
        : null,
    }))
    for (const s of contextSnapshots) {
      if (
        snapshots.find(row => row.snapshotId === s.snapshotId)?.processingRules &&
        !s.processingRules
      )
        throw new Error(`Missing retained recipe ${s.snapshotRecipeId}`)
      if (s.processingRules && !old.definitions[computeVersionHash(s.processingRules)])
        throw new Error(
          `Recipe is not retained in ${release.code}: ${s.snapshotRecipeId}`,
        )
    }
    const lineageCodes = new Set<string>()
    for (const snapshot of snapshots) {
      let id: string | null = snapshot.snapshotId
      const seen = new Set<string>()
      while (id) {
        if (seen.has(id)) throw new Error('Snapshot ancestry cycle.')
        seen.add(id)
        const s = db
          .query('SELECT code,parentSnapshotId FROM snapshots WHERE id=?')
          .get(id) as { code: string; parentSnapshotId: string | null } | null
        if (!s) throw new Error('Missing snapshot ancestor.')
        lineageCodes.add(s.code)
        id = s.parentSnapshotId
      }
    }
    const schemaVariants: Record<string, string[]> = {}
    for (const s of sources) {
      const versions = schemaVariants[s.datasetCode!] ?? []
      schemaVariants[s.datasetCode!] = versions
      if (!versions.includes(s.sourceSchemaVersion))
        versions.push(s.sourceSchemaVersion)
    }
    const schemas = canonicaliseApiFieldSourceSchemas(
      Object.fromEntries(
        Object.entries(schemaVariants).map(([code, versions]) => [
          code,
          versions.sort()[0]!,
        ]),
      ),
    ).sourceSchemas
    const fixture = resolveApiFieldFixture({
      apiVersion: release.apiVersion,
      domainCode: release.domainCode,
      lineageSnapshotVersions: [...lineageCodes],
      schemaVersion: release.schemaVersion,
      rulesetVersion: release.rulesetVersion,
      sourceSchemas: schemas,
      sourceSchemaVariants: schemaVariants,
    })
    if (!fixture)
      throw new Error(
        `No exact authoring fixture for ${release.code}: ${JSON.stringify({ lineageCodes: [...lineageCodes], schemas })}`,
      )
    const datasetId = (code: string) => {
      const id = sources.find(s => s.datasetCode === code)?.sourceDatasetId
      if (!id) throw new Error(`Unbound dataset ${code}`)
      return id
    }
    const graph = compileFieldLineage(
      fixture.fields.map(field => ({
        ...field,
        variant: field.variant ?? null,
        confidence: field.confidence ?? null,
        sourceDatasetId: datasetId(field.sourceDatasetCode),
        resolverRules: pinApiFieldRules(field, [
          ...sources.filter(s => s.datasetCode === field.sourceDatasetCode),
          ...contextSnapshots
            .filter(s => s.snapshotRecipeId)
            .map(s => ({
              snapshotRecipeId: s.snapshotRecipeId!,
              processingRules: s.processingRules,
            })),
        ]),
      })),
      new Map(
        Object.entries(fixture.publisherFields).map(([code, fields]) => [
          datasetId(code),
          fields,
        ]),
      ),
      {
        api: {
          version: release.apiVersion,
          responseSchemaVersion: release.schemaVersion,
          responseSchemaHash: fixture.responseFieldsVersionHash,
        },
        apiReleaseSetId: release.id,
        apiVersionReleaseSetId: release.apiVersionReleaseSetId,
        responseDefinition: resolveApiResponseFields(
          release.apiVersion,
          release.schemaVersion,
        ),
        sources,
        snapshots: contextSnapshots,
      },
    )
    if (graph.definition.fields.some(f => f.completeness !== 'complete'))
      throw new Error(`Incomplete refreshed graph ${release.code}`)
    for (const pin of binding.scopes) {
      const refreshed = graph.binding.scopes.find(
        value => value.scopeId === pin.scopeId,
      )
      if (!refreshed || computeVersionHash(refreshed) !== computeVersionHash(pin))
        throw new Error(
          `Refresh would change an exact retained binding: ${release.code}/${pin.scopeId}`,
        )
    }
    const ref = await retainFieldLineage(staged.store, graph.id, graph.definition)
    plans.push({
      releaseSetId: release.id,
      code: release.code,
      previousDefinitionId: release.definitionId,
      previousBinding: release.binding,
      reference: ref,
      binding: graph.binding,
      fields: graph.definition.fields.length,
    })
  }
  writeFileSync(
    join(output, 'plan.json'),
    `${JSON.stringify(
      {
        apply,
        releases: plans.length,
        definitions: new Set(plans.map(p => p.reference.id)).size,
        preservedFingerprint: before,
        plans,
      },
      null,
      2,
    )}\n`,
  )
  if (apply) {
    writeFileSync(join(output, 'meta-before.sqlite'), db.serialize(), { flag: 'wx' })
    await staged.deliver()
    for (const p of plans) await readFieldLineage(reader, p.reference)
    db.transaction(() => {
      if (fingerprint() !== before)
        throw new Error(
          'Release metadata changed during preparation; retry from fresh bindings.',
        )
      for (const p of plans) {
        const current = db
          .query(
            'SELECT definitionId,binding FROM apiFieldProvenance WHERE apiReleaseSetId=?',
          )
          .get(p.releaseSetId) as any
        if (
          current?.definitionId !== p.previousDefinitionId ||
          current?.binding !== p.previousBinding
        )
          throw new Error('Lineage pin changed during preparation.')
        db.query(
          'INSERT OR IGNORE INTO fieldLineageDefinitions(id,schemaVersion,manifestHash,manifestByteLength) VALUES (?,?,?,?)',
        ).run(
          p.reference.id,
          p.reference.schemaVersion,
          p.reference.manifestHash,
          p.reference.manifestByteLength,
        )
        db.query(
          'UPDATE apiFieldProvenance SET definitionId=?,binding=? WHERE apiReleaseSetId=?',
        ).run(p.reference.id, JSON.stringify(p.binding), p.releaseSetId)
      }
      if (fingerprint() !== before)
        throw new Error('Unexpected release metadata mutation.')
    }).immediate()
  }
  console.log(
    JSON.stringify({
      applied: apply,
      releases: plans.length,
      definitions: new Set(plans.map(p => p.reference.id)).size,
      output,
    }),
  )
} finally {
  await staged.dispose()
  r2.close()
  db.close()
}
