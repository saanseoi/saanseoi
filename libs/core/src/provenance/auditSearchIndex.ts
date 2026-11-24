import type { AuditManifest } from './auditTypes'
import type { ProvenanceStore } from './types'
import { readObject } from './objects'
import { buildAuditPageIndex } from './auditPageIndex'
import { loadAuditFixtures } from './auditFixtureRows'
import { largeAuditFixture, readPartitionedFixture } from './auditPartitionReader'
import { auditFixtureCatalogue, type FixtureCatalogue } from './auditFixtureCatalogue'
import { alsAuditDecisions } from './auditAlsDecisions'

/** Derived audit presentation exists only in read-side memory. */
async function fixtureGroups(
  store: ProvenanceStore,
  manifest: AuditManifest,
  releaseCode?: string,
) {
  return loadAuditFixtures(
    manifest.bulk,
    async (id, index) => {
      const fixture = manifest.bulk.find(b => b.id === id)?.fixtures[index]
      if (!fixture) throw new Error('Fixture is not declared by this release.')
      return readObject(store, fixture.object)
    },
    () => true,
    releaseCode,
  )
}

export const readAuditPageIndex = buildAuditPageIndex

export async function readAuditFixtureCatalogue(
  store: ProvenanceStore,
  manifest: AuditManifest,
  releaseCode: string,
  query = '',
) {
  const result: FixtureCatalogue = { groups: {}, als: [] }
  for (const bulk of manifest.bulk) {
    const largeTypes = new Set<string>()
    for (const type of new Set(bulk.fixtures.map(f => f.type))) {
      const refs = bulk.fixtures.filter(f => f.type === type).map(f => f.object)
      if (!largeAuditFixture(refs)) continue
      const first = await readObject(store, refs[0]!)
      if (
        first &&
        typeof first === 'object' &&
        !Array.isArray(first) &&
        first.auditPartition
      )
        largeTypes.add(type)
    }
    // Related curation tables still share their enrichment context.
    const small = {
      ...bulk,
      fixtures: bulk.fixtures.filter(f => !largeTypes.has(f.type)),
    }
    const catalogue = auditFixtureCatalogue(
      await fixtureGroups(store, { ...manifest, bulk: [small] }, releaseCode),
      releaseCode,
    )
    Object.assign(result.groups, catalogue.groups)
    result.als.push(...catalogue.als)
    for (const type of largeTypes) {
      const refs = bulk.fixtures.filter(f => f.type === type).map(f => f.object)
      const { group } = await readPartitionedFixture(store, refs, query)
      const groups = result.groups[bulk.id] ?? {}
      groups[type] = group
      result.groups[bulk.id] = groups
    }
  }
  return result
}

export async function readAuditAlsDecisions(
  store: ProvenanceStore,
  manifest: AuditManifest,
  releaseCode: string,
  ids: string[],
) {
  const groups = await fixtureGroups(store, manifest)
  const selected = new Set(ids)
  return alsAuditDecisions(groups['curate-als-addresses'] ?? {}, releaseCode).filter(
    row => selected.has(row.id),
  )
}
