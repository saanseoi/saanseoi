import type { CuratedSourceRelease } from '../../apps/harbour-cli/src/lib/pipeline/curatedDivisions/archiveInput'

/** Advance each editor dataset to its newest pinned release, keeping companion resources together. */
export function selectLatestEditorInputs(
  required: CuratedSourceRelease[],
  additional: CuratedSourceRelease[],
): CuratedSourceRelease[] {
  const candidates = [...required, ...additional]
  return required.map(resource => {
    const dataset = candidates
      .filter(pin => pin.datasetCode === resource.datasetCode)
      .sort((a, b) =>
        b.sourceVersion.localeCompare(a.sourceVersion, 'en', { numeric: true }),
      )
    const version = dataset[0]!.sourceVersion
    const matches = dataset.filter(
      pin =>
        pin.sourceVersion === version && pin.resourceType === resource.resourceType,
    )
    const selected = matches[0]
    if (!selected)
      throw new Error(
        `Latest editor input ${resource.datasetCode}/${version} is missing ${resource.resourceType}.`,
      )
    if (
      matches.some(
        pin =>
          pin.releaseCode !== selected.releaseCode ||
          pin.contentHash !== selected.contentHash,
      )
    )
      throw new Error(
        `Ambiguous editor input ${resource.datasetCode}/${version}/${resource.resourceType}.`,
      )
    return selected
  })
}
