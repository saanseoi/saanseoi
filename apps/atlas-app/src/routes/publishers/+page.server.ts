import { getPublishersPageData } from '#lib/registry/meta.remote.js'

export async function load() {
  return {
    publishersPageData: await getPublishersPageData(),
  }
}
