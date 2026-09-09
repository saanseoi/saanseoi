import {
  getUniqueAddressSamples,
  type AddressSample,
} from './releaseSamplesPresentation'

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
