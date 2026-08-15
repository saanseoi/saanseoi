import dianapangLogo from '#lib/assets/sourcePublishers/dpang.png'
import hkgovLogo from '#lib/assets/sourcePublishers/hkgov.webp'
import overtureLogo from '#lib/assets/sourcePublishers/overture.png'

const publisherLogos: Record<string, string> = {
  dpang: dianapangLogo,
  overture: overtureLogo,
  hkgov: hkgovLogo,
  'hkgov-censtatd': hkgovLogo,
  'hkgov-dpo': hkgovLogo,
  'hkgov-had': hkgovLogo,
  'hkgov-hyd': hkgovLogo,
  'hkgov-landsd': hkgovLogo,
  'hkgov-pland': hkgovLogo,
}

export const getPublisherLogo = (publisherCode: string) =>
  publisherLogos[publisherCode] ??
  (publisherCode.startsWith('hkgov') ? hkgovLogo : overtureLogo)
