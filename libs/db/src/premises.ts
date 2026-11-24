/** Retained vocabulary for source curation and the future building/place model, outside address content. */
/** Whole-premises organisation, independent of address depth or imported children. */
export const premisesTypes = ['site', 'complex'] as const
/** Evidenced premises purpose, independent of site/complex organisation. */
export const premisesKinds = [
  'estate',
  'mall',
  'office',
  'hotel',
  'school',
  'university',
  'hospital',
  'airport',
  'railway',
  'bus',
  'ferry',
  'industrial',
  'logistics',
  'depot',
  'park',
  'sports',
  'religious',
  'cemetery',
  'government',
] as const
