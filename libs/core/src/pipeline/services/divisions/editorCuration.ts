import type { SaanseoiEstimatedAreas, ReviewArea } from './geographicReview'
export type EditorProject = {
  schemaVersion: number
  purpose: string
  entries: Array<{ divisionId: string; [key: string]: unknown }>
}
export const editorProjectPurpose =
  'Local editor cache for working baselines, cleanup stages and recovery history. Optional, ignored by Git and not an ingestion input.'

const authoredKeys = new Set(['geometryOriginalDrawing', 'geometryPencilLinework'])

/** Keep irreplaceable drawing inputs with geometry; derived recovery state is local. */
export function exportReviewCuration(
  current: SaanseoiEstimatedAreas,
  baseline: Record<string, unknown>,
  previousProject: EditorProject,
) {
  const project = new Map(
    previousProject.entries.map(row => [row.divisionId, structuredClone(row)]),
  )
  const split = (input: ReviewArea) => {
    const feature = structuredClone(input)
    const id = feature.properties.divisionId
    const state: EditorProject['entries'][number] = { divisionId: id }
    for (const key of Object.keys(feature.properties))
      if (key.startsWith('geometry') && !authoredKeys.has(key)) {
        state[key] = feature.properties[key]
        delete feature.properties[key]
      }
    if (
      JSON.stringify(feature.properties.geometryOriginalDrawing) ===
      JSON.stringify(feature.geometry)
    )
      delete feature.properties.geometryOriginalDrawing
    delete feature.properties.name
    if (Object.keys(state).length > 1) project.set(id, state)
    return feature
  }
  const geometry: Record<string, unknown> = {
    ...structuredClone(baseline),
    ...structuredClone(current),
    purpose: baseline.purpose,
    features: current.features.map(split),
    ...(current.withheld
      ? {
          withheld: current.withheld.map(row => ({
            ...row,
            feature: split(row.feature),
          })),
        }
      : {}),
  }
  for (const key of ['points', 'bounds', 'islandSelections', 'islandCorrections'])
    delete geometry[key]
  delete geometry.cohort
  delete geometry.releaseSet
  delete geometry.referenceRecovery
  return {
    geometry,
    project: {
      schemaVersion: 1,
      purpose: editorProjectPurpose,
      entries: [...project.values()].sort((a, b) =>
        a.divisionId.localeCompare(b.divisionId),
      ),
    },
  }
}

export function restoreEditorProject<
  T extends {
    features: ReviewArea[]
    withheld?: Array<{ feature: ReviewArea; reason: string }>
  },
>(
  geometry: T,
  project: EditorProject = {
    schemaVersion: 1,
    purpose: editorProjectPurpose,
    entries: [],
  },
): T {
  const result = structuredClone(geometry)
  const entries = new Map(project.entries.map(row => [row.divisionId, row]))
  for (const feature of [
    ...result.features,
    ...(result.withheld ?? []).map(row => row.feature),
  ]) {
    feature.properties = {
      ...entries.get(feature.properties.divisionId),
      ...feature.properties,
    }
    feature.properties.geometryOriginalDrawing ??= structuredClone(feature.geometry)
  }
  return result
}
