import type { PageLoad } from './$types'

export const load = (({ data }) => ({
  ...data,
  previewImage: `https://tiles.saanseoi.hk/render/${data.region}/${({ hk: 'hongkong', mo: 'macau', gba: 'gba' } as Record<string, string>)[data.region]}-${data.version}-dark.webp`,
  viewerUrl: `https://viewer.saanseoi.hk/?region=${data.region}&version=${data.version}&theme=midnight&locale=en`,
})) satisfies PageLoad
