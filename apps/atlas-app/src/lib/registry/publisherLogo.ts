import dianapangLogo from '#lib/assets/logos/publisher-studies/dpang-fluid-dinosaur.svg'
import hkgovLogo from '#lib/assets/logos/publisher-studies/hong-kong-fluid-bauhinia.svg'
import overtureLogo from '#lib/assets/logos/publisher-studies/overture-fluid-atlas.svg'
import protomapsLogo from '#lib/assets/logos/publisher-studies/protomaps-fluid-mosaic.svg'
import saanseoiLogo from '#lib/assets/logos/saanseoi-emblem-deco-midnight-square.svg'

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
export const publisherLogoPadding = (_publisherCode: string): 'none' | 'inset' => 'none'

export const getPublisherLogo = (publisherCode: string) =>
  publisherLogos[publisherCode] ??
  (publisherCode.startsWith('hkgov') ? hkgovLogo : overtureLogo)
