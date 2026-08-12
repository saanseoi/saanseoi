<script lang="ts">
import { getCurrentLocale, m } from '$lib/bits/internal/i18n'

import * as BasemapPostcard from './components/basemapPostcard'
import type { BasemapPostcardCode } from './components/basemapPostcard/basemapPostcardTypes'

type Props = {
  code: BasemapPostcardCode
  name: string
  tileset: string
  version: string
  isSelected: boolean
  isShrunk: boolean
  shrunkIndex: number | null
  isDragging: boolean
  isThrowing: boolean
  throwPhase: 'launch' | 'flight' | 'settle' | null
  dragX: number
  dragY: number
  flipDirection: 1 | -1
  layoutClass: string
  intro: { delay?: number; duration?: number; y?: number }
  onactivate: () => void
  onpointerdown: (event: PointerEvent) => void
  onpointermove: (event: PointerEvent) => void
  onpointerup: (event: PointerEvent) => void
  onpointercancel: (event: PointerEvent) => void
}

let {
  code,
  tileset,
  version,
  isSelected,
  isShrunk,
  shrunkIndex,
  isDragging,
  isThrowing,
  throwPhase,
  dragX,
  dragY,
  flipDirection,
  layoutClass,
  intro,
  onactivate,
  onpointerdown,
  onpointermove,
  onpointerup,
  onpointercancel,
}: Props = $props()

const tileOrigin = 'https://tiles.saanseoi.hk'
const accentByRegion = {
  hk: '#C83D3D',
  mo: '#00856A',
  gba: '#287FA3',
} as const
const patternByRegion = {
  hk: 'repeating-linear-gradient(135deg, #f8f3e6 0 9px, #C83D3D 9px 18px, #f8f3e6 18px 27px)',
  mo: 'repeating-linear-gradient(135deg, #f3f5ea 0 11px, #00856A 11px 20px, #f3f5ea 20px 32px)',
  gba: 'repeating-linear-gradient(135deg, #eef6f5 0 15px, #287FA3 15px 25px, #eef6f5 25px 40px)',
} as const
const darkPatternByRegion = {
  hk: 'repeating-linear-gradient(135deg, #f8f3e6 0 9px, #C83D3D 9px 18px, #f8f3e6 18px 27px)',
  mo: 'repeating-linear-gradient(135deg, #f8f3e6 0 11px, #00856A 11px 20px, #f8f3e6 20px 32px)',
  gba: 'repeating-linear-gradient(135deg, #f8f3e6 0 15px, #287FA3 15px 25px, #f8f3e6 25px 40px)',
} as const
const tiltByRegion = {
  hk: -6.8,
  gba: 1.2,
  mo: -4.8,
} as const
const offsetXByRegion = {
  hk: 14,
  gba: 0,
  mo: -8,
} as const
const offsetYByRegion = {
  hk: 24,
  gba: -10,
  mo: 8,
} as const
const stackOrderByRegion = {
  hk: 3,
  gba: 2,
  mo: 1,
} as const
const coverageByRegion = {
  hk: () => m.postcard_coverage_hk(),
  mo: () => m.postcard_coverage_mo(),
  gba: () => m.postcard_coverage_gba(),
} as const
const openStreetMapBoundsByRegion = {
  gba: [112.4, 21.6, 115.2, 23.5],
  hk: [113.82, 22.14, 114.48, 22.58],
  mo: [113.48, 22.1, 113.62, 22.25],
} as const
const publicFormats = [
  { name: 'PMTiles', href: 'https://docs.protomaps.com/pmtiles/' },
  {
    name: 'TileJSON',
    href: 'https://github.com/mapbox/tilejson-spec/tree/master/3.0.0',
  },
  {
    name: 'MVT',
    href: 'https://github.com/mapbox/vector-tile-spec/tree/master/2.1',
  },
  { name: 'GeoJSON', href: 'https://datatracker.ietf.org/doc/html/rfc7946' },
] as const
const schemaVersion = 'protomaps-v4.0'
const flipOrigin = 'center center'

let locale = $derived(getCurrentLocale())
let isChineseLocale = $derived(locale.startsWith('zh'))
const accent = $derived(accentByRegion[code])
const regionalName = $derived(
  code === 'hk'
    ? m.postcard_region_hk()
    : code === 'mo'
      ? m.postcard_region_mo()
      : m.postcard_region_gba(),
)
const stampDestination = $derived(code === 'gba' ? 'CN' : code.toUpperCase())
const pattern = $derived(patternByRegion[code])
const darkPattern = $derived(darkPatternByRegion[code])
const tilt = $derived(tiltByRegion[code])
const offsetX = $derived(offsetXByRegion[code])
const offsetY = $derived(offsetYByRegion[code])
const shrunkTilt = $derived(shrunkIndex === 0 ? -7.5 : 6.5)
const stackOrder = $derived(stackOrderByRegion[code])
const coverage = $derived(coverageByRegion[code]())
const openStreetMapUrl = $derived(
  `https://www.openstreetmap.org/?bbox=${openStreetMapBoundsByRegion[code].join(',')}`,
)
const displayOrder = $derived(
  isDragging || isSelected ? 30 : isShrunk ? (shrunkIndex === 0 ? 1 : 2) : stackOrder,
)
const throwDistance = $derived(
  Math.min(Math.max(Math.abs(dragX) * 0.82 + 98, 136), 250),
)
const throwLift = $derived(
  Math.min(Math.max(78 + Math.abs(dragX) * 0.22 + Math.max(-dragY, 0) * 0.3, 78), 154),
)
const throwRotation = $derived(Math.min(12 + Math.abs(dragX) * 0.042, 21))
const postcardTransform = $derived(
  isDragging
    ? isSelected
      ? `translate(${dragX}px, ${dragY}px) rotate(${dragX * 0.025}deg) scale(1)`
      : isShrunk
        ? `translate(${dragX}px, ${dragY}px) rotate(${shrunkTilt + dragX * 0.04}deg) scale(0.86)`
        : `translate(${offsetX + dragX}px, ${offsetY + dragY}px) rotate(${tilt + dragX * 0.035}deg) scale(1.18)`
    : isSelected
      ? isThrowing
        ? throwPhase === 'launch'
          ? `translate(${flipDirection * throwDistance}px, -${throwLift}px) rotate(${flipDirection * throwRotation}deg) scale(1.105)`
          : throwPhase === 'flight'
            ? `translate(0, -0.7rem) rotate(${-flipDirection * 2.5}deg) scale(1.035)`
            : 'rotate(0deg) scale(1)'
        : 'rotate(0deg) scale(1)'
      : isShrunk
        ? `translate(0, 0) rotate(${shrunkTilt}deg) scale(0.86)`
        : `translate(${offsetX}px, ${offsetY}px) rotate(${tilt}deg) scale(1.18)`,
)
const flipAngle = $derived(flipDirection * 180)
const flipTransform = $derived(
  isSelected
    ? `rotateY(${flipAngle * (throwPhase === 'launch' ? 0.48 : 1)}deg)`
    : 'none',
)
const previewUrl = $derived(
  `${tileOrigin}/render/${code}/${tileset}-latest-postcard.webp`,
)
const releaseVersion = $derived(
  version === 'latest' ? m.postcard_latest() : `${version}.0`,
)
const viewerUrl = $derived(
  `https://viewer.saanseoi.hk/?region=${code}&version=${version}&theme=midnight&locale=${locale}`,
)
const releaseNotesUrl = $derived(`/basemaps/releases/${code}/${version}`)
</script>

<BasemapPostcard.Root
  {accent}
  {darkPattern}
  {displayOrder}
  {flipOrigin}
  {flipTransform}
  {intro}
  {isDragging}
  {isSelected}
  {isThrowing}
  {layoutClass}
  {pattern}
  {postcardTransform}
  {throwPhase}
>
  <BasemapPostcard.Front
    {accent}
    {code}
    {isChineseLocale}
    {isDragging}
    {isSelected}
    {onactivate}
    {onpointercancel}
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    {previewUrl}
    {regionalName}
    {stampDestination}
  />
  <BasemapPostcard.Back
    {accent}
    {coverage}
    {flipAngle}
    {isDragging}
    {isSelected}
    {onactivate}
    {onpointercancel}
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    {openStreetMapUrl}
    {publicFormats}
    {regionalName}
    {releaseNotesUrl}
    {releaseVersion}
    {schemaVersion}
    {viewerUrl}
  />
</BasemapPostcard.Root>
