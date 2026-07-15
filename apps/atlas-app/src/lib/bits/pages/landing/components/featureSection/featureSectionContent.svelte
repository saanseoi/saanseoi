<script lang="ts">
import { onMount } from 'svelte'

import { m } from '$lib/bits/internal/i18n'

let architectureSection = $state<HTMLElement>()
let isArchitectureActive = $state(false)
let isArchitectureRevealed = $state(false)
let activePrincipleIndex = $state<number | null>(null)
let principleDeckOrder = $state<Array<0 | 1 | 2 | 3>>([0, 1, 2, 3])
let swipeState = $state({
  pointerId: null as number | null,
  startX: 0,
  startY: 0,
  deltaX: 0,
  deltaY: 0,
  hasMoved: false,
  isDragging: false,
  isThrowing: false,
  intent: 'pending' as 'pending' | 'swipe',
  throwDirection: 1,
  throwingPrincipleIndex: null as 0 | 1 | 2 | 3 | null,
})
let suppressPrincipleClick = false

const principles = [
  {
    title: () => m.architecture_principle_stable_identifiers_title(),
    body: () => m.architecture_principle_stable_identifiers_body(),
    tone: 'paper',
    animation: 'ticker',
  },
  {
    title: () => m.architecture_principle_early_enrichment_title(),
    body: () => m.architecture_principle_early_enrichment_body(),
    tone: 'dark',
    animation: 'growth',
  },
  {
    title: () => m.architecture_principle_full_provenance_title(),
    body: () => m.architecture_principle_full_provenance_body(),
    tone: 'paper',
    animation: 'provenance',
  },
  {
    title: () => m.architecture_principle_persistence_title(),
    body: () => m.architecture_principle_persistence_body(),
    tone: 'dark',
    animation: 'cubes',
  },
] as const

const stableIdentifierChars = '018F8A4D0C9B42E6'.split('')
const stableIdentifierTiles = Array.from({ length: 144 }, (_, index) => {
  const row = Math.floor(index / 12)
  const column = index % 12

  return {
    char: stableIdentifierChars[index % stableIdentifierChars.length],
    horizontalIndex: index,
    verticalIndex: column * 12 + row,
  }
})

const rotatePrincipleToBack = () => {
  const frontPrincipleIndex = principleDeckOrder[0]
  if (frontPrincipleIndex === undefined) return

  principleDeckOrder = [...principleDeckOrder.slice(1), frontPrincipleIndex]
  activePrincipleIndex = null
}

const resetSwipeState = () => {
  swipeState = {
    pointerId: null,
    startX: 0,
    startY: 0,
    deltaX: 0,
    deltaY: 0,
    hasMoved: false,
    isDragging: false,
    isThrowing: false,
    intent: 'pending',
    throwDirection: 1,
    throwingPrincipleIndex: null,
  }
}

const handlePrinciplePointerDown = (event: PointerEvent, orderIndex: number) => {
  if (orderIndex !== 0) return

  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  swipeState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    deltaX: 0,
    deltaY: 0,
    hasMoved: false,
    isDragging: true,
    isThrowing: false,
    intent: 'pending',
    throwDirection: 1,
    throwingPrincipleIndex: null,
  }
}

const handlePrinciplePointerMove = (event: PointerEvent) => {
  if (swipeState.pointerId !== event.pointerId) return

  const deltaX = event.clientX - swipeState.startX
  const deltaY = event.clientY - swipeState.startY
  const absoluteDeltaX = Math.abs(deltaX)
  const absoluteDeltaY = Math.abs(deltaY)

  if (swipeState.intent === 'pending' && (absoluteDeltaX > 8 || absoluteDeltaY > 8)) {
    swipeState = {
      ...swipeState,
      intent: 'swipe',
      hasMoved: true,
    }
  }

  if (swipeState.intent === 'swipe' && event.cancelable) {
    event.preventDefault()
  }

  swipeState = {
    ...swipeState,
    deltaX,
    deltaY: deltaY * 0.35,
    hasMoved: absoluteDeltaX > 8 || absoluteDeltaY > 8,
  }
}

const handlePrinciplePointerEnd = (event: PointerEvent) => {
  if (swipeState.pointerId !== event.pointerId) return

  if (swipeState.intent === 'swipe' && Math.abs(swipeState.deltaX) > 76) {
    suppressPrincipleClick = true
    const throwingPrincipleIndex = principleDeckOrder[0]

    swipeState = {
      ...swipeState,
      pointerId: null,
      isDragging: false,
      isThrowing: true,
      throwDirection: swipeState.deltaX >= 0 ? 1 : -1,
      throwingPrincipleIndex: throwingPrincipleIndex ?? null,
    }

    window.setTimeout(() => {
      rotatePrincipleToBack()
      resetSwipeState()
    }, 420)
    return
  } else if (swipeState.hasMoved) {
    suppressPrincipleClick = true
  }

  resetSwipeState()
}

const handlePrincipleClick = (index: number) => {
  if (suppressPrincipleClick) {
    suppressPrincipleClick = false
    return
  }

  if (window.innerWidth <= 900) {
    activePrincipleIndex = null
    return
  }

  activePrincipleIndex = activePrincipleIndex === index ? null : index
}

const handleViewportResize = () => {
  if (window.innerWidth > 900) return

  activePrincipleIndex = null
  resetSwipeState()
}

onMount(() => {
  if (!architectureSection) return

  const observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry) return

      isArchitectureActive = entry.isIntersecting
      if (entry.isIntersecting) isArchitectureRevealed = true
    },
    { rootMargin: '20% 0px', threshold: 0.01 },
  )

  observer.observe(architectureSection)

  return () => observer.disconnect()
})
</script>

<svelte:window onresize={handleViewportResize} />

<div
  bind:this={architectureSection}
  class="landing-architecture"
  class:landing-architecture-active={isArchitectureActive}
  class:landing-architecture-revealed={isArchitectureRevealed}
>
  <div class="architecture-panel">
    <div class="landing-section-header">
      <div>
        <h2>{m.architecture_title()}</h2>
        <p>{m.architecture_description()}</p>
      </div>
    </div>

    <div
      class="principles-deck relative grid gap-5 overflow-visible py-3 sm:grid-cols-2 xl:grid-cols-4"
      class:principles-deck-expanded={activePrincipleIndex !== null}
      class:principles-deck-active-1={activePrincipleIndex === 0}
      class:principles-deck-active-2={activePrincipleIndex === 1}
      class:principles-deck-active-3={activePrincipleIndex === 2}
      class:principles-deck-active-4={activePrincipleIndex === 3}
      class:principles-deck-dragging={swipeState.isDragging}
      class:principles-deck-throwing={swipeState.isThrowing}
    >
      {#each principleDeckOrder as principleIndex, orderIndex (principleIndex)}
        {@const principle = principles[principleIndex] ?? principles[0]}
        <button
          class={`principle-card principle-card-${principleIndex + 1} principle-stack-position-${orderIndex} ${
          principle.tone === 'paper'
            ? 'principle-card-paper'
            : 'principle-card-dark'
        } ${activePrincipleIndex === principleIndex ? 'principle-card-active' : ''} ${
          swipeState.throwingPrincipleIndex === principleIndex
            ? 'principle-card-throwing-away'
            : ''
        }`}
          type="button"
          aria-pressed={activePrincipleIndex === principleIndex}
          style={`--stack-index: ${orderIndex}; --swipe-x: ${
          orderIndex === 0 ? swipeState.deltaX : 0
        }px; --swipe-y: ${
          orderIndex === 0 ? swipeState.deltaY : 0
        }px; --swipe-rotate: ${
          orderIndex === 0 ? swipeState.deltaX * 0.035 : 0
        }deg; --throw-direction: ${swipeState.throwDirection};`}
          onpointerdown={event => handlePrinciplePointerDown(event, orderIndex)}
          onpointermove={handlePrinciplePointerMove}
          onpointerup={handlePrinciplePointerEnd}
          onpointercancel={handlePrinciplePointerEnd}
          onclick={() => handlePrincipleClick(principleIndex)}
        >
          <span class="principle-corner" aria-hidden="true"></span>
          <span
            class={`principle-animation principle-animation-${principle.animation}`}
            aria-hidden="true"
          >
            {#if principle.animation === 'ticker'}
              {#each stableIdentifierTiles as tile}
                <span
                  class="ticker-tile"
                  data-char={tile.char}
                  style={`--horizontal-index: ${tile.horizontalIndex}; --vertical-index: ${tile.verticalIndex}`}
                >
                  {tile.char}
                  <span
                    class="ticker-scan ticker-scan-horizontal"
                    data-char={tile.char}
                    aria-hidden="true"
                  ></span>
                  <span
                    class="ticker-scan ticker-scan-vertical"
                    data-char={tile.char}
                    aria-hidden="true"
                  ></span>
                </span>
              {/each}
            {:else if principle.animation === 'growth'}
              <span></span>
              <span></span>
              <span></span>
            {:else if principle.animation === 'provenance'}
              <svg viewBox="0 0 640 150" aria-hidden="true">
                <defs>
                  <g id="provenance-branch">
                    <path class="branch-curve branch-baseline" d="M-42 92 H682" />
                    <path class="branch-curve" d="M36 92 C70 58 98 50 136 54" />
                    <path class="branch-curve" d="M36 92 C72 118 102 122 142 116" />
                    <path
                      class="branch-curve branch-curve-secondary"
                      d="M136 54 C160 36 184 34 212 40"
                    />
                    <path
                      class="branch-curve branch-curve-secondary"
                      d="M136 54 C164 66 188 70 218 64"
                    />
                    <path class="branch-curve" d="M196 92 C230 120 258 126 300 118" />
                    <path
                      class="branch-curve branch-curve-secondary"
                      d="M300 118 C330 132 354 132 384 124"
                    />
                    <path class="branch-curve" d="M328 92 C366 58 394 50 436 56" />
                    <path
                      class="branch-curve branch-curve-secondary"
                      d="M436 56 C462 38 488 36 520 42"
                    />
                    <path
                      class="branch-curve branch-curve-secondary"
                      d="M436 56 C466 68 492 72 526 66"
                    />
                    <path class="branch-curve" d="M500 92 C536 120 566 126 610 118" />
                    <path class="branch-curve" d="M588 92 C620 66 644 60 676 64" />

                    <circle
                      class="branch-node branch-node-baseline"
                      cx="36"
                      cy="92"
                      r="6"
                    />
                    <circle class="branch-node" cx="136" cy="54" r="5" />
                    <circle class="branch-node" cx="142" cy="116" r="5" />
                    <circle
                      class="branch-node branch-node-secondary"
                      cx="212"
                      cy="40"
                      r="4"
                    />
                    <circle
                      class="branch-node branch-node-secondary"
                      cx="218"
                      cy="64"
                      r="4"
                    />
                    <circle
                      class="branch-node branch-node-baseline"
                      cx="116"
                      cy="92"
                      r="3.5"
                    />
                    <circle
                      class="branch-node branch-node-baseline"
                      cx="196"
                      cy="92"
                      r="6"
                    />
                    <circle class="branch-node" cx="300" cy="118" r="5" />
                    <circle
                      class="branch-node branch-node-secondary"
                      cx="384"
                      cy="124"
                      r="4"
                    />
                    <circle
                      class="branch-node branch-node-baseline"
                      cx="260"
                      cy="92"
                      r="3.5"
                    />
                    <circle
                      class="branch-node branch-node-baseline"
                      cx="328"
                      cy="92"
                      r="6"
                    />
                    <circle class="branch-node" cx="436" cy="56" r="5" />
                    <circle
                      class="branch-node branch-node-secondary"
                      cx="520"
                      cy="42"
                      r="4"
                    />
                    <circle
                      class="branch-node branch-node-secondary"
                      cx="526"
                      cy="66"
                      r="4"
                    />
                    <circle
                      class="branch-node branch-node-baseline"
                      cx="420"
                      cy="92"
                      r="3.5"
                    />
                    <circle
                      class="branch-node branch-node-baseline"
                      cx="500"
                      cy="92"
                      r="6"
                    />
                    <circle class="branch-node" cx="610" cy="118" r="5" />
                    <circle
                      class="branch-node branch-node-baseline"
                      cx="588"
                      cy="92"
                      r="6"
                    />
                    <circle class="branch-node" cx="676" cy="64" r="5" />
                  </g>
                </defs>
                <g class="branch-loop">
                  <use href="#provenance-branch"></use>
                  <use href="#provenance-branch" x="640"></use>
                </g>
              </svg>
            {:else}
              {#each Array.from({ length: 16 }) as _, cubeIndex}
                <span style={`--cube-index: ${cubeIndex}`}></span>
              {/each}
            {/if}
          </span>
          <span class="principle-card-copy">
            <span
              class="block pt-4 font-display text-[1.55rem] font-bold leading-[1.02]"
            >
              {principle.title()}
            </span>
            <span
              class={`principle-card-body mt-4 font-body text-body-md leading-7 ${
                principle.tone === 'paper' ? 'text-[#444748]' : 'text-foreground-alt'
              } ${activePrincipleIndex === principleIndex ? 'principle-card-body-visible' : ''}`}
            >
              {principle.body()}
            </span>
          </span>
        </button>
      {/each}
    </div>
  </div>
</div>
