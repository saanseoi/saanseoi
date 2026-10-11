type Row = Record<string, any>
export type EditorialEvent = {
  divisionId: string
  field: string
  status: string
}

/** Editorial retention is a SaanSeoi assertion, not a dependency on a deleted input. */
export function applyEditorialOwnership(
  divisions: Row[],
  areas: Row[],
  events: EditorialEvent[],
) {
  const kept = new Set(
    events
      .filter(e => e.field === '$record' && e.status === 'keep')
      .map(e => e.divisionId),
  )
  for (const row of [...divisions, ...areas]) {
    const area = row.divisionId != null
    const id = area ? row.divisionId : row.id
    const fields = kept.has(id)
      ? area
        ? ['geometry']
        : ['identity', 'names', 'classification', 'hierarchy', 'geometry']
      : area
        ? []
        : events
            .filter(
              e =>
                e.divisionId === id &&
                e.field.startsWith('names.') &&
                ['keep', 'restored'].includes(e.status),
            )
            .map(e => e.field)
    if (!fields.length) continue
    const sources =
      typeof row.sources === 'string'
        ? JSON.parse(row.sources)
        : structuredClone(row.sources ?? {})
    if (kept.has(id)) delete sources.overture
    sources.saanseoi = [
      ...(sources.saanseoi ?? []).filter(
        (source: Row) =>
          source.curation !== 'division-update-policy' &&
          !(
            source.curation === 'division-names' &&
            !kept.has(id) &&
            source.contributions?.every((field: string) => fields.includes(field))
          ) &&
          (!kept.has(id) ||
            !['division-additions', 'division-identity-matches'].includes(
              source.curation,
            )),
      ),
      {
        dataset: 'ds-hk-saanseoi-division',
        recordId: row.id,
        curation: kept.has(id)
          ? 'division-additions'
          : events.some(
                e =>
                  e.divisionId === id &&
                  e.field.startsWith('names.') &&
                  e.status === 'keep',
              )
            ? 'division-names'
            : 'division-update-policy',
        contributions: [...new Set(fields)].sort(),
      },
    ]
    row.sources = sources
  }
}
