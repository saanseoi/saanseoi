import { getApiFamilyPageData } from '#lib/registry/meta.remote.js'

export async function load({ params, url }) {
  return {
    apiFamilyPageData: await getApiFamilyPageData({
      familyType: params.familyType,
      domainCode: url.searchParams.get('domain') ?? undefined,
    }),
  }
}
