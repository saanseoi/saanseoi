/** Retain the polygons actually emitted by a drawing or source-replacement patch. */
type Row = Record<string, any>
export type BoundaryPatchEvidence = {
  id: string
  divisionId: string
  kind: 'drawing' | 'source'
  geometry: Row
  sourceRecordIds: string[]
}
export function boundaryPatchEvidence(
  definitions: Row,
  areas: Row[],
  aliases: Record<string, string> = {},
): BoundaryPatchEvidence[] {
  const rejected = new Set(
    (definitions.exclusions?.islandDecisions ?? [])
      .filter((row: Row) => row.decision === 'rejected')
      .map((row: Row) => row.id),
  )
  const drawings = new Set(
    (definitions.geometry?.features ?? []).map(
      (row: Row) => row.properties?.divisionId,
    ),
  )
  const corrections = new Set(
    (definitions.selections?.corrections ?? [])
      .filter(
        (row: Row) =>
          row.action === 'geometry-correction' &&
          !row.reviewRequired &&
          row.operation === 'use-named-basemap-geometry',
      )
      .map((row: Row) => row.id),
  )
  return areas.flatMap(area => {
    const sources =
      typeof area.sources === 'string' ? JSON.parse(area.sources) : area.sources
    const geometry =
      typeof area.geometry === 'string' ? JSON.parse(area.geometry) : area.geometry
    return (sources?.saanseoi ?? []).flatMap((source: Row): BoundaryPatchEvidence[] => {
      const curation = source.curation ?? source.dataset
      const identities = [...rejected].filter(
        id =>
          id === source.recordId ||
          (aliases[String(id)] === area.divisionId &&
            source.recordId === area.divisionId),
      )
      return identities.flatMap((id): BoundaryPatchEvidence[] => {
        const kind =
          curation === 'division-geometry' && drawings.has(source.recordId)
            ? 'drawing'
            : curation === 'island-areas' && corrections.has(id)
              ? 'source'
              : null
        return kind
          ? [
              {
                id: String(id),
                divisionId: area.divisionId,
                kind,
                geometry,
                sourceRecordIds: (sources.protomaps ?? [])
                  .map((row: Row) => row.recordId ?? row.record_id)
                  .filter((id: unknown): id is string => typeof id === 'string'),
              },
            ]
          : []
      })
    })
  })
}
