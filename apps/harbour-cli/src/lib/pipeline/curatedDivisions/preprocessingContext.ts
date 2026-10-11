import type { CuratedSourceRelease } from './archiveInput'
type Row = Record<string, any>
/** The comparison record is one ingredient, not the complete set of contributing inputs. */
export function preprocessingContext(
  output: Row,
  source: Row | undefined,
  pin?: CuratedSourceRelease,
) {
  if (source && !pin) throw Error(`Missing comparison source pin: ${output.id}`)
  return {
    id: output.id as string,
    comparison: source
      ? {
          kind: 'overture',
          datasetCode: pin!.datasetCode,
          releaseCode: pin!.releaseCode,
          contentHash: pin!.contentHash,
          recordId: source.id,
        }
      : { kind: 'combined-inputs' },
    inputs:
      typeof output.sources === 'string'
        ? JSON.parse(output.sources)
        : (output.sources ?? {}),
    ...(source ? { publisherHierarchy: source.hierarchies ?? null } : {}),
  }
}
