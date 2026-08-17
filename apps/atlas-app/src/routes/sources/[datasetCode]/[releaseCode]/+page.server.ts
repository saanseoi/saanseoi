import { getSourceReleaseShellData } from '#lib/registry/meta.remote.js'

export async function load({ params }) {
  return {
    sourceReleaseShell: await getSourceReleaseShellData({
      datasetCode: params.datasetCode,
      releaseCode: params.releaseCode,
    }),
  }
}
