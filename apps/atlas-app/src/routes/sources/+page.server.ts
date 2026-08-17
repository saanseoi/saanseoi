import { getSourcesPageData } from '#lib/registry/meta.remote.js'

export async function load() {
  return {
    sourcesPageData: await getSourcesPageData(),
  }
}
