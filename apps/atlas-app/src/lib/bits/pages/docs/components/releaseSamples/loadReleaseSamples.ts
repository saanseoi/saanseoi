import {
  getUniqueAddressSamples,
  type AddressSample,
} from './releaseSamplesPresentation'

/**
 * Seeks a sample within the returned identifier namespace and format.
 * @param fetchAfter Fetches the first record after an exclusive identifier pivot.
 * @param signal Optional cancellation signal for navigation.
 * @returns Sample candidates, wrapping once when the pivot exceeds the namespace.
 */
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
  const namespace =
    typeof first?.id === 'string'
      ? /^(.+-)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32,})$/i.exec(
          first.id,
        )
      : undefined
  const prefix = namespace?.[1]
  const suffix = namespace?.[2]
  if (!prefix || !suffix) return candidates
  // Match the stored suffix format so UUID namespaces do not repeat their first row.
  const random = crypto.randomUUID()
  const pivot = prefix + (suffix.includes('-') ? random : random.replaceAll('-', ''))
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
