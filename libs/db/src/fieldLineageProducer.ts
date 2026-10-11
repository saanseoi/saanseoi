import type {
  FieldRef,
  LineageDefinition,
  Node,
  ReleaseBinding,
} from './fieldLineageTypes'

export type ProducerSpecification = {
  inputs: string[]
  implementation: { path: string; symbol: string }
  expression: string
  steps?: string[]
  guards?: string[]
  additionalImplementations?: Array<{ path: string; symbol: string }>
  layer?: Node['layer']
  audit?: Node['audit']
  reads?: Record<
    string,
    {
      stage: 'raw' | 'canonical' | 'audit' | 'registry' | 'request'
      collection: string
      path: string
      role?: FieldRef['role']
      dependency?: string
    }
  >
  [key: string]: unknown
}

/** A companion is owned by the captured producer release, never by a current/latest read. */
export function producerDependencyScope(
  definition: LineageDefinition,
  binding: ReleaseBinding,
  owner: string,
  role: string,
  ownerSnapshotIds: string[],
) {
  const id = `${owner}-dependency-${role}`
  if (!definition.scopes.some(scope => scope.id === id)) {
    definition.scopes.push({
      id,
      kind: 'upstream-lineage',
      bindingRole: `${owner}/dependencies/${role}`,
    })
    const source = binding.scopes.find(scope => scope.scopeId === owner)
    if (!source) throw new Error(`Missing dependency owner ${owner}`)
    binding.scopes.push({
      ...source,
      scopeId: id,
      dependency: {
        ownerScopeId: owner,
        ownerSnapshotIds: [...new Set(ownerSnapshotIds)].sort(),
        role,
      },
    })
  }
  return id
}

/** Resolve a companion from immutable owner metadata; never infer a latest snapshot. */
export async function resolveFieldLineageDependency(
  binding: ReleaseBinding,
  scopeId: string,
  ownerSnapshotId: string,
  readDependencies: (snapshotId: string) => Promise<Record<string, string | undefined>>,
) {
  const dependency = binding.scopes.find(scope => scope.scopeId === scopeId)?.dependency
  if (!dependency?.ownerSnapshotIds.includes(ownerSnapshotId))
    throw new Error('Dependency owner is outside the selected lineage release.')
  const selected = (await readDependencies(ownerSnapshotId))[dependency.role]
  if (!selected)
    throw new Error(
      `Missing exact ${dependency.role} dependency for ${ownerSnapshotId}`,
    )
  return selected
}
