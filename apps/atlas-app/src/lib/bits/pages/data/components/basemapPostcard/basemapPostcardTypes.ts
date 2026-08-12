import type { Snippet } from 'svelte'

export type BasemapPostcardCode = 'gba' | 'hk' | 'mo'

export type BasemapPostcardInteraction = {
  onactivate: () => void
  onpointerdown: (event: PointerEvent) => void
  onpointermove: (event: PointerEvent) => void
  onpointerup: (event: PointerEvent) => void
  onpointercancel: (event: PointerEvent) => void
}

export type BasemapPostcardFocus = {
  frontButton?: HTMLButtonElement
  returnButton?: HTMLButtonElement
}

export type BasemapPostcardRootProps = {
  accent: string
  children?: Snippet
  class?: string
  darkPattern: string
  displayOrder: number
  flipOrigin: string
  flipTransform: string
  intro: { delay?: number; duration?: number; y?: number }
  isDragging: boolean
  isSelected: boolean
  isThrowing: boolean
  layoutClass: string
  pattern: string
  postcardTransform: string
  throwPhase: 'launch' | 'flight' | 'settle' | null
}

export const basemapPostcardFocusContext = Symbol('basemap-postcard-focus')
