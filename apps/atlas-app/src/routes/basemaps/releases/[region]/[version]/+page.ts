import { error } from '@sveltejs/kit'

import type { PageLoad } from './$types'

const regionNames = {
  hk: 'Hong Kong',
  mo: 'Macao',
  gba: 'Greater Bay Area',
} as const

export const load = (({ params }) => {
  const region = params.region as keyof typeof regionNames
  if (!(region in regionNames) || !/^\d{4}-\d{2}-\d{2}$/.test(params.version)) {
    throw error(404, 'Basemap release not found.')
  }

  return {
    region,
    regionName: regionNames[region],
    version: params.version,
    manifestUrl: `https://tiles.saanseoi.hk/releases/${region}/${params.version}.json`,
  }
}) satisfies PageLoad
