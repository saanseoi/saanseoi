import type { HkgovAlsCurationApplication } from './hkgovAlsCurationLifecycle'
import type { HkgovAlsFeature } from './hkgovAlsTypes'
export type ReviewedPremiseRetention = {
  id: string
  authority: string
  sourceFile: string
  curationFile?: string
  csus: string[]
  premiseSelectors?: unknown[][]
  coalesce?: boolean
  canonicalId: string
  sharedProvisionalId?: string
  sourceVersionFrom?: string
  retain: boolean
  role?: string
  parentRule?: string
  publisherTower?: { estate: string; name: string; section: string; number: string }
  application?: HkgovAlsCurationApplication
  assertions: { version: string; hashes: string[] }[]
  evidence: { sourceVersion: string; feature: HkgovAlsFeature }
  externalEvidence?: unknown
  patch: {
    enName?: string | null
    zhName?: string | null
    blockNumber?: string | null
    blockDescriptor?: string
    zhBlockDescriptor?: string
    granularity?: 'complex' | 'phase' | 'building' | 'section' | 'unit' | 'unknown'
    streetNumberFrom?: string
    streetNumberTo?: string
    enEstate?: string | null
    zhEstate?: string | null
    clearPhase?: boolean
    clearVillageNumber?: boolean
    clearVillage?: boolean
    enStreet?: string
    zhStreet?: string
    enPhaseName?: string | null
    zhPhaseName?: string | null
    preserveStructure?: boolean
    coordinates?: number[]
  }
}
