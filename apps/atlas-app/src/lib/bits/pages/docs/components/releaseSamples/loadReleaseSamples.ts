import {
  getUniqueAddressSamples,
  type AddressSample,
} from './releaseSamplesPresentation'

/** Seek hash-prefixed IDs within their namespace as well as bare UUIDs. */
export async function loadAddressSample(
  fetchAfter: (after: string) => Promise<unknown[]>,
) {
  let candidates = await fetchAfter(crypto.randomUUID())
  if (!candidates.length) candidates = await fetchAfter('')
  const first = candidates[0] as { id?: unknown } | undefined
  const prefix =
    typeof first?.id === 'string'
      ? /^(.*-)[0-9a-f]{32,}$/.exec(first.id)?.[1]
      : undefined
  if (!prefix) return candidates
  const pivot = prefix + crypto.randomUUID().replaceAll('-', '')
  const selected = await fetchAfter(pivot)
  return selected.length ? selected : fetchAfter(prefix)
}

/** Fetch only missing examples, sharing deduplication and bounded retries. */
export async function loadReleaseSamples(
  existing: AddressSample[],
  count: number,
  fetchCandidates: (count: number) => Promise<unknown[]>,
) {
  const selected: AddressSample[] = []
  for (let attempt = 0; attempt < 4 && selected.length < count; attempt++) {
    const candidates = await fetchCandidates(count - selected.length)
    if (!candidates.length) break
    selected.push(
      ...getUniqueAddressSamples(candidates, [...existing, ...selected]).slice(
        0,
        count - selected.length,
      ),
    )
  }
  return selected
}
