import addressesImage from '$lib/assets/apiFamily/addresses-light-512.webp'
import divisionsImage from '$lib/assets/apiFamily/divisions-light-512.webp'
import divisionsHeaderImage from '$lib/assets/apiFamily/divisions-light.webp'
import placesImage from '$lib/assets/apiFamily/places-light-512.webp'
import statsImage from '$lib/assets/apiFamily/statistics-light-512.webp'
import streetsImage from '$lib/assets/apiFamily/streets-light-512.webp'

export type ApiFamilyTheme = {
  name: string
  image: string
  headerImage?: string
  colorway: {
    primary: string
    secondary: string
    surface: string
    ink: string
  }
}

/**
 * Canonical API family colours. Primary identifies a family in both themes;
 * secondary is sampled from the family illustration's highlight palette.
 */
export const apiFamilyColourways = {
  addresses: {
    primary: '#3b7089',
    secondary: '#9ca3b0',
    surface: '#fcf7ed',
    ink: '#141821',
  },
  divisions: {
    primary: '#bf9344',
    secondary: '#a4997b',
    surface: '#fcf7ed',
    ink: '#1a1d16',
  },
  places: {
    primary: '#c96a45',
    secondary: '#d5b293',
    surface: '#fcf7ed',
    ink: '#201814',
  },
  streets: {
    primary: '#409b8e',
    secondary: '#bcc3b7',
    surface: '#fcf7ed',
    ink: '#111717',
  },
  stats: {
    primary: '#687f9e',
    secondary: '#bcc1cc',
    surface: '#fcf7ed',
    ink: '#161c2a',
  },
} as const satisfies Record<string, ApiFamilyTheme['colorway']>

export const apiFamilyThemes = {
  addresses: {
    name: 'Addresses',
    image: addressesImage,
    colorway: apiFamilyColourways.addresses,
  },
  divisions: {
    name: 'Divisions',
    image: divisionsImage,
    headerImage: divisionsHeaderImage,
    colorway: apiFamilyColourways.divisions,
  },
  places: {
    name: 'Places',
    image: placesImage,
    colorway: apiFamilyColourways.places,
  },
  streets: {
    name: 'Streets',
    image: streetsImage,
    colorway: apiFamilyColourways.streets,
  },
  stats: {
    name: 'Statistics',
    image: statsImage,
    colorway: apiFamilyColourways.stats,
  },
} as const satisfies Record<string, ApiFamilyTheme>

export type ApiFamilyThemeKey = keyof typeof apiFamilyThemes

export const getApiFamilyTheme = (familyType: string): ApiFamilyTheme | undefined =>
  apiFamilyThemes[familyType.toLowerCase() as ApiFamilyThemeKey]
