import type { RegistryPublisher } from '#lib/registry/types.js'

export type PublisherDirectoryItem = RegistryPublisher & {
  isInstitution: boolean
  sourceCount: number
}

export type PublisherDatasetFact = {
  label: string
  value: string
  description?: string
  href?: string
  title?: string
}
