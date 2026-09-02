import { getApiReleaseShellData } from '#lib/registry/meta.remote.js'

export async function load({ params }) {
  return {
    apiReleaseShell: await getApiReleaseShellData({
      familyType: params.familyType,
      releaseCode: params.releaseCode,
    }),
  }
}
