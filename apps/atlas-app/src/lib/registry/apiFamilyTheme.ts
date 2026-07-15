import addressesImage from '$lib/assets/apiFamily/addresses.webp'
import divisionsImage from '$lib/assets/apiFamily/divisions.webp'
import placesImage from '$lib/assets/apiFamily/places.webp'
import streetsImage from '$lib/assets/apiFamily/streets.webp'

export type ApiFamilyTheme = {
  name: string
  image: string
  colorway: {
    primary: string
    secondary: string
    surface: string
    ink: string
  }
}

export const apiFamilyThemes = {
  addresses: {
    name: 'Addresses',
    image: addressesImage,
    colorway: {
      primary: '#17233f',
      secondary: '#b8a7e6',
      surface: '#fcf7ed',
      ink: '#141821',
    },
  },
  divisions: {
    name: 'Divisions',
    image: divisionsImage,
    colorway: {
      primary: '#b7791f',
      secondary: '#1f4d36',
      surface: '#fcf7ed',
      ink: '#1a1d16',
    },
  },
  places: {
    name: 'Places',
    image: placesImage,
    colorway: {
      primary: '#f26a2e',
      secondary: '#4b5563',
      surface: '#fcf7ed',
      ink: '#201814',
    },
  },
  streets: {
    name: 'Streets',
    image: streetsImage,
    colorway: {
      primary: '#8cf6da',
      secondary: '#242625',
      surface: '#fcf7ed',
      ink: '#111717',
    },
  },
} as const satisfies Record<string, ApiFamilyTheme>

export type ApiFamilyThemeKey = keyof typeof apiFamilyThemes

export const getApiFamilyTheme = (familyType: string): ApiFamilyTheme | undefined =>
  apiFamilyThemes[familyType.toLowerCase() as ApiFamilyThemeKey]
