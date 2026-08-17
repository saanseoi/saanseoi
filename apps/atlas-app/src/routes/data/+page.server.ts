import {
  getDataPageApiData,
  getDataPageBasemapData,
} from '#lib/registry/meta.remote.js'

export async function load() {
  const [dataPageApiData, dataPageBasemapData] = await Promise.all([
    getDataPageApiData(),
    getDataPageBasemapData(),
  ])

  return { dataPageApiData, dataPageBasemapData }
}
