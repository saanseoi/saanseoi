import {
  deriveHierarchyPatch,
  type ReviewInventory,
  type ReviewArea,
  type SaanseoiEstimatedAreas,
} from '../../../../../libs/core/src/pipeline/services/divisions/geographicReview'

self.onmessage = (
  event: MessageEvent<{
    inventory: ReviewInventory
    reference: ReviewArea[]
    areas: SaanseoiEstimatedAreas
    retainProvisional: boolean
  }>,
) => {
  try {
    const { inventory, reference, areas, retainProvisional } = event.data
    self.postMessage({
      patch: deriveHierarchyPatch(inventory, reference, areas, retainProvisional),
    })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) })
  }
}
