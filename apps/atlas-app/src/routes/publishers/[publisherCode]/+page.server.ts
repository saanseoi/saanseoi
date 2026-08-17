import { getPublisherPageData } from '#lib/registry/meta.remote.js'

export async function load({ params }) {
  return {
    publisherPageData: await getPublisherPageData(params.publisherCode),
  }
}
