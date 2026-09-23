/** Counts describe this phase, not SQL mutations or the total published snapshot. */
export type DatasetProcessingStats = {
  resourceType: string
  sourceRows: number | null
  processedRows: number | null
}
