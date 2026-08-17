import { getApiReleaseShellData } from '#lib/registry/meta.remote.js'

export async function load({ params }) {
  return {
    apiReleaseShell: await getApiReleaseShellData(params.familyType),
  }
}
