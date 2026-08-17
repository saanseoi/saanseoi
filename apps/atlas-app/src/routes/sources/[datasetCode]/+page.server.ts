import { getSourcePageData } from '#lib/registry/meta.remote.js'

export async function load({ params }) {
  return {
    source: await getSourcePageData(params.datasetCode),
  }
}
