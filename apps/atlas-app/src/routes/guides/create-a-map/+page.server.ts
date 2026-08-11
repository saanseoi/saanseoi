import type { PageServerLoad } from './$types'

// TODO Remove 'JP' before release
const regionsRequiringVpns = new Set(['CN', 'HK', 'JP', 'MO'])

export const load: PageServerLoad = ({ platform, request }) => {
  const requestCountry = (request as Request & { cf?: { country?: string } }).cf
    ?.country
  const cloudflareCountry =
    platform?.cf?.country ?? requestCountry ?? request.headers.get('CF-IPCountry') ?? ''

  const countryCode = cloudflareCountry.trim().toUpperCase()

  return {
    isVpnRequired: regionsRequiringVpns.has(countryCode),
    visitorRegionCode: countryCode || null,
  }
}
