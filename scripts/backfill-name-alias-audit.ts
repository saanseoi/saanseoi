import { boundaryPatchEvidence } from '../apps/harbour-cli/src/lib/pipeline/curatedDivisions/boundaryPatchEvidence'
import { checkPreparedHierarchy } from '../apps/harbour-cli/src/lib/pipeline/curatedDivisions/preparationRules'
import { reconstructAliasAudit } from '../apps/harbour-cli/src/lib/pipeline/curatedDivisions/nameAliasAudit'
import { preparationChecks } from '../apps/harbour-cli/src/lib/pipeline/curatedDivisions/preparationChecks'
import { preparationUpdatePolicy } from '../apps/harbour-cli/src/lib/pipeline/curatedDivisions/preparationUpdatePolicy'
import { retainFixturePartitions } from '../libs/core/src/provenance/fixtures'
import { Database } from 'bun:sqlite'
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { unzipSync, strFromU8 } from 'fflate'
import { LocalPipelineBucket } from '../apps/harbour-cli/src/lib/pipeline/local/localBucket'
import { stageLocalLineageObjects } from '../libs/db/scripts/localFieldLineageObjects'
import {
  readObject,
  transferProcessingResult,
  retainObject,
  validateAuditManifest,
  type ObjectRef,
} from '../libs/core/src/provenance'
import { stableJsonStringify } from '../libs/core/src/pipeline/utils'

const [metaPath, archivePath, outputPath, apply] = process.argv.slice(2)
if (!metaPath || !archivePath || !outputPath || (apply && apply !== '--apply'))
  throw Error(
    'Usage: bun scripts/backfill-name-alias-audit.ts META.sqlite ARCHIVE.zip OUTPUT_DIRECTORY [--apply]',
  )
const root = resolve(import.meta.dir, '..')
if (!resolve(metaPath).startsWith(`${resolve(root, '.local/d1/dev')}/`))
  throw Error('This backfill only supports the local development registry.')
const db = new Database(metaPath, apply ? { readwrite: true } : { readonly: true })
const files = unzipSync(new Uint8Array(await readFile(archivePath)))
const archive = JSON.parse(strFromU8(files['manifest.json']!))
if (
  archive.datasetCode !== 'ds-hk-saanseoi-division' ||
  !['division', 'divisionArea'].includes(archive.resourceType)
)
  throw Error('Expected a SaanSeoi division archive.')
const release = db
  .query('SELECT id FROM resourceReleases WHERE code = ? AND resourceType = ?')
  .get(archive.releaseCode, archive.resourceType) as { id: string } | null
if (!release) throw Error('Archive release is not registered locally.')
const existing = db
  .query(
    "SELECT manifestHash AS hash, byteLength FROM processingAudits WHERE resourceReleaseId = ? AND stage = 'preparation' AND ownerId = ?",
  )
  .get(release.id, release.id) as ObjectRef | null
if (!existing) throw Error('No retained preparation audit to supplement.')
const retained = new LocalPipelineBucket(
  resolve(root, '.local/curated-divisions/audits/dev', release.id),
)
const original = await readObject(retained, existing)
validateAuditManifest(original)
const edition = original.bulk.find(
  rule => rule.id === 'prepare-curated-division-edition',
)
if (!edition) throw Error('Missing edition audit.')
const evidence = archive.provenance.preparation
if (!evidence) throw Error('Archive lacks frozen preparation evidence.')
const equal = (a: unknown, b: unknown) =>
  stableJsonStringify(a) === stableJsonStringify(b)
const readFixtures = async (type: string) =>
  Promise.all(
    edition.fixtures
      .filter(fixture => fixture.type === type)
      .map(fixture => readObject(retained, fixture.object)),
  ) as Promise<any[]>
const changes = (await readFixtures('prepared-division-changes')).flatMap(
  value => value.entries,
)
const parts = (await readFixtures('curation-definitions'))
  .flatMap(value => value.parts)
  .sort((a, b) => a.ordinal - b.ordinal)
if (
  !equal(changes, evidence.changes) ||
  !equal(JSON.parse(parts.map(part => part.json).join('')), evidence.definitions)
)
  throw Error('Archive differs from the registered preparation evidence.')
const contexts = reconstructAliasAudit(evidence)
let areaFiles = files
if (archive.resourceType === 'division' && !evidence.boundaryPatches) {
  const pairedPath = resolve(
    dirname(archivePath),
    `${archive.releaseCode.replace('saanseoi-division-', 'saanseoi-division-area-')}.zip`,
  )
  areaFiles = unzipSync(new Uint8Array(await readFile(pairedPath)))
  const paired = JSON.parse(strFromU8(areaFiles['manifest.json']!))
  if (
    paired.resourceType !== 'divisionArea' ||
    !equal(paired.provenance?.preparation?.definitions, evidence.definitions) ||
    !equal(paired.provenance?.preparation?.records, evidence.records)
  )
    throw Error('Paired area archive differs from the division preparation evidence.')
}
const boundaryPatches =
  evidence.boundaryPatches ??
  boundaryPatchEvidence(
    evidence.definitions,
    JSON.parse(strFromU8(areaFiles['records.json']!)).rows,
  )
const checks = [
  checkPreparedHierarchy(evidence.records, evidence.names),
  ...preparationChecks({
    ...evidence,
    islandGroups: archive.provenance.islandGroups,
    boundaryPatches,
  }),
  preparationUpdatePolicy(evidence).guard,
].map(check => ({
  ...check,
  reason: `Checked during backfill against frozen preparation evidence. ${check.reason}`,
}))
// Rechecking an existing audit must retain failures too. This does not ingest
// records or bypass the blocking checks in retainCuratedPreparationAudit.
const destination = new LocalPipelineBucket(resolve(outputPath))
const store = {
  get: async (key: string) => (await destination.get(key)) ?? retained.get(key),
  put: (key: string, value: ArrayBuffer) => destination.put(key, value),
}
const nameParts = await retainFixturePartitions(
  store,
  { evidenceBasis: 'reconstructed-from-frozen-preparation', entries: contexts },
  'entries',
)
const boundaryParts = boundaryPatches
  ? await retainFixturePartitions(store, { entries: boundaryPatches }, 'entries')
  : []
const manifest = {
  ...original,
  attempt: checks.some(check => check.failed && check.consequence === 'block-ingestion')
    ? {
        ...original.attempt,
        id: `recheck:${original.attempt.id}`,
        status: 'failed' as const,
      }
    : { ...original.attempt, status: 'completed' as const },
  guards: [
    ...original.guards.filter(
      g =>
        g.id !== 'prepared-name-references' && !checks.some(next => next.id === g.id),
    ),
    ...checks,
  ],
  bulk: original.bulk.map(rule =>
    rule.id === edition.id
      ? {
          ...rule,
          fixtures: [
            ...rule.fixtures.filter(
              f => !['name-alias-results', 'boundary-patch-results'].includes(f.type),
            ),
            ...boundaryParts.map(({ object }) => ({
              type: 'boundary-patch-results',
              object,
            })),
            ...nameParts.map(({ object }) => ({
              type: 'name-alias-results',
              object,
            })),
          ],
        }
      : rule,
  ),
}
validateAuditManifest(manifest)
const ref = await retainObject(store, manifest)
await mkdir(outputPath, { recursive: true })
const report = {
  release: archive.releaseCode,
  resourceReleaseId: release.id,
  previous: existing,
  next: ref,
  evidenceBasis: 'reconstructed-from-frozen-preparation',
  aliasRules: contexts,
  guards: checks,
}
await writeFile(resolve(outputPath, 'report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify({ ...report, branches: undefined }, null, 2))
if (apply) {
  const current = db
    .query(
      "SELECT manifestHash FROM processingAudits WHERE resourceReleaseId = ? AND stage = 'preparation' AND ownerId = ?",
    )
    .get(release.id, release.id) as { manifestHash: string }
  if (current.manifestHash !== existing.hash)
    throw Error('Audit changed during reconstruction.')
  const staged = stageLocalLineageObjects()
  try {
    await transferProcessingResult(store, staged.store, ref)
    await staged.deliver()
    await transferProcessingResult(store, retained, ref)
    const q = (value: string) => `'${value.replaceAll("'", "''")}'`
    await writeFile(
      resolve(outputPath, 'rollback.sql'),
      `UPDATE processingAudits SET manifestHash=${q(existing.hash)}, byteLength=${existing.byteLength} WHERE resourceReleaseId=${q(release.id)} AND stage='preparation' AND ownerId=${q(release.id)} AND manifestHash=${q(ref.hash)};\n`,
    )
    const updated = db
      .query(
        "UPDATE processingAudits SET manifestHash=?, byteLength=? WHERE resourceReleaseId=? AND stage='preparation' AND ownerId=? AND manifestHash=? AND byteLength=?",
      )
      .run(
        ref.hash,
        ref.byteLength,
        release.id,
        release.id,
        existing.hash,
        existing.byteLength,
      )
    if (updated.changes !== 1) throw Error('Audit changed during registration.')
    const deliveryPath = resolve(
      root,
      '.local/curated-divisions/audits/dev',
      release.id,
      'stage-audits.json',
    )
    const delivery = JSON.parse(await readFile(deliveryPath, 'utf8'))
    await writeFile(
      resolve(outputPath, 'previous-stage-audits.json'),
      JSON.stringify(delivery),
    )
    delivery.refs = delivery.refs.map((value: ObjectRef) =>
      value.hash === existing.hash ? ref : value,
    )
    await writeFile(`${deliveryPath}.tmp`, JSON.stringify(delivery))
    await rename(`${deliveryPath}.tmp`, deliveryPath)
  } finally {
    await staged.dispose()
  }
  console.log('Registered preparation audit.')
}
db.close()
