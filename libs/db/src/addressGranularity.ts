/** Scope of the address, independent of validity, verification and Place category. */
export const addressGranularities = [
  'unknown',
  'site',
  'complex',
  'phase',
  'building',
  'section',
  'floor',
  'unit',
  'room',
  'room_part',
] as const

export type AddressGranularity = (typeof addressGranularities)[number]
