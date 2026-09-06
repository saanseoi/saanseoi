import { resolve } from 'node:path'

export const HARBOUR_API_WRANGLER_CONFIG = resolve(
  import.meta.dir,
  '../../../../../harbour-api/wrangler.jsonc',
)

export const COUNTRY_NAME_ALIASES = [
  'CHINA',
  'P.R. CHINA',
  'PRC',
  'CHINA PRC',
  'CHINA, PRC',
  "THE PEOPLE'S REPUBLIC OF CHINA",
] as const

export const AREA_NAME_ALIASES_EN = new Map<string, string>([
  ['HK', 'HONG KONG ISLAND'],
  ['HONG KONG', 'HONG KONG ISLAND'],
  ['KLN', 'KOWLOON'],
  ['KOWLOON', 'KOWLOON'],
  ['NT', 'NEW TERRITORIES'],
  ['NEW TERRITORIES', 'NEW TERRITORIES'],
])

export const AREA_NAME_ALIASES_ZH = new Map<string, string>([
  ['香港', '香港島'],
  ['九龍', '九龍'],
  ['新界', '新界'],
])
