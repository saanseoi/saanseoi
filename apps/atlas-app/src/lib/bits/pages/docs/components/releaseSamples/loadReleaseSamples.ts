import {
  getUniqueAddressSamples,
  type AddressSample,
} from './releaseSamplesPresentation'

/** Seek hash-prefixed IDs within their namespace as well as bare UUIDs. */
export async function loadAddressSample(
  fetchAfter: (after: string) => Promise<unknown[]>,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted()
  let candidates = await fetchAfter(crypto.randomUUID())
  signal?.throwIfAborted()
  if (!candidates.length) candidates = await fetchAfter('')
  signal?.throwIfAborted()
  const first = candidates[0] as { id?: unknown } | undefined
  const prefix =
    typeof first?.id === 'string'
      ? /^(.*-)[0-9a-f]{32,}$/.exec(first.id)?.[1]
      : undefined
  if (!prefix) return candidates
  const pivot = prefix + crypto.randomUUID().replaceAll('-', '')
  const selected = await fetchAfter(pivot)
  signal?.throwIfAborted()
  return selected.length ? selected : fetchAfter(prefix)
}

/** Fetch only missing examples, sharing deduplication and bounded retries. */
export async function loadReleaseSamples(
  existing: AddressSample[],
  count: number,
  fetchCandidates: (count: number) => Promise<unknown[]>,
  signal?: AbortSignal,
) {
  const selected: AddressSample[] = []
  for (let attempt = 0; attempt < 4 && selected.length < count; attempt++) {
    signal?.throwIfAborted()
    const candidates = await fetchCandidates(count - selected.length)
    signal?.throwIfAborted()
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
