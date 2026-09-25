import dianapangLogo from '#lib/assets/sourcePublishers/dpang.png'
import hkgovLogo from '#lib/assets/sourcePublishers/hkgov.webp'
import overtureLogo from '#lib/assets/sourcePublishers/overture.png'
import protomapsLogo from '#lib/assets/sourcePublishers/protomaps.png'
import saanseoiLogo from '#lib/assets/logos/saanseoi-emblem-lilac-petrol-gold-square.svg'

const publisherLogos: Record<string, string> = {
  saanseoi: saanseoiLogo,
  dpang: dianapangLogo,
  overture: overtureLogo,
  protomaps: protomapsLogo,
  hkgov: hkgovLogo,
  'hkgov-censtatd': hkgovLogo,
  'hkgov-dpo': hkgovLogo,
  'hkgov-had': hkgovLogo,
  'hkgov-hyd': hkgovLogo,
  'hkgov-landsd': hkgovLogo,
  'hkgov-pland': hkgovLogo,
}

/** Logos with their own background or internal spacing fill the icon frame. */
export const publisherLogoPadding = (publisherCode: string): 'none' | 'inset' =>
  publisherCode === 'saanseoi' ? 'none' : 'inset'

export const getPublisherLogo = (publisherCode: string) =>
  publisherLogos[publisherCode] ??
  (publisherCode.startsWith('hkgov') ? hkgovLogo : overtureLogo)
