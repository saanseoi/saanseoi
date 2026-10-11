const stageOrder = ['preparation', 'ingestion', 'assembly', 'composition']
const resourceOrder = ['division', 'divisionArea', 'divisionBoundary']

const rank = (order: string[], value: string) => {
  const index = order.indexOf(value)
  return index < 0 ? order.length : index
}

export const auditResourceTypes = (resources: { resourceType: string }[]) =>
  [...new Set(resources.map(resource => resource.resourceType))].sort(
    (a, b) => rank(resourceOrder, a) - rank(resourceOrder, b),
  )

/** Keep pipeline stages together and companion resources after their main resource. */
export function groupAuditStages<
  T extends {
    resourceType: string
    manifest: { scope: { stage: string } }
  },
>(resources: T[]) {
  const ids = [...new Set(resources.map(resource => resource.manifest.scope.stage))]
  return ids
    .sort((a, b) => rank(stageOrder, a) - rank(stageOrder, b))
    .map(id => ({
      id,
      resources: resources
        .filter(resource => resource.manifest.scope.stage === id)
        .sort(
          (a, b) =>
            rank(resourceOrder, a.resourceType) - rank(resourceOrder, b.resourceType),
        ),
    }))
}

export function auditStageEntries<T extends { resourceType: string; hash: string }>(
  stage: { id: string; resources: T[] },
  resourceTypes: string[],
) {
  return resourceTypes.flatMap(resourceType => {
    const matches = stage.resources.filter(
      resource => resource.resourceType === resourceType,
    )
    return matches.length
      ? matches.map(resource => ({
          key: resource.hash,
          resourceType,
          resource: resource as T | undefined,
        }))
      : [
          {
            key: `${stage.id}-${resourceType}`,
            resourceType,
            resource: undefined as T | undefined,
          },
        ]
  })
}
