import type { AuditManifest } from './auditTypes'
import type { ProvenanceStore } from './types'
import { readObject } from './objects'
import { buildAuditPageIndex } from './auditPageIndex'
import { loadAuditFixtures } from './auditFixtureRows'
import { auditFixtureCatalogue } from './auditFixtureCatalogue'
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
) {
  return auditFixtureCatalogue(
    await fixtureGroups(store, manifest, releaseCode),
    releaseCode,
  )
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
