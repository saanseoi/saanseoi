export type UploadResult = {
  datasetCode?: string
  datasetId?: string
  rawObjectKey?: string
  releaseCode?: string
  releaseId?: string
}

export type UploadPlan = {
  cohortKey: string
  regionCode: 'hk' | 'mo'
  releaseCode: string
  rowCount: number
  source: string
  sourceVersion: string
  theme: 'addresses'
  resourceType: 'address'
}

export type ChunkRange = {
  rowEnd: number
  rowStart: number
}
