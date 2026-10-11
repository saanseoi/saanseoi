import type { DivisionHierarchyEntry } from '../../../../../db/src/divisionTaxonomy'
import type { HierarchyPatch } from './geographicReview'
import type { HierarchyCatalogue, CompactReviewInventory } from './reviewInventory'

type References = CompactReviewInventory['divisions'][number]['hierarchies']
export type CompactHierarchyPatch = Omit<
  HierarchyPatch,
  'schemaVersion' | 'entries'
> & {
  schemaVersion: 2
  entries: Array<
    Omit<HierarchyPatch['entries'][number], 'hierarchies'> & {
      hierarchies: References
    }
  >
}

// Web Crypto keeps the editor exporter usable without Node dependencies.
async function pathIdentity(ids: string[]) {
  const namespace = '7a3c5e9195c25c938e3c7d5b5d3bb6e7'
  const name = new TextEncoder().encode(`hierarchy:${JSON.stringify(ids)}`)
  const input = new Uint8Array(16 + name.length)
  for (let i = 0; i < 16; i++)
    input[i] = parseInt(namespace.slice(i * 2, i * 2 + 2), 16)
  input.set(name, 16)
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-1', input)).slice(0, 16)
  bytes[6] = (bytes[6]! & 15) | 80
  bytes[8] = (bytes[8]! & 63) | 128
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Preserve inventory paths while adding the derived patch's paths. */
export async function compactHierarchyPatch(
  patch: HierarchyPatch,
  seed: HierarchyCatalogue,
) {
  const catalogue = structuredClone(seed)
  if (catalogue.schemaVersion !== 1)
    throw new Error('Unsupported hierarchy catalogue schema.')
  const identities = new Map<string, string>()
  const entries: CompactHierarchyPatch['entries'] = []
  for (const { hierarchies, ...entry } of patch.entries) {
    const references: References = {}
    for (const [category, paths] of Object.entries(hierarchies)) {
      references[category] = []
      for (const path of paths!) {
        const ids = path.map(node => node.id)
        const key = JSON.stringify(ids)
        const id = identities.get(key) ?? (await pathIdentity(ids))
        identities.set(key, id)
        if (catalogue.paths[id] && JSON.stringify(catalogue.paths[id]) !== key)
          throw new Error(`Conflicting hierarchy path: ${id}`)
        catalogue.paths[id] = ids
        const evidence: Record<
          string,
          Pick<DivisionHierarchyEntry, 'full_containment' | 'containment_geometry'>
        > = {}
        for (const { id: nodeId, name, class: cls, ...annotation } of path) {
          const previous = catalogue.nodes[nodeId]
          if (previous && (previous.name !== name || previous.class !== cls))
            throw new Error(`Conflicting hierarchy node: ${nodeId}`)
          catalogue.nodes[nodeId] = { name, class: cls }
          if (Object.keys(annotation).length) evidence[nodeId] = annotation
        }
        references[category]!.push({
          path: id,
          ...(Object.keys(evidence).length ? { evidence } : {}),
        })
      }
    }
    entries.push({ ...entry, hierarchies: references })
  }
  const compact: CompactHierarchyPatch = { ...patch, schemaVersion: 2, entries }
  // Validate before exporting a pair of fixtures.
  expandHierarchyPatch(compact, catalogue)
  return { patch: compact, catalogue }
}

export function expandHierarchyPatch(
  patch: CompactHierarchyPatch,
  catalogue: HierarchyCatalogue,
): HierarchyPatch {
  if (patch.schemaVersion !== 2 || catalogue.schemaVersion !== 1)
    throw new Error('Unsupported hierarchy patch or catalogue schema.')
  const known = new Set(patch.entries.map(entry => entry.divisionId))
  if (known.size !== patch.entries.length)
    throw new Error('Duplicate hierarchy decision.')
  return {
    ...patch,
    schemaVersion: 1,
    entries: patch.entries.map(entry => {
      const hierarchies = Object.fromEntries(
        Object.entries(entry.hierarchies).map(([category, references]) => [
          category,
          references.map(reference => {
            const ids = catalogue.paths[reference.path]
            if (
              !ids ||
              new Set(ids).size !== ids.length ||
              ids.includes(entry.divisionId)
            )
              throw new Error(`Invalid hierarchy path: ${reference.path}`)
            for (const id of Object.keys(reference.evidence ?? {}))
              if (!ids.includes(id))
                throw new Error(`Evidence outside hierarchy path: ${id}`)
            return ids.map(id => {
              const node = catalogue.nodes[id]
              if (!node || !known.has(id))
                throw new Error(`Unknown hierarchy ancestor: ${id}`)
              return { id, ...node, ...reference.evidence?.[id] }
            })
          }),
        ]),
      )
      if (!hierarchies.full)
        throw new Error(`Missing full hierarchy: ${entry.divisionId}`)
      return {
        ...entry,
        hierarchies: hierarchies as HierarchyPatch['entries'][number]['hierarchies'],
      }
    }),
  }
}
