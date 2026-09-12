import {
  getDataPageApiData,
  getDataPageBasemapData,
} from '#lib/registry/data.remote.js'

export async function load() {
  const [dataPageApiData, dataPageBasemapData] = await Promise.all([
    getDataPageApiData(),
    getDataPageBasemapData(),
  ])

  return { dataPageApiData, dataPageBasemapData }
}
