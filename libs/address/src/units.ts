// VALIDATION
import { z } from 'zod'
// DOMAIN
import { ADDRESS_UNIT_TYPES, ADDRESS_FLOOR_TYPES } from './content.js'
// TYPES
export type LocaleKey = 'en' | 'zhHant' | 'zhHans'

// SaanSeoi libs/db/src/address3d.ts: shared semantic codes, separate from expressions.
export const UNIT_TYPES = ADDRESS_UNIT_TYPES
export const FLOOR_TYPES = ADDRESS_FLOOR_TYPES
export const UnitTypeSchema = z.enum(UNIT_TYPES)
export const FloorTypeSchema = z.enum(FLOOR_TYPES)

/** Floor and unit use independent vocabularies, even where codes overlap. */
export const FloorDetailsSchema = z.strictObject({
  floorRef: z.string().max(4000).nullable().optional(),
  floorType: FloorTypeSchema.nullable().optional(),
})
export const UnitIdentitySchema = z.strictObject({
  unitRef: z.string().max(4000).nullable().optional(),
  unitType: UnitTypeSchema.nullable().optional(),
  unitPortion: z.string().max(4000).nullable().optional(),
})

// Local details have no inventory ID or scope. Room is a unit type;
// portions belong to unitPortion, with unit_portion describing address scope rather than another hierarchy level.
export const UnitDetailsSchema = z.strictObject({
  ...FloorDetailsSchema.shape,
  ...UnitIdentitySchema.shape,
})
export type UnitDetails = z.infer<typeof UnitDetailsSchema>
export type UnitType = (typeof UNIT_TYPES)[number]
export type FloorType = (typeof FLOOR_TYPES)[number]
export type StructuredAddressField =
  | 'unitExpression'
  | 'floorExpression'
  | 'unitPortion'

export const unitTerms: Record<UnitType, readonly [string, string, string]> = {
  F: ['Flat', '室', '室'],
  R: ['Room', '房', '房'],
  S: ['Shop', '舖', '铺'],
  SU: ['Suite', '套房', '套房'],
  U: ['Unit', '單位', '单位'],
  ST: ['Stall', '攤位', '摊位'],
  K: ['Kiosk', '亭', '亭'],
  O: ['Office', '辦公室', '办公室'],
  X: ['Other', '其他', '其他'],
}
export const floorTerms: Record<FloorType, readonly [string, string, string]> = {
  F: ['Floor', '樓', '楼'],
  G: ['Ground floor', '地下', '地下'],
  UG: ['Upper ground', '上層地下', '上层地下'],
  LG: ['Lower ground', '下層地下', '下层地下'],
  B: ['Basement', '地庫', '地库'],
  M: ['Mezzanine', '閣樓', '阁楼'],
  C: ['Concourse', '大堂', '大堂'],
  P: ['Podium', '平台', '平台'],
  R: ['Roof', '天台', '天台'],
  X: ['Other', '其他', '其他'],
}

/** Selects the local label for a canonical type.
 * @param terms Three-locale vocabulary. @param locale App locale. @returns Localized label.
 */
export function addressTerm(
  terms: readonly [string, string, string],
  locale: LocaleKey,
): string {
  return terms[locale === 'en' ? 0 : locale === 'zhHant' ? 1 : 2]
}

/** Parses a single floor expression without splitting compound references.
 * @param expression Exact user entry. @param type Optional explicitly selected type.
 * @returns Shared canonical reference and floor code; unknown text remains X.
 */
export function parseFloor(
  expression: string,
  type?: FloorType,
): z.infer<typeof FloorDetailsSchema> {
  FloorTypeSchema.optional().parse(type)
  const raw = expression.trim()
  if (!raw)
    return {
      floorRef: type && type !== 'F' && type !== 'X' ? '' : null,
      floorType: type ?? null,
    }
  const token = raw.toUpperCase().replace(/\s+/g, ' ')
  const aliases: Record<string, FloorType> = {
    G: 'G',
    GF: 'G',
    'G/F': 'G',
    GROUND: 'G',
    'GROUND FLOOR': 'G',
    地下: 'G',
    地面: 'G',
    UG: 'UG',
    'UG/F': 'UG',
    'UPPER GROUND': 'UG',
    'UPPER GROUND FLOOR': 'UG',
    上層地下: 'UG',
    上层地下: 'UG',
    LG: 'LG',
    'LG/F': 'LG',
    'LOWER GROUND': 'LG',
    'LOWER GROUND FLOOR': 'LG',
    下層地下: 'LG',
    下层地下: 'LG',
    'B/F': 'B',
    BF: 'B',
    BASEMENT: 'B',
    地庫: 'B',
    地库: 'B',
    M: 'M',
    'M/F': 'M',
    MEZZANINE: 'M',
    閣樓: 'M',
    阁楼: 'M',
    CONCOURSE: 'C',
    大堂: 'C',
    PODIUM: 'P',
    平台: 'P',
    ROOF: 'R',
    ROOFTOP: 'R',
    'R/F': 'R',
    天台: 'R',
  }
  for (const code of FLOOR_TYPES.filter(code => code !== 'F' && code !== 'X')) {
    aliases[`${code}/F`] = code
    aliases[`${floorTerms[code][0].toUpperCase()} FLOOR`] = code
  }
  // Bare B is a valid letter identifier; the Basement dropdown removes ambiguity.
  if (aliases[token]) return { floorType: type ?? aliases[token], floorRef: '' }
  const basement = /^(?:B(?:ASEMENT)?\s*|地[庫库]\s*)(\d+)(?:\/F|樓|楼)?$/i.exec(raw)
  if (basement) return { floorType: type ?? 'B', floorRef: basement[1] }
  const ordinary = /^(?:FLOOR\s+)?([\dA-Z]+)(?:\s*\/F|\s*FLOOR|\s*[樓楼])?$/i.exec(raw)
  return {
    floorRef: ordinary?.[1].toUpperCase() ?? raw,
    floorType: type ?? (ordinary ? 'F' : 'X'),
  }
}

/** Parses known unit labels while retaining unrecognized expressions verbatim.
 * @param expression User input. @param type Explicit unit type, if selected.
 * @returns Shared reference and type code.
 */
export function parseUnit(
  expression: string,
  type?: UnitType,
): z.infer<typeof UnitIdentitySchema> {
  UnitTypeSchema.optional().parse(type)
  const unitAliases: Record<string, string> = {
    FLT: 'Flat',
    APT: 'Flat',
    RM: 'Room',
    STE: 'Suite',
  }
  const raw = expression
    .trim()
    .replace(
      /^(FLT|APT|RM|STE)\.?\s+/i,
      (_, key: string) => `${unitAliases[key.toUpperCase()]} `,
    )
  if (!raw) return { unitRef: null, unitType: type ?? null }
  for (const code of UNIT_TYPES.filter(code => code !== 'X')) {
    const terms = unitTerms[code]
    const english = new RegExp(
      `^(?:${terms[0]}${code === 'F' ? '|Apartment|Apt' : ''})\\s+(.+)$`,
      'i',
    ).exec(raw)
    const chinese = new RegExp(`^(.+?)(?:${terms[1]}|${terms[2]})$`).exec(raw)
    if (english || chinese)
      return { unitRef: (english?.[1] ?? chinese?.[1])!, unitType: type ?? code }
  }
  return { unitRef: raw, unitType: type ?? (/^[\dA-Z-]+$/i.test(raw) ? 'U' : 'X') }
}

/** Formats a parsed floor in a target locale; letter-only floors do not gain /F.
 * @param details Parsed values. @param locale Target language. @returns Canonical display expression.
 */
export function formatFloor(details: UnitDetails, locale: LocaleKey): string {
  const { floorRef: ref, floorType: type } = details
  if (ref == null || !type) return ''
  if (type === 'X') return ref
  if (type === 'F')
    return locale === 'en'
      ? /^\d/.test(ref)
        ? `${ref}/F`
        : ref
      : `${ref}${locale === 'zhHans' ? '楼' : '樓'}`
  if (locale !== 'en')
    return `${addressTerm(floorTerms[type], locale)}${ref}${ref ? (locale === 'zhHans' ? '楼' : '樓') : ''}`
  if (type === 'B') return ref ? `B${ref}/F` : 'B/F'
  return `${type}${ref}/F`
}

/** Formats a unit using the canonical type and localized ordering.
 * @param details Parsed values. @param locale Target language. @returns Unit expression.
 */
export function formatUnit(details: UnitDetails, locale: LocaleKey): string {
  const { unitRef: ref, unitType: type } = details
  if (!ref || !type) return ''
  if (type === 'X') return ref
  const term = addressTerm(unitTerms[type], locale)
  return locale === 'en' ? `${term} ${ref}` : `${ref}${term}`
}
