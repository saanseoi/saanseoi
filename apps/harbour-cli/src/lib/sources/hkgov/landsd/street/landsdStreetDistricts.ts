/**
 * LandsD sometimes reports an island name and sometimes groups multiple
 * District Council districts. Keep the publisher text, but resolve it through
 * the current canonical-division names so this bridge never embeds unstable
 * canonical IDs.
 */
export const LANDSD_STREET_DISTRICT_BRIDGE_VERSION = '2026-08-20.1'

export type LandsdStreetCanonicalDistrict = {
  id: string
  names: {
    en?: string | null
    zhHant?: string | null
    alternatives?: string[]
  }
}

export type LandsdStreetDistrictResolution = {
  districtIds: string[]
  unmatched: string[]
}

/**
 * The gazetted baseline uses compact publisher district codes.  These are
 * labels, not canonical identifiers: they are translated through the same
 * live division-name index as notice-page district text.
 */
const districtCodeNames: Record<string, string> = {
  'c&w': 'central and western',
  e: 'eastern',
  i: 'islands',
  is: 'islands',
  'k&t': 'kwai tsing',
  kc: 'kowloon city',
  kt: 'kwun tong',
  n: 'north',
  s: 'southern',
  sk: 'sai kung',
  ssp: 'sham shui po',
  st: 'sha tin',
  tm: 'tuen mun',
  tp: 'tai po',
  tw: 'tsuen wan',
  'w.c.': 'wan chai',
  wc: 'wan chai',
  wts: 'wong tai sin',
  yl: 'yuen long',
  ytm: 'yau tsim mong',
}

const aliases: Record<string, string[]> = {
  'central and western': ['central & western', 'central western', '中西區'],
  'wan chai': ['灣仔', 'wan chai district', '灣仔區'],
  eastern: ['eastern district', '東區'],
  southern: ['southern district', '南區'],
  islands: [
    'islands district',
    'islands lantau',
    'island peng chau',
    'lantau',
    'peng chau',
    '離島',
    '離島區',
  ],
  'yau tsim mong': ['yau tsim mong district', '油尖旺', '油尖旺區'],
  'sham shui po': ['sham shui po district', '深水埗', '深水埗區'],
  'kowloon city': ['kowloon city district', '九龍城', '九龍城區'],
  'wong tai sin': ['wong tai sin district', '黃大仙', '黃大仙區'],
  'kwun tong': ['kwun tong district', '觀塘', '觀塘區'],
  'tsuen wan': ['tsuen wan district', '荃灣', '荃灣區'],
  'tuen mun': ['tuen mun district', '屯門', '屯門區'],
  'yuen long': ['yuen long district', '元朗', '元朗區'],
  north: ['north district', '北區'],
  'tai po': ['tai po district', '大埔', '大埔區'],
  'sha tin': ['sha tin district', '沙田', '沙田區'],
  'sai kung': ['sai kung district', '西貢', '西貢區'],
}

/** Build a name/alias index from the canonical division snapshot. */
export function buildLandsdStreetDistrictIndex(
  districts: LandsdStreetCanonicalDistrict[],
) {
  const index = new Map<string, string>()
  for (const district of districts) {
    for (const name of [
      district.names.en,
      district.names.zhHant,
      ...(district.names.alternatives ?? []),
    ]) {
      if (name) index.set(normaliseDistrictToken(name), district.id)
    }
  }

  for (const [canonicalName, aliasValues] of Object.entries(aliases)) {
    const districtId = index.get(normaliseDistrictToken(canonicalName))
    if (!districtId) continue
    for (const alias of aliasValues)
      index.set(normaliseDistrictToken(alias), districtId)
  }
  return index
}

/**
 * Retains all recognized districts. A multi-district notice is intentionally
 * represented as an array because collapsing it makes distribution statistics
 * and map coverage misleading.
 */
export function resolveLandsdStreetDistricts(
  labels: { en?: string | null; zhHant?: string | null },
  districts: LandsdStreetCanonicalDistrict[],
  districtCodes: readonly string[] = [],
): LandsdStreetDistrictResolution {
  const index = buildLandsdStreetDistrictIndex(districts)
  const ids = new Set<string>()
  const unmatched = new Set<string>()

  for (const label of [labels.en, labels.zhHant]) {
    if (!label) continue
    for (const token of splitDistrictLabel(label)) {
      const id = index.get(normaliseDistrictToken(token))
      if (id) ids.add(id)
      else unmatched.add(token)
    }
  }

  for (const districtCode of districtCodes) {
    for (const token of splitDistrictLabel(districtCode)) {
      const canonicalName = districtCodeNames[normaliseDistrictCode(token)]
      const id = canonicalName
        ? index.get(normaliseDistrictToken(canonicalName))
        : undefined
      if (id) ids.add(id)
      else unmatched.add(token)
    }
  }

  return {
    districtIds: [...ids].sort(),
    unmatched: [...unmatched].sort((left, right) => left.localeCompare(right)),
  }
}

function splitDistrictLabel(value: string) {
  return value
    .normalize('NFKC')
    .split(/\s*-\s*|[／、]/u)
    .map(item => item.trim())
    .filter(Boolean)
}

function normaliseDistrictToken(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .replaceAll('&', ' and ')
    .replaceAll(/[()]/g, ' ')
    .replaceAll(/\bdistrict\b/g, ' ')
    .replaceAll(/\b區\b/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

function normaliseDistrictCode(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('en').replaceAll(/\s+/g, '')
}
