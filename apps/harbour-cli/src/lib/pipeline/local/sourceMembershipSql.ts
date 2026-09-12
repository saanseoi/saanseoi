const quote = (value: string) => `'${value.replaceAll("'", "''")}'`

/** Disjoint indexed ranges keep complete membership comparisons below SQL limits. */
export function missingSourceMembershipPredicates(sourceRecordIds: string[]) {
  const ids = [...new Set(sourceRecordIds)].sort((a, b) =>
    Buffer.compare(Buffer.from(a), Buffer.from(b)),
  )
  if (!ids.length) return ['1 = 1']
  const predicates: string[] = []
  for (let offset = 0; offset < ids.length; offset += 96) {
    const batch = ids.slice(offset, offset + 96)
    const next = ids[offset + 96]
    const first = batch[0]
    if (first === undefined) throw new Error('Empty source membership range')
    predicates.push(
      [
        ...(offset ? [`sourceRecordId >= ${quote(first)}`] : []),
        ...(next === undefined ? [] : [`sourceRecordId < ${quote(next)}`]),
        `sourceRecordId NOT IN (${batch.map(quote).join(',')})`,
      ].join(' AND '),
    )
  }
  return predicates
}
