import { getApiFamilyPageData } from '#lib/registry/meta.remote.js'

export async function load({ params }) {
  return {
    apiFamilyPageData: await getApiFamilyPageData(params.familyType),
  }
}
