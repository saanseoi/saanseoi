import type { CuratedSourceRelease } from './archiveInput'

export function monthlyCutoff(edition: string) {
  if (!/^\d{4}-\d{2}-01\.\d+$/.test(edition))
    throw new Error('SaanSeoi editions must use YYYY-MM-01.revision.')
  const date = edition.slice(0, 10)
  if (new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)
    throw new Error('Invalid SaanSeoi edition date.')
  return date
}

/** Resolve publisher inputs for explicit review and retain their pins in the archive. */
export function selectMonthlyIngredient(
  edition: string,
  datasetCode: string,
  candidates: CuratedSourceRelease[],
) {
  const cutoff = monthlyCutoff(edition)
  const eligible = candidates
    .filter(
      candidate =>
        candidate.datasetCode === datasetCode &&
        /^\d{4}-\d{2}-\d{2}(?:\.\d+)?$/.test(candidate.sourceVersion) &&
        candidate.sourceVersion.slice(0, 10) <= cutoff,
    )
    .sort((a, b) =>
      b.sourceVersion.localeCompare(a.sourceVersion, 'en', { numeric: true }),
    )
  const selected = eligible[0]
  if (!selected)
    throw new Error(`No retained ${datasetCode} release on or before ${cutoff}.`)
  if (
    eligible.some(
      candidate =>
        candidate.sourceVersion === selected.sourceVersion &&
        (candidate.releaseCode !== selected.releaseCode ||
          candidate.contentHash !== selected.contentHash),
    )
  )
    throw new Error(`Ambiguous ingredient ${datasetCode}/${selected.sourceVersion}.`)
  return selected
}

/** Publication inputs can advance without changing the editor's reference cohort. */
export function selectMonthlyIngredients(
  edition: string,
  review: CuratedSourceRelease[],
  publication: CuratedSourceRelease[],
) {
  const candidates = [...review, ...publication]
  return [...new Set(review.map(row => row.datasetCode))].map(dataset =>
    selectMonthlyIngredient(edition, dataset, candidates),
  )
}
