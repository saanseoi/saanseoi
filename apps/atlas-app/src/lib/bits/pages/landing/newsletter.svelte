<script lang="ts">
import { onMount } from 'svelte'
import { env } from '$env/dynamic/public'
import { m } from '$lib/bits/internal/i18n'
import { Button } from '$lib/bits/primitives/button'
import { Input } from '$lib/bits/primitives/input'
import { Label } from '$lib/bits/primitives/label'

let email = $state('')
let isSubmitting = $state(false)
let isSubscribed = $state(false)
let errorMessage = $state('')

const hongKongDataPacketThemes = [
  'HKG:ROUTES/MTR',
  'HKG:ROUTES/BUS',
  'HKG:ROUTES/FERRY',
  'HKG:ROUTES/TRAM',
  'HKG:PUBLIC/SPACE',
  'HKG:PUBLIC/TOILETS',
  'HKG:PUBLIC/WIFI',
  'HKG:PUBLIC/LIBRARIES',
  'HK:SIGNS/NEON',
  'HK:SIGNS/SHOPFRONTS',
  'HK:SIGNS/STREET-NAMES',
  'HK:ACCESS/LIFTS',
  'HK:ACCESS/RAMPS',
  'HK:ACCESS/CROSSINGS',
  'KLN:RESTAURANTS',
  'KLN:CAFES/LATE',
  'KLN:TONIGHT/RAVES',
  'KLN:MARKETS/NIGHT',
  'KLN:STREETS/FOOTFALL',
  'KLN:ALLEYS/SHORTCUTS',
  'HKI:STAIRS/URBAN',
  'HKI:ROOFTOPS/OPEN',
  'HKI:SHORELINES/WALK',
  'HKI:ART/PUBLIC',
  'NT:TRAILS',
  'NT:VILLAGES',
  'NT:WETLANDS',
  'NT:CYCLING/ROUTES',
  'LNT:BEACHES/ACCESS',
  'LNT:ISLAND/FERRIES',
  'LNT:TRAILS/COASTAL',
  'HKG:TREES/STREET',
  'HKG:SHADE/COVER',
  'HKG:RAIN/SHELTERS',
  'HKG:SEATING/PUBLIC',
  'HKG:WATER/REFILLS',
  'HKG:RECYCLING/POINTS',
  'HKG:COMMUNITY/GARDENS',
  'HKG:HERITAGE/PLACES',
  'HKG:VIEWPOINTS',
] as const

const packetCollectionEnabled = true

type OrangeHop = {
  progress: number
  direction: 1 | -1
  corridor: 'upper' | 'lower'
}

type ActiveDataPacket = {
  id: number
  label: (typeof hongKongDataPacketThemes)[number]
  originX: number
  originY: number
  eighthX: number
  eighthY: number
  quarterX: number
  quarterY: number
  threeEighthX: number
  threeEighthY: number
  midpointX: number
  midpointY: number
  fiveEighthX: number
  fiveEighthY: number
  targetX: number
  targetY: number
  threeQuarterX: number
  threeQuarterY: number
  sevenEighthX: number
  sevenEighthY: number
  duration: number
  rotation: number
  settled: boolean
  consumed: boolean
  fragments: Array<{ delay: number; x: number; y: number }>
}

type GreenCreatureState = {
  id: number
  x: number
  y: number
  rotation: number
  duration: number
  size: number
  glowing: boolean
  horizontalDirection: 1 | -1
  usedVerticalRoute: boolean
}

type Obstacle = {
  left: number
  top: number
  right: number
  bottom: number
}

const orangeHopSchedule: OrangeHop[] = [
  { progress: 0.025, direction: 1, corridor: 'upper' },
  { progress: 0.11, direction: 1, corridor: 'upper' },
  { progress: 0.21, direction: 1, corridor: 'upper' },
  { progress: 0.31, direction: 1, corridor: 'upper' },
  { progress: 0.41, direction: 1, corridor: 'upper' },
  { progress: 0.505, direction: 1, corridor: 'upper' },
  { progress: 0.565, direction: 1, corridor: 'upper' },
  { progress: 0.64525, direction: -1, corridor: 'lower' },
  { progress: 0.68725, direction: -1, corridor: 'lower' },
  { progress: 0.72925, direction: -1, corridor: 'lower' },
  { progress: 0.77125, direction: -1, corridor: 'lower' },
  { progress: 0.81325, direction: -1, corridor: 'lower' },
  { progress: 0.85625, direction: -1, corridor: 'lower' },
  { progress: 0.905, direction: -1, corridor: 'lower' },
]

let newsletterPanel: HTMLDivElement
let newsletterSignal: HTMLDivElement
let newsletterHeader: HTMLDivElement
let newsletterContent: HTMLDivElement
let orangeCreature: HTMLSpanElement
let isNewsletterActive = $state(false)
let activeDataPackets = $state<ActiveDataPacket[]>([])
let greenCreatureStates = $state<GreenCreatureState[]>([])
let nextDataPacketId = 0
// Element references are written by `bind:this`, so the maps must be reactive.
// `$state` also keeps indexed bindings reactive when the keyed each-block updates.
const packetElements = $state<Record<number, HTMLSpanElement | undefined>>({})
const collectorElements = $state<Record<number, HTMLSpanElement | undefined>>({})
let startPacketCycles = () => {}
let stopPacketCycles = () => {}
let startCollectors = () => {}
let stopCollectors = () => {}

function randomBetween(minimum: number, maximum: number) {
  return minimum + Math.random() * (maximum - minimum)
}

function spawnDataPacket(hop: OrangeHop) {
  const signalRect = newsletterSignal.getBoundingClientRect()
  const orangeRect = orangeCreature.getBoundingClientRect()
  const label =
    hongKongDataPacketThemes[
      Math.floor(Math.random() * hongKongDataPacketThemes.length)
    ] ?? hongKongDataPacketThemes[0]
  const id = nextDataPacketId++
  const orangeDiameter = (orangeRect.width / signalRect.width) * 100
  const originX =
    ((orangeRect.left + orangeRect.width / 2 - signalRect.left) / signalRect.width) *
    100
  const originY = ((orangeRect.bottom - signalRect.top) / signalRect.height) * 100
  const obstacles = getCollectorObstacles()
  const minimumTargetX = (10 / signalRect.width) * 100
  const maximumTargetX = ((signalRect.width - 42) / signalRect.width) * 100
  const minimumTargetY = (10 / signalRect.height) * 100
  const maximumTargetY = ((signalRect.height - 42) / signalRect.height) * 100
  let landing: { x: number; y: number } | undefined

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const candidateX = originX - hop.direction * orangeDiameter * randomBetween(2, 3)

    if (candidateX < minimumTargetX || candidateX > maximumTargetX) {
      continue
    }

    const candidate = {
      x: candidateX,
      y: randomBetween(minimumTargetY, maximumTargetY),
    }

    if (
      !pointIsBlocked(
        {
          x: (candidate.x / 100) * signalRect.width,
          y: (candidate.y / 100) * signalRect.height,
        },
        obstacles,
      )
    ) {
      landing = candidate
      break
    }
  }

  if (!landing) {
    return
  }

  const apexY = hop.corridor === 'upper' ? 0 : 50
  const control = {
    x: (originX + landing.x) / 2,
    y: 2 * apexY - (originY + landing.y) / 2,
  }
  const pointOnArc = (progress: number) => ({
    x:
      (1 - progress) ** 2 * originX +
      2 * (1 - progress) * progress * control.x +
      progress ** 2 * landing.x,
    y:
      (1 - progress) ** 2 * originY +
      2 * (1 - progress) * progress * control.y +
      progress ** 2 * landing.y,
  })
  const eighthPoint = pointOnArc(0.125)
  const quarterPoint = pointOnArc(0.25)
  const threeEighthPoint = pointOnArc(0.375)
  const midpoint = pointOnArc(0.5)
  const fiveEighthPoint = pointOnArc(0.625)
  const threeQuarterPoint = pointOnArc(0.75)
  const sevenEighthPoint = pointOnArc(0.875)
  let travelDistance = 0
  let previousPoint = pointOnArc(0)

  for (let step = 1; step <= 24; step += 1) {
    const point = pointOnArc(step / 24)
    travelDistance += Math.hypot(
      (point.x - previousPoint.x) * (signalRect.width / 100),
      (point.y - previousPoint.y) * (signalRect.height / 100),
    )
    previousPoint = point
  }

  activeDataPackets = [
    ...activeDataPackets,
    {
      id,
      label,
      originX,
      originY,
      eighthX: eighthPoint.x,
      eighthY: eighthPoint.y,
      quarterX: quarterPoint.x,
      quarterY: quarterPoint.y,
      threeEighthX: threeEighthPoint.x,
      threeEighthY: threeEighthPoint.y,
      midpointX: midpoint.x,
      midpointY: midpoint.y,
      fiveEighthX: fiveEighthPoint.x,
      fiveEighthY: fiveEighthPoint.y,
      targetX: landing.x,
      targetY: landing.y,
      threeQuarterX: threeQuarterPoint.x,
      threeQuarterY: threeQuarterPoint.y,
      sevenEighthX: sevenEighthPoint.x,
      sevenEighthY: sevenEighthPoint.y,
      duration: Math.round(Math.max(900, Math.min(2200, travelDistance * 4.5))),
      rotation: randomBetween(-9, 9),
      settled: false,
      consumed: false,
      fragments: Array.from({ length: 16 }, () => ({
        delay: randomBetween(0, 170),
        x: randomBetween(-2.2, 2.2),
        y: randomBetween(-2.2, 2.2),
      })),
    },
  ]
}

function markDataPacketSettled(packetId: number) {
  activeDataPackets = activeDataPackets.map(packet =>
    packet.id === packetId && !packet.consumed ? { ...packet, settled: true } : packet,
  )
}

function isWithinBounds(
  point: { x: number; y: number },
  width: number,
  height: number,
) {
  return (
    point.x >= 10 && point.x <= width - 42 && point.y >= 10 && point.y <= height - 42
  )
}

function pointIsBlocked(point: { x: number; y: number }, obstacles: Obstacle[]) {
  return obstacles.some(
    obstacle =>
      point.x >= obstacle.left &&
      point.x <= obstacle.right &&
      point.y >= obstacle.top &&
      point.y <= obstacle.bottom,
  )
}

function pathIsClear(
  from: { x: number; y: number },
  to: { x: number; y: number },
  obstacles: Obstacle[],
) {
  for (let step = 0; step <= 16; step += 1) {
    const progress = step / 16
    const point = {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
    }

    if (pointIsBlocked(point, obstacles)) {
      return false
    }
  }

  return true
}

function boundariesTouch(first: DOMRect, second: DOMRect) {
  return (
    first.left <= second.right &&
    first.right >= second.left &&
    first.top <= second.bottom &&
    first.bottom >= second.top
  )
}

function pickCollectorDestination(
  origin: { x: number; y: number },
  width: number,
  height: number,
  obstacles: Obstacle[],
  horizontalDirection: 1 | -1,
  useCorridorBias: boolean,
  returnToContentDirection: 1 | -1 | undefined,
) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const distance = randomBetween(180, 250)
    const returnToContent =
      returnToContentDirection !== undefined && Math.random() < 0.75
    const useVerticalRoute =
      !returnToContent && Math.random() < (useCorridorBias ? 0.9 : 0.72)
    const routeDirection = returnToContent
      ? returnToContentDirection
      : horizontalDirection
    const angle = useVerticalRoute
      ? (Math.random() < 0.5 ? -Math.PI / 2 : Math.PI / 2) + randomBetween(-0.62, 0.62)
      : (routeDirection === 1 ? 0 : Math.PI) + randomBetween(-0.62, 0.62)
    const candidate = {
      x: origin.x + Math.cos(angle) * distance,
      y: origin.y + Math.sin(angle) * distance,
    }

    if (
      isWithinBounds(candidate, width, height) &&
      pathIsClear(origin, candidate, obstacles)
    ) {
      return { destination: candidate, usedVerticalRoute: useVerticalRoute }
    }
  }

  return { destination: origin, usedVerticalRoute: false }
}

function getReturnToContentDirection(origin: { x: number; y: number }) {
  const signalRect = newsletterSignal.getBoundingClientRect()
  const panelRect = newsletterPanel.getBoundingClientRect()
  const panelLeft = panelRect.left - signalRect.left
  const panelRight = panelRect.right - signalRect.left

  if (origin.x < panelLeft) {
    return 1 as const
  }

  if (origin.x > panelRight) {
    return -1 as const
  }

  return undefined
}

function isInInnerCorridor(origin: { x: number; y: number }) {
  const signalRect = newsletterSignal.getBoundingClientRect()
  const headerRect = newsletterHeader.getBoundingClientRect()
  const contentRect = newsletterContent.getBoundingClientRect()
  const corridorLeft = headerRect.right - signalRect.left
  const corridorRight = contentRect.left - signalRect.left

  return (
    corridorLeft < corridorRight &&
    origin.x >= corridorLeft &&
    origin.x <= corridorRight
  )
}

function getCollectorObstacles() {
  const signalRect = newsletterSignal.getBoundingClientRect()
  const padding = 30

  return [newsletterHeader, newsletterContent].map(element => {
    const rect = element.getBoundingClientRect()

    return {
      left: rect.left - signalRect.left - padding,
      top: rect.top - signalRect.top - padding,
      right: rect.right - signalRect.left + padding,
      bottom: rect.bottom - signalRect.top + padding,
    }
  })
}

onMount(() => {
  const cycleSeconds = Number.parseFloat(
    getComputedStyle(newsletterPanel).getPropertyValue('--newsletter-orange-cycle'),
  )
  const cycleDuration = Number.isFinite(cycleSeconds) ? cycleSeconds * 1000 : 4000
  const timers = new Set<number>()
  let cycleGeneration = 0
  let cycleTimer: number | undefined
  let isRunning = false

  const scheduleCycle = () => {
    const generation = cycleGeneration

    for (const hop of orangeHopSchedule) {
      const timer = window.setTimeout(() => {
        timers.delete(timer)
        if (!isRunning || generation !== cycleGeneration) return
        spawnDataPacket(hop)
      }, cycleDuration * hop.progress)

      timers.add(timer)
    }
  }

  startPacketCycles = () => {
    if (isRunning) return

    isRunning = true
    cycleGeneration += 1
    scheduleCycle()
    cycleTimer = window.setInterval(scheduleCycle, cycleDuration)
  }

  stopPacketCycles = () => {
    if (!isRunning) return

    isRunning = false
    cycleGeneration += 1
    if (cycleTimer !== undefined) window.clearInterval(cycleTimer)
    cycleTimer = undefined

    for (const timer of timers) {
      window.clearTimeout(timer)
    }

    timers.clear()
    activeDataPackets = []
  }

  return () => stopPacketCycles()
})

onMount(() => {
  const signalRect = newsletterSignal.getBoundingClientRect()
  const obstacles = getCollectorObstacles()
  const startingPoints = [
    { x: 14, y: signalRect.height - 58 },
    { x: signalRect.width - 58, y: 14 },
    { x: signalRect.width - 58, y: signalRect.height - 58 },
  ].filter(point => !pointIsBlocked(point, obstacles))
  const timers = new Set<number>()
  const maximumCollectorSize = orangeCreature.getBoundingClientRect().width
  const initialCollectorSize = Math.min(34, maximumCollectorSize)

  greenCreatureStates = startingPoints.map((point, index) => ({
    id: index,
    x: point.x,
    y: point.y,
    rotation: index * 120,
    duration: 900,
    size: initialCollectorSize,
    glowing: false,
    horizontalDirection: index === 1 ? -1 : 1,
    usedVerticalRoute: false,
  }))

  const consumePacket = (packetId: number, collectorId: number) => {
    const packet = activeDataPackets.find(candidate => candidate.id === packetId)

    if (!packet || packet.consumed) {
      return
    }

    activeDataPackets = activeDataPackets.map(candidate =>
      candidate.id === packetId ? { ...candidate, consumed: true } : candidate,
    )
    greenCreatureStates = greenCreatureStates.map(state =>
      state.id === collectorId
        ? {
            ...state,
            size: Math.min(maximumCollectorSize, state.size + 1),
            glowing: true,
          }
        : state,
    )

    const cleanupTimer = window.setTimeout(() => {
      activeDataPackets = activeDataPackets.filter(
        candidate => candidate.id !== packetId,
      )
      greenCreatureStates = greenCreatureStates.map(state =>
        state.id === collectorId ? { ...state, glowing: false } : state,
      )
      timers.delete(cleanupTimer)
    }, 420)

    timers.add(cleanupTimer)
  }

  const moveCollector = (id: number) => {
    const collector = greenCreatureStates.find(state => state.id === id)

    if (!collector) {
      return
    }

    const bounds = newsletterSignal.getBoundingClientRect()
    const preferredDirection = collector.usedVerticalRoute
      ? ((collector.horizontalDirection * -1) as 1 | -1)
      : ((Math.random() < 0.85
          ? collector.horizontalDirection
          : collector.horizontalDirection * -1) as 1 | -1)
    const movement = pickCollectorDestination(
      collector,
      bounds.width,
      bounds.height,
      getCollectorObstacles(),
      preferredDirection,
      isInInnerCorridor(collector),
      getReturnToContentDirection(collector),
    )
    const destination = movement.destination

    if (destination.x === collector.x && destination.y === collector.y) {
      const retryTimer = window.setTimeout(() => {
        timers.delete(retryTimer)
        moveCollector(id)
      })

      timers.add(retryTimer)
      return
    }

    const distance = Math.hypot(
      destination.x - collector.x,
      destination.y - collector.y,
    )
    const duration = Math.round(Math.max(760, Math.min(1200, distance * 4.8)))
    const direction = destination.x >= collector.x ? 1 : -1

    greenCreatureStates = greenCreatureStates.map(state =>
      state.id === id
        ? {
            ...state,
            x: destination.x,
            y: destination.y,
            rotation: state.rotation + direction * randomBetween(720, 1080),
            duration,
            horizontalDirection: movement.usedVerticalRoute
              ? state.horizontalDirection
              : direction,
            usedVerticalRoute: movement.usedVerticalRoute,
          }
        : state,
    )

    const timer = window.setTimeout(() => {
      timers.delete(timer)
      moveCollector(id)
    }, duration + randomBetween(180, 420))

    timers.add(timer)
  }

  let collisionFrame = 0

  const monitorCollisions = () => {
    if (!isRunning) return

    for (const collector of greenCreatureStates) {
      const collectorElement = collectorElements[collector.id]

      if (!collectorElement) {
        continue
      }

      const collectorBounds = collectorElement.getBoundingClientRect()

      for (const packet of activeDataPackets) {
        const packetElement = packetElements[packet.id]

        if (
          packetCollectionEnabled &&
          packet.settled &&
          !packet.consumed &&
          packetElement &&
          boundariesTouch(collectorBounds, packetElement.getBoundingClientRect())
        ) {
          consumePacket(packet.id, collector.id)
        }
      }
    }

    collisionFrame = window.requestAnimationFrame(monitorCollisions)
  }

  let isRunning = false

  startCollectors = () => {
    if (isRunning) return

    isRunning = true
    collisionFrame = window.requestAnimationFrame(monitorCollisions)

    for (const collector of greenCreatureStates) {
      const timer = window.setTimeout(
        () => {
          timers.delete(timer)
          moveCollector(collector.id)
        },
        280 + collector.id * 430,
      )

      timers.add(timer)
    }
  }

  stopCollectors = () => {
    if (!isRunning) return

    isRunning = false
    window.cancelAnimationFrame(collisionFrame)
    collisionFrame = 0

    for (const timer of timers) {
      window.clearTimeout(timer)
    }

    timers.clear()
    activeDataPackets = []
    greenCreatureStates = greenCreatureStates.map(state => ({
      ...state,
      glowing: false,
    }))
  }

  return () => stopCollectors()
})

onMount(() => {
  let isPanelIntersecting = false
  let isWindowFocused = document.hasFocus()
  const compactViewport = window.matchMedia('(max-width: 900px)')

  const syncAnimationState = () => {
    const shouldAnimate =
      isPanelIntersecting &&
      !document.hidden &&
      isWindowFocused &&
      !compactViewport.matches &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    isNewsletterActive = shouldAnimate

    if (shouldAnimate) {
      startPacketCycles()
      startCollectors()
    } else {
      stopPacketCycles()
      stopCollectors()
    }
  }

  const handleWindowFocus = () => {
    isWindowFocused = true
    syncAnimationState()
  }

  const handleWindowBlur = () => {
    isWindowFocused = false
    syncAnimationState()
  }

  const observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry) return

      isPanelIntersecting = entry.isIntersecting
      syncAnimationState()
    },
    { rootMargin: '20% 0px', threshold: 0.01 },
  )

  observer.observe(newsletterPanel)
  document.addEventListener('visibilitychange', syncAnimationState)
  window.addEventListener('focus', handleWindowFocus)
  window.addEventListener('blur', handleWindowBlur)
  compactViewport.addEventListener('change', syncAnimationState)

  return () => {
    observer.disconnect()
    document.removeEventListener('visibilitychange', syncAnimationState)
    window.removeEventListener('focus', handleWindowFocus)
    window.removeEventListener('blur', handleWindowBlur)
    compactViewport.removeEventListener('change', syncAnimationState)
    stopPacketCycles()
    stopCollectors()
  }
})

const endpoint = env.PUBLIC_ATLAS_API_BASE_URL
  ? `${env.PUBLIC_ATLAS_API_BASE_URL}/v0/meta/substack`
  : 'http://localhost:8787/v0/meta/substack'

async function handleSubmit(event: SubmitEvent) {
  event.preventDefault()

  if (isSubmitting || isSubscribed) {
    return
  }

  errorMessage = ''
  isSubmitting = true

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email,
      }),
    })

    const payload = (await response.json().catch(() => null)) as {
      message?: string
    } | null

    if (!response.ok) {
      throw new Error(payload?.message || m.newsletter_error_generic())
    }

    isSubscribed = true
    email = ''
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : m.newsletter_error_generic()
  } finally {
    isSubmitting = false
  }
}
</script>

<section class="landing-newsletter">
  <div
    class="newsletter-panel"
    class:newsletter-panel-active={isNewsletterActive}
    bind:this={newsletterPanel}
  >
    <div class="newsletter-signal" aria-hidden="true" bind:this={newsletterSignal}>
      <span class="newsletter-orange-route">
        <span class="newsletter-orange-platform newsletter-orange-platform-first"
          >水</span
        >
        <span class="newsletter-orange-platform newsletter-orange-platform-second"
          >山</span
        >
        <span
          class="newsletter-creature newsletter-creature-orange"
          bind:this={orangeCreature}
        ></span>
      </span>
      {#each greenCreatureStates as collector, collectorIndex (collector.id)}
        <span
          class={`newsletter-creature newsletter-creature-collector newsletter-creature-collector-${String.fromCharCode(97 + collectorIndex)}`}
          class:newsletter-creature-collector-glowing={collector.glowing}
          bind:this={collectorElements[collector.id]}
          style={`width: ${collector.size}px; transform: translate(${collector.x}px, ${collector.y}px) rotate(${collector.rotation}deg); --collector-duration: ${collector.duration}ms;`}
        ></span>
      {/each}
      {#each activeDataPackets as packet (packet.id)}
        <span
          class="newsletter-packet"
          class:newsletter-packet-derezzing={packet.consumed}
          bind:this={packetElements[packet.id]}
          onanimationend={() => markDataPacketSettled(packet.id)}
          style={`--packet-origin-x: ${packet.originX}%; --packet-origin-y: ${packet.originY}%; --packet-eighth-x: ${packet.eighthX}%; --packet-eighth-y: ${packet.eighthY}%; --packet-quarter-x: ${packet.quarterX}%; --packet-quarter-y: ${packet.quarterY}%; --packet-three-eighth-x: ${packet.threeEighthX}%; --packet-three-eighth-y: ${packet.threeEighthY}%; --packet-midpoint-x: ${packet.midpointX}%; --packet-midpoint-y: ${packet.midpointY}%; --packet-five-eighth-x: ${packet.fiveEighthX}%; --packet-five-eighth-y: ${packet.fiveEighthY}%; --packet-three-quarter-x: ${packet.threeQuarterX}%; --packet-three-quarter-y: ${packet.threeQuarterY}%; --packet-seven-eighth-x: ${packet.sevenEighthX}%; --packet-seven-eighth-y: ${packet.sevenEighthY}%; --packet-target-x: ${packet.targetX}%; --packet-target-y: ${packet.targetY}%; --packet-duration: ${packet.duration}ms; --packet-rotation: ${packet.rotation}deg;`}
          >{packet.label}
          {#if packet.consumed}
            <span class="newsletter-packet-fragments" aria-hidden="true">
              {#each packet.fragments as fragment}
                <span
                  class="newsletter-packet-fragment"
                  style={`--fragment-delay: ${fragment.delay}ms; --fragment-x: ${fragment.x}; --fragment-y: ${fragment.y};`}
                ></span>
              {/each}
            </span>
          {/if}
        </span>
      {/each}
    </div>

    <div class="landing-section-header" bind:this={newsletterHeader}>
      <div>
        <h2>{m.newsletter_title()}</h2>
        <p>{m.newsletter_description()}</p>
      </div>
    </div>

    <div class="newsletter-content" bind:this={newsletterContent}>
      {#if isSubscribed}
        <div class="newsletter-card newsletter-success" role="status">
          <p class="newsletter-success-title">
            {m.newsletter_success_title()}
          </p>
          <p class="newsletter-success-body">
            {m.newsletter_success_body()}
          </p>
        </div>
      {:else}
        <form class="newsletter-card newsletter-form" onsubmit={handleSubmit}>
          <div class="newsletter-field">
            <Label class="sr-only" for="newsletter-email">
              {m.newsletter_email_label()}
            </Label>
            <Input
              class="newsletter-input"
              id="newsletter-email"
              name="email"
              placeholder={m.newsletter_email_placeholder()}
              type="email"
              bind:value={email}
              disabled={isSubmitting}
              required
            />
          </div>
          <Button
            class="newsletter-submit"
            type="submit"
            variant="primary"
            disabled={isSubmitting}
          >
            {m.newsletter_submit()}
          </Button>
        </form>

        {#if errorMessage}
          <p class="newsletter-error">
            {errorMessage}
          </p>
        {/if}
      {/if}

      <p class="newsletter-privacy">
        {@html m.newsletter_privacy()}
      </p>
    </div>
  </div>
</section>

<style>
.newsletter-panel:not(.newsletter-panel-active) .newsletter-creature,
.newsletter-panel:not(.newsletter-panel-active) .newsletter-creature::after,
.newsletter-panel:not(.newsletter-panel-active) .newsletter-packet,
.newsletter-panel:not(.newsletter-panel-active) .newsletter-packet-fragment {
  animation-play-state: paused;
}

.landing-newsletter {
  overflow: visible;
  scroll-margin-top: 5.5rem;
}

.newsletter-panel {
  /* Keep this at 4s while iterating; set it to 12s for the production cadence. */
  --newsletter-orange-cycle: 30s;
  /* Keep the existing route aligned to the content after expanding its corridors. */
  --newsletter-orange-y-shift-15: clamp(1.001rem, 2.156vw, 1.848rem);
  --newsletter-orange-y-shift-negative-3: clamp(1.516rem, 3.265vw, 2.798rem);
  --newsletter-orange-y-shift-14-6: clamp(1.012rem, 2.181vw, 1.869rem);
  --newsletter-orange-y-shift-14-5: clamp(1.015rem, 2.187vw, 1.874rem);
  --newsletter-orange-y-shift-67: clamp(-0.898rem, -1.047vw, -0.486rem);
  --newsletter-orange-y-shift-58: clamp(-0.422rem, -0.493vw, -0.229rem);
  --newsletter-orange-y-shift-45: clamp(0.143rem, 0.308vw, 0.264rem);
  --newsletter-orange-y-shift-43: clamp(0.2rem, 0.431vw, 0.37rem);
  --newsletter-orange-y-shift-30: clamp(0.572rem, 1.232vw, 1.056rem);
  --newsletter-orange-y-shift-11: clamp(1.115rem, 2.402vw, 2.059rem);
  --newsletter-orange-text-alignment: 1.25rem;
  --newsletter-orange-initial-hop-alignment: 1.25rem;
  --newsletter-orange-floor-alignment: 4rem;
  --newsletter-orange-start-end-alignment: 0.5rem;
  --newsletter-orange-start-end-x-alignment: 0.75rem;
  position: relative;
  display: grid;
  width: 100%;
  max-width: var(--spacing-container-max);
  grid-template-columns: minmax(0, 1fr) minmax(22rem, 0.82fr);
  gap: clamp(2rem, 6vw, 6rem);
  align-items: center;
  justify-content: flex-start;
  margin-inline: auto;
  padding: clamp(4.68rem, 10.08vw, 8.64rem) 1.5rem;
  isolation: isolate;
}

.landing-section-header {
  position: relative;
  z-index: 1;
  display: block;
  gap: 1.5rem;
  padding-bottom: 0;
}

.landing-section-header h2 {
  max-width: 15ch;
  font-family: var(--font-display);
  font-size: clamp(2.25rem, 4.05vw, 4.2rem);
  font-weight: 800;
  line-height: 0.92;
  color: var(--primary);
}

.landing-section-header p {
  max-width: 52rem;
  margin-top: 1rem;
  font-family: var(--font-body);
  font-size: clamp(1rem, 1.4vw, 1.14rem);
  line-height: 1.8;
  color: var(--foreground-alt);
}

.newsletter-content {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 1fr;
  gap: 0;
  align-items: center;
  min-height: 12.5rem;
  isolation: isolate;
}

.newsletter-signal {
  --orange-creature-diameter: clamp(4.75rem, 8vw, 6.5rem);
  position: absolute;
  top: -1.25rem;
  right: calc(50% - 50vw);
  bottom: 0;
  left: calc(50% - 50vw);
  z-index: 2;
  overflow: visible;
  pointer-events: none;
}

.newsletter-orange-route {
  position: absolute;
  top: 0;
  right: max(0px, calc(50% - var(--spacing-container-max) / 2));
  bottom: -3.5rem;
  left: max(0px, calc(50% - var(--spacing-container-max) / 2));
  z-index: 0;
}

.newsletter-orange-platform {
  position: absolute;
  z-index: 0;
  display: grid;
  width: 2.94rem;
  height: 1.2rem;
  place-items: center;
  border: 1px solid rgb(255 253 248 / 0.72);
  border-radius: 0.12rem 0.12rem 0.28rem 0.28rem;
  background: rgb(255 253 248 / 0.9);
  box-shadow: 0 0.35rem 0 rgb(255 253 248 / 0.18);
  color: color-mix(in srgb, var(--surface-container-lowest) 88%, black);
  font-family: var(--font-display);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  line-height: 1;
  transform: translateX(-50%);
  transform-origin: 50% 50%;
  will-change: transform;
  animation: newsletter-platform-float 7.2s ease-in-out infinite;
}

.newsletter-orange-platform-first {
  top: calc(
    58% +
    var(--orange-creature-diameter) +
    var(--newsletter-orange-y-shift-58) +
    var(--newsletter-orange-text-alignment)
  );
  left: 17%;
}

.newsletter-orange-platform-second {
  top: calc(
    43% +
    var(--orange-creature-diameter) +
    var(--newsletter-orange-y-shift-43)
  );
  left: 14%;
  animation-delay: -3.6s;
}

.newsletter-creature {
  position: absolute;
  z-index: 1;
  width: clamp(2.7rem, 4.8vw, 3.9rem);
  aspect-ratio: 1;
  border: 1px solid currentColor;
  border-radius: 999px;
  color: var(--secondary);
  opacity: 0.78;
  box-shadow:
    inset 0 0 0 0.42rem color-mix(in srgb, currentColor 7%, transparent),
    0 0 0 0.35rem color-mix(in srgb, currentColor 6%, transparent);
}

.newsletter-creature::before {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0.43rem;
  aspect-ratio: 1;
  content: "";
  border-radius: inherit;
  background: currentColor;
  box-shadow:
    -0.78rem 0 0 -0.13rem currentColor,
    0.78rem 0 0 -0.13rem currentColor,
    0 -0.78rem 0 -0.13rem currentColor,
    0 0.78rem 0 -0.13rem currentColor;
  transform: translate(-50%, -50%);
}

.newsletter-creature::after {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0.48rem;
  aspect-ratio: 1;
  content: "";
  border-radius: 999px;
  background: currentColor;
  opacity: 0.62;
}

.newsletter-creature-orange {
  top: 2.5%;
  left: 1.4%;
  width: var(--orange-creature-diameter);
  color: var(--tertiary);
  background:
    repeating-radial-gradient(
      circle at center,
      transparent 0 13%,
      color-mix(in srgb, currentColor 24%, transparent) 13.5% 14.5%,
      transparent 15.5% 25%
    ),
    radial-gradient(
      circle at center,
      transparent 0 38%,
      color-mix(in srgb, currentColor 38%, transparent) 38.5% 40.5%,
      transparent 41.5% 100%
    ),
    conic-gradient(
      from 18deg,
      transparent 0 8%,
      color-mix(in srgb, currentColor 20%, transparent) 8% 9%,
      transparent 9% 24%,
      color-mix(in srgb, currentColor 14%, transparent) 24% 25%,
      transparent 25% 41%,
      color-mix(in srgb, currentColor 18%, transparent) 41% 42%,
      transparent 42% 58%,
      color-mix(in srgb, currentColor 12%, transparent) 58% 59%,
      transparent 59% 75%,
      color-mix(in srgb, currentColor 18%, transparent) 75% 76%,
      transparent 76% 100%
    );
  animation:
    newsletter-orange-route-x-v2 var(--newsletter-orange-cycle) linear infinite,
    newsletter-orange-route-y-v2 var(--newsletter-orange-cycle) linear infinite,
    newsletter-orange-route-spin-v2 var(--newsletter-orange-cycle) linear infinite;
}

.newsletter-creature-orange::before {
  width: 0.3rem;
  background: color-mix(in srgb, currentColor 82%, transparent);
  box-shadow:
    0 0 0 0.6rem color-mix(in srgb, currentColor 10%, transparent),
    0 0 0 1.35rem color-mix(in srgb, currentColor 6%, transparent);
}

.newsletter-creature-collector-a,
.newsletter-creature-collector-b,
.newsletter-creature-collector-c {
  top: 0;
  left: 0;
  width: clamp(1.65rem, 2.6vw, 2.2rem);
  opacity: 0.68;
  transition: transform var(--collector-duration) cubic-bezier(0.2, 0.78, 0.24, 1);
  will-change: transform;
}

.newsletter-creature-orange::after {
  animation: newsletter-orange-route-refined-momentum var(--newsletter-orange-cycle)
    cubic-bezier(0.55, 0, 0.2, 1) infinite;
}

.newsletter-creature-collector-a::after {
  animation: newsletter-collector-a-momentum 6s cubic-bezier(0.55, 0, 0.2, 1) infinite;
}

.newsletter-creature-collector-glowing {
  animation: newsletter-collector-consume 420ms ease-out both;
}

.newsletter-creature-collector-glowing::before {
  animation: newsletter-collector-shiver 180ms steps(3, end) 2;
}

.newsletter-creature-collector-b::after {
  animation: newsletter-collector-b-momentum 7s cubic-bezier(0.55, 0, 0.2, 1) infinite
    -2.5s;
}

.newsletter-creature-collector-c::after {
  animation: newsletter-collector-c-momentum 8s cubic-bezier(0.55, 0, 0.2, 1) infinite
    -4s;
}

.newsletter-packet {
  position: absolute;
  top: var(--packet-origin-y);
  left: var(--packet-origin-x);
  display: inline-flex;
  align-items: center;
  height: 1.6rem;
  padding: 0 0.55rem;
  border: 1px solid color-mix(in srgb, var(--secondary) 38%, transparent);
  background: color-mix(in srgb, var(--surface-container-lowest) 82%, transparent);
  color: color-mix(in srgb, var(--secondary) 88%, var(--primary));
  font-family: var(--font-body);
  font-size: 0.57rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1;
  text-transform: uppercase;
  white-space: nowrap;
  animation: newsletter-packet-toss var(--packet-duration) linear both;
}

.newsletter-packet-derezzing {
  top: var(--packet-target-y);
  left: var(--packet-target-x);
  animation: newsletter-packet-derez 420ms ease-in both;
}

.newsletter-packet-fragments {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: repeat(4, 1fr);
  pointer-events: none;
}

.newsletter-packet-fragment {
  min-width: 0;
  min-height: 0;
  background: color-mix(in srgb, var(--secondary) 78%, transparent);
  animation: newsletter-packet-fragment-derez 300ms ease-out var(--fragment-delay) both;
}

.newsletter-card {
  position: relative;
  width: 100%;
  margin-left: 0;
  border: 1px solid color-mix(in srgb, var(--outline-variant) 86%, transparent);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--surface-container-lowest) 86%, transparent),
    color-mix(in srgb, var(--surface) 96%, transparent)
  );
  box-shadow: 0 1.2rem 3.2rem rgb(0 0 0 / 0.11);
  grid-area: 1 / 1;
}

.newsletter-card::before {
  position: absolute;
  top: -1px;
  right: 1.25rem;
  left: 1.25rem;
  height: 1px;
  content: "";
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--secondary) 70%, transparent),
    color-mix(in srgb, var(--tertiary) 55%, transparent),
    transparent
  );
}

.newsletter-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.75rem;
  align-items: end;
  padding: clamp(1rem, 2.8vw, 1.35rem);
}

.newsletter-field {
  min-width: 0;
}

:global(.newsletter-input) {
  min-height: 3.55rem;
  border: 1px solid color-mix(in srgb, var(--foreground-alt) 24%, transparent);
  background: color-mix(in srgb, var(--surface) 72%, transparent);
  padding-inline: 1rem;
  color: var(--primary);
}

:global(.newsletter-input:focus) {
  border-color: var(--secondary);
}

:global(.newsletter-submit) {
  min-height: 3.55rem;
  min-width: 9.5rem;
  box-shadow: 0 0.8rem 1.8rem rgb(0 0 0 / 0.14);
}

.newsletter-success {
  padding: clamp(1.25rem, 3vw, 1.75rem);
}

.newsletter-success + .newsletter-privacy {
  top: calc(50% + 5rem);
}

.newsletter-success-title {
  font-family: var(--font-display);
  font-size: clamp(1.5rem, 2.4vw, 2.15rem);
  font-weight: 800;
  line-height: 1;
  color: var(--primary);
}

.newsletter-success-body {
  margin-top: 0.75rem;
  font-family: var(--font-body);
  font-size: 1rem;
  line-height: 1.7;
  color: var(--foreground-alt);
}

.newsletter-error {
  position: absolute;
  top: calc(50% + 3.75rem);
  right: 0;
  left: 0;
  width: 100%;
  margin-top: 0.85rem;
  margin-left: 0;
  font-family: var(--font-body);
  font-size: 0.9rem;
  color: #9f3221;
}

.newsletter-privacy {
  position: absolute;
  top: calc(50% + 3.75rem);
  right: 0;
  left: 0;
  text-align: center;
  width: 100%;
  margin-top: 0;
  margin-left: 0;
  font-family: var(--font-body);
  font-size: 0.78rem;
  line-height: 1.55;
  color: color-mix(in srgb, var(--foreground-alt) 70%, transparent);
}

.newsletter-error + .newsletter-privacy {
  top: calc(50% + 5.55rem);
}

.newsletter-privacy :global(a) {
  text-decoration: underline;
  text-underline-offset: 0.18em;
}

/* Increase contrast and make the signal respond when the newsletter is explored in light mode. */
:global(html:not(.dark)) .newsletter-creature-orange {
  color: #d65b24;
  opacity: 0.84;
  background: radial-gradient(
    circle at center,
    transparent 0 32%,
    color-mix(in srgb, currentColor 52%, transparent) 33% 35%,
    transparent 36% 57%,
    color-mix(in srgb, currentColor 34%, transparent) 58% 60%,
    transparent 61% 100%
  );
}

:global(html:not(.dark)) .newsletter-creature-orange::before {
  background: color-mix(in srgb, currentColor 74%, transparent);
  box-shadow:
    0 0 0 0.46rem color-mix(in srgb, currentColor 9%, transparent),
    0 0 0 1.1rem color-mix(in srgb, currentColor 5%, transparent);
}

:global(html:not(.dark)) .newsletter-creature-collector {
  color: #007d67;
  opacity: 0.8;
  transition:
    transform var(--collector-duration) cubic-bezier(0.2, 0.78, 0.24, 1),
    filter 220ms ease,
    opacity 220ms ease;
}

:global(html:not(.dark)) .newsletter-orange-platform {
  border-color: rgb(201 79 27 / 0.34);
  background: rgb(255 247 240 / 0.94);
  color: #e3622b;
  font-weight: 900;
  text-shadow: 0 1px 0 rgb(255 253 248 / 0.9);
}

:global(html:not(.dark)) .newsletter-creature:not(.newsletter-creature-collector),
:global(html:not(.dark)) .newsletter-orange-platform {
  transition:
    filter 220ms ease,
    opacity 220ms ease,
    box-shadow 220ms ease,
    translate 220ms ease;
}

@media (hover: hover) {
  :global(html:not(.dark)) .newsletter-panel:hover .newsletter-creature-orange {
    filter: drop-shadow(0 0 0.75rem rgb(201 79 27 / 0.3));
    opacity: 1;
  }

  :global(html:not(.dark)) .newsletter-panel:hover .newsletter-creature-collector {
    filter: drop-shadow(0 0 0.55rem rgb(0 125 103 / 0.26));
    opacity: 0.98;
  }

  :global(html:not(.dark)) .newsletter-panel:hover .newsletter-orange-platform {
    box-shadow: 0 0.45rem 0.9rem rgb(201 79 27 / 0.12);
    translate: 0 -0.14rem;
  }
}

@keyframes newsletter-platform-float {
  0%,
  100% {
    transform: translateX(-50%) translate3d(0, 0, 0) rotate(0deg);
  }

  25% {
    transform: translateX(-50%) translate3d(1px, -3px, 0) rotate(0.4deg);
  }

  50% {
    transform: translateX(-50%) translate3d(-1px, -6px, 0) rotate(-0.5deg);
  }

  75% {
    transform: translateX(-50%) translate3d(-1px, -3px, 0) rotate(0.25deg);
  }
}

@keyframes newsletter-orange-hop {
  0% {
    animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
    top: 5%;
    left: 3%;
    transform: rotate(0deg) scale(1);
  }

  3% {
    animation-timing-function: cubic-bezier(0.7, 0, 0.95, 1);
    top: -6%;
    left: 10%;
    transform: rotate(1080deg) scale(1.08, 0.9);
  }

  6%,
  10% {
    top: 5%;
    left: 18%;
    transform: rotate(2160deg) scale(1);
  }

  10% {
    animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
  }

  13% {
    animation-timing-function: cubic-bezier(0.7, 0, 0.95, 1);
    top: -6%;
    left: 25%;
    transform: rotate(3240deg) scale(1.08, 0.9);
  }

  16%,
  20% {
    top: 5%;
    left: 33%;
    transform: rotate(4320deg) scale(1);
  }

  20% {
    animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
  }

  23% {
    animation-timing-function: cubic-bezier(0.7, 0, 0.95, 1);
    top: -6%;
    left: 40%;
    transform: rotate(5400deg) scale(1.08, 0.9);
  }

  26%,
  30% {
    top: 5%;
    left: 48%;
    transform: rotate(6480deg) scale(1);
  }

  30% {
    animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
  }

  33% {
    animation-timing-function: cubic-bezier(0.7, 0, 0.95, 1);
    top: -6%;
    left: 55%;
    transform: rotate(7560deg) scale(1.08, 0.9);
  }

  36%,
  40% {
    top: 5%;
    left: 63%;
    transform: rotate(8640deg) scale(1);
  }

  40% {
    animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
  }

  43% {
    animation-timing-function: cubic-bezier(0.7, 0, 0.95, 1);
    top: -6%;
    left: 70%;
    transform: rotate(9720deg) scale(1.08, 0.9);
  }

  46%,
  50% {
    top: 5%;
    left: 78%;
    transform: rotate(10800deg) scale(1);
  }

  53% {
    animation-timing-function: cubic-bezier(0.7, 0, 0.95, 1);
    top: 62%;
    left: 80%;
    transform: rotate(12960deg) scale(1);
  }

  56%,
  62% {
    top: 62%;
    left: 66%;
    transform: rotate(12960deg) scale(1);
  }

  62% {
    animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
  }

  65% {
    animation-timing-function: cubic-bezier(0.7, 0, 0.95, 1);
    top: 55%;
    left: 59%;
    transform: rotate(11880deg) scale(1.08, 0.9);
  }

  68%,
  72% {
    top: 62%;
    left: 52%;
    transform: rotate(10800deg) scale(1);
  }

  72% {
    animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
  }

  75% {
    animation-timing-function: cubic-bezier(0.7, 0, 0.95, 1);
    top: 55%;
    left: 45%;
    transform: rotate(9720deg) scale(1.08, 0.9);
  }

  78%,
  82% {
    top: 62%;
    left: 38%;
    transform: rotate(8640deg) scale(1);
  }

  82% {
    animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
  }

  85% {
    animation-timing-function: cubic-bezier(0.7, 0, 0.95, 1);
    top: 55%;
    left: 31%;
    transform: rotate(7560deg) scale(1.08, 0.9);
  }

  88%,
  92% {
    top: 62%;
    left: 24%;
    transform: rotate(6480deg) scale(1);
  }

  92% {
    animation-timing-function: cubic-bezier(0.15, 0, 0.3, 1);
  }

  95% {
    animation-timing-function: cubic-bezier(0.7, 0, 0.95, 1);
    top: 55%;
    left: 17%;
    transform: rotate(5400deg) scale(1.08, 0.9);
  }

  98% {
    top: 62%;
    left: 10%;
    transform: rotate(4320deg) scale(1);
  }

  100% {
    top: 5%;
    left: 3%;
    transform: rotate(3240deg) scale(1);
  }
}

@keyframes newsletter-collector-a {
  0%,
  15%,
  100% {
    top: 66%;
    left: 13%;
    transform: rotate(0deg) scale(1);
  }

  22%,
  35% {
    top: 53%;
    left: 28%;
    transform: rotate(360deg) scale(1.08, 0.9);
  }

  42%,
  55% {
    top: 74%;
    left: 42%;
    transform: rotate(720deg) scale(1);
  }

  62%,
  75% {
    top: 61%;
    left: 24%;
    transform: rotate(1080deg) scale(1.1, 0.88);
  }
}

@keyframes newsletter-collector-b {
  0%,
  13%,
  100% {
    top: 26%;
    left: 35%;
    transform: rotate(0deg) scale(1);
  }

  20%,
  32% {
    top: 47%;
    left: 49%;
    transform: rotate(360deg) scale(1.08, 0.9);
  }

  39%,
  51% {
    top: 31%;
    left: 64%;
    transform: rotate(720deg) scale(1);
  }

  58%,
  70% {
    top: 59%;
    left: 53%;
    transform: rotate(1080deg) scale(1.1, 0.88);
  }

  77%,
  89% {
    top: 38%;
    left: 40%;
    transform: rotate(1440deg) scale(1);
  }
}

@keyframes newsletter-collector-c {
  0%,
  15%,
  100% {
    top: 79%;
    left: 59%;
    transform: rotate(0deg) scale(1);
  }

  22%,
  34% {
    top: 63%;
    left: 72%;
    transform: rotate(360deg) scale(1.08, 0.9);
  }

  41%,
  53% {
    top: 85%;
    left: 81%;
    transform: rotate(720deg) scale(1);
  }

  60%,
  72% {
    top: 57%;
    left: 66%;
    transform: rotate(1080deg) scale(1.1, 0.88);
  }
}

@keyframes newsletter-orange-momentum {
  0%,
  5% {
    transform: translate(-2.25rem, 0.15rem) scale(0.82);
  }

  10%,
  13%,
  18%,
  21%,
  26%,
  29%,
  34%,
  37%,
  42%,
  45% {
    transform: translate(-2.25rem, 0.15rem) scale(1.12);
  }

  51%,
  55% {
    transform: translate(-2rem, -2.2rem) scale(0.82);
  }

  60%,
  63%,
  68%,
  71%,
  76%,
  79%,
  84%,
  87%,
  92%,
  95% {
    transform: translate(2.25rem, 0.15rem) scale(1.12);
  }

  100% {
    transform: translate(2rem, 2.2rem) scale(0.82);
  }
}

@keyframes newsletter-orange-route {
  0%,
  4% {
    top: 5%;
    left: 3%;
    transform: rotate(0deg) scale(1);
  }

  8% {
    top: -6%;
    left: 12%;
    transform: rotate(1080deg) scale(1.08, 0.9);
  }

  12%,
  14% {
    top: 5%;
    left: 21%;
    transform: rotate(2160deg) scale(1);
  }

  16% {
    top: -6%;
    left: 30%;
    transform: rotate(3240deg) scale(1.08, 0.9);
  }

  20%,
  22% {
    top: 5%;
    left: 39%;
    transform: rotate(4320deg) scale(1);
  }

  24% {
    top: -6%;
    left: 48%;
    transform: rotate(5400deg) scale(1.08, 0.9);
  }

  28%,
  30% {
    top: 5%;
    left: 57%;
    transform: rotate(6480deg) scale(1);
  }

  32% {
    top: -6%;
    left: 66%;
    transform: rotate(7560deg) scale(1.08, 0.9);
  }

  36%,
  38% {
    top: 5%;
    left: 75%;
    transform: rotate(8640deg) scale(1);
  }

  41% {
    top: 25%;
    left: 84%;
    transform: rotate(9000deg) scale(1.05, 0.96);
  }

  44% {
    top: 62%;
    left: 80%;
    transform: rotate(9360deg) scale(1);
  }

  50% {
    top: 62%;
    left: 80%;
    transform: rotate(9540deg) scale(1);
  }

  54% {
    top: 50%;
    left: 70%;
    transform: rotate(8100deg) scale(1.08, 0.9);
  }

  58%,
  60% {
    top: 62%;
    left: 60%;
    transform: rotate(7020deg) scale(1);
  }

  62% {
    top: 50%;
    left: 50%;
    transform: rotate(5940deg) scale(1.08, 0.9);
  }

  66%,
  68% {
    top: 62%;
    left: 40%;
    transform: rotate(4860deg) scale(1);
  }

  70% {
    top: 50%;
    left: 30%;
    transform: rotate(3780deg) scale(1.08, 0.9);
  }

  74%,
  76% {
    top: 62%;
    left: 20%;
    transform: rotate(2700deg) scale(1);
  }

  78% {
    top: 50%;
    left: 10%;
    transform: rotate(1620deg) scale(1.08, 0.9);
  }

  82%,
  84% {
    top: 62%;
    left: 0%;
    transform: rotate(540deg) scale(1);
  }

  90% {
    top: 62%;
    left: 0%;
    transform: rotate(360deg) scale(1);
  }

  97% {
    top: 24%;
    left: -4%;
    transform: rotate(-720deg) scale(1.08, 0.9);
  }

  100% {
    top: 5%;
    left: 3%;
    transform: rotate(-3600deg) scale(1);
  }
}

@keyframes newsletter-orange-route-momentum {
  0%,
  38% {
    transform: translate(-2.25rem, 0.2rem) scale(0.82);
  }

  41% {
    transform: translate(-1.8rem, -2.2rem) scale(1.12);
  }

  44%,
  50% {
    transform: translate(-2rem, -2.25rem) scale(0.82);
  }

  54%,
  78% {
    transform: translate(2.25rem, 0.2rem) scale(1.12);
  }

  82%,
  90% {
    transform: translate(2.2rem, 1.8rem) scale(0.82);
  }

  97% {
    transform: translate(-1.8rem, 2.2rem) scale(1.12);
  }

  100% {
    transform: translate(2.1rem, 1.9rem) scale(0.82);
  }
}

@keyframes newsletter-orange-route-refined {
  0% {
    top: 20%;
    left: 3%;
    transform: rotate(0deg) scale(1);
  }

  6% {
    top: 5%;
    left: 12%;
    transform: rotate(1080deg) scale(1.08, 0.9);
  }

  12% {
    top: 20%;
    left: 21%;
    transform: rotate(2160deg) scale(1);
  }

  18% {
    top: 5%;
    left: 30%;
    transform: rotate(3240deg) scale(1.08, 0.9);
  }

  24% {
    top: 20%;
    left: 39%;
    transform: rotate(4320deg) scale(1);
  }

  30% {
    top: 5%;
    left: 48%;
    transform: rotate(5400deg) scale(1.08, 0.9);
  }

  36% {
    top: 20%;
    left: 57%;
    transform: rotate(6480deg) scale(1);
  }

  42% {
    top: 5%;
    left: 66%;
    transform: rotate(7560deg) scale(1.08, 0.9);
  }

  48% {
    top: 20%;
    left: 75%;
    transform: rotate(8640deg) scale(1);
  }

  54% {
    top: 42%;
    left: 84%;
    transform: rotate(9000deg) scale(1.05, 0.96);
  }

  58% {
    top: 62%;
    left: 80%;
    transform: rotate(9360deg) scale(1);
  }

  61% {
    top: 62%;
    left: 80%;
    transform: rotate(9540deg) scale(1);
  }

  64% {
    top: 49%;
    left: 70%;
    transform: rotate(8100deg) scale(1.08, 0.9);
  }

  68% {
    top: 62%;
    left: 60%;
    transform: rotate(7020deg) scale(1);
  }

  72% {
    top: 49%;
    left: 50%;
    transform: rotate(5940deg) scale(1.08, 0.9);
  }

  76% {
    top: 62%;
    left: 40%;
    transform: rotate(4860deg) scale(1);
  }

  80% {
    top: 49%;
    left: 30%;
    transform: rotate(3780deg) scale(1.08, 0.9);
  }

  84% {
    top: 62%;
    left: 20%;
    transform: rotate(2700deg) scale(1);
  }

  88% {
    top: 49%;
    left: 10%;
    transform: rotate(1620deg) scale(1.08, 0.9);
  }

  92% {
    top: 62%;
    left: 0%;
    transform: rotate(540deg) scale(1);
  }

  94% {
    top: 62%;
    left: 0%;
    transform: rotate(360deg) scale(1);
  }

  97% {
    top: 31%;
    left: -3%;
    transform: rotate(-720deg) scale(1.08, 0.9);
  }

  100% {
    top: 20%;
    left: 3%;
    transform: rotate(-3600deg) scale(1);
  }
}

@keyframes newsletter-orange-route-refined-momentum {
  0%,
  48% {
    transform: translate(-2.25rem, 0.2rem) scale(0.82);
  }

  54% {
    transform: translate(-1.8rem, -2.2rem) scale(1.12);
  }

  58%,
  61% {
    transform: translate(-2rem, -2.25rem) scale(0.82);
  }

  64%,
  88% {
    transform: translate(2.25rem, 0.2rem) scale(1.12);
  }

  92%,
  94% {
    transform: translate(2.2rem, 1.8rem) scale(0.82);
  }

  97% {
    transform: translate(-1.8rem, 2.2rem) scale(1.12);
  }

  100% {
    transform: translate(2.1rem, 1.9rem) scale(0.82);
  }
}

@keyframes newsletter-orange-route-x {
  0% {
    left: 3%;
  }

  48% {
    left: 75%;
  }

  54% {
    left: 84%;
  }

  58%,
  61% {
    left: 80%;
  }

  92%,
  94% {
    left: 0%;
  }

  97% {
    left: -3%;
  }

  100% {
    left: 3%;
  }
}

@keyframes newsletter-orange-route-y {
  0% {
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    top: -10%;
  }

  6% {
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    top: -26%;
  }

  12% {
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    top: -10%;
  }

  18% {
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    top: -26%;
  }

  24% {
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    top: -10%;
  }

  30% {
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    top: -26%;
  }

  36% {
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    top: -10%;
  }

  42% {
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    top: -26%;
  }

  48% {
    animation-timing-function: cubic-bezier(0.2, 0, 0.8, 1);
    top: -10%;
  }

  58%,
  61% {
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    top: 62%;
  }

  64% {
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    top: 46%;
  }

  68% {
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    top: 62%;
  }

  72% {
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    top: 46%;
  }

  76% {
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    top: 62%;
  }

  80% {
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    top: 46%;
  }

  84% {
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    top: 62%;
  }

  88% {
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    top: 46%;
  }

  92%,
  94% {
    animation-timing-function: cubic-bezier(0.2, 0, 0.8, 1);
    top: 62%;
  }

  97% {
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    top: 14%;
  }

  100% {
    top: -10%;
  }
}

@keyframes newsletter-orange-route-spin {
  0% {
    transform: rotate(0deg);
  }

  48% {
    transform: rotate(8640deg);
  }

  58% {
    transform: rotate(9360deg);
  }

  61% {
    transform: rotate(9540deg);
  }

  92% {
    transform: rotate(540deg);
  }

  94% {
    transform: rotate(360deg);
  }

  100% {
    transform: rotate(-3600deg);
  }
}

@keyframes newsletter-collector-a-momentum {
  0%,
  15%,
  100% {
    transform: translate(-1rem, 0.9rem) scale(0.82);
  }

  22%,
  35% {
    transform: translate(-1rem, 0.9rem) scale(1.15);
  }

  42%,
  55% {
    transform: translate(-1rem, -0.9rem) scale(0.82);
  }

  62%,
  75% {
    transform: translate(1rem, 0.9rem) scale(1.15);
  }
}

@keyframes newsletter-collector-b-momentum {
  0%,
  13%,
  100% {
    transform: translate(-1rem, -0.9rem) scale(0.82);
  }

  20%,
  32% {
    transform: translate(-1rem, -0.9rem) scale(1.15);
  }

  39%,
  51% {
    transform: translate(-1rem, 0.9rem) scale(0.82);
  }

  58%,
  70% {
    transform: translate(1rem, -0.9rem) scale(1.15);
  }

  77%,
  89% {
    transform: translate(1rem, 0.9rem) scale(0.82);
  }
}

@keyframes newsletter-collector-c-momentum {
  0%,
  15%,
  100% {
    transform: translate(-1rem, 0.9rem) scale(0.82);
  }

  22%,
  34% {
    transform: translate(-1rem, 0.9rem) scale(1.15);
  }

  41%,
  53% {
    transform: translate(-1rem, -0.9rem) scale(0.82);
  }

  60%,
  72% {
    transform: translate(1rem, 0.9rem) scale(1.15);
  }
}

@keyframes newsletter-packet-toss {
  0% {
    top: var(--packet-origin-y);
    left: var(--packet-origin-x);
    transform: translate(0, 0) rotate(0deg) scale(0.72, 0.9);
    opacity: 0;
  }

  10% {
    opacity: 0.9;
  }

  12.5% {
    top: var(--packet-eighth-y);
    left: var(--packet-eighth-x);
    transform: rotate(calc(var(--packet-rotation) * 0.125)) scale(0.93, 0.97);
    opacity: 0.9;
  }

  25% {
    top: var(--packet-quarter-y);
    left: var(--packet-quarter-x);
    transform: rotate(calc(var(--packet-rotation) * 0.25)) scale(1);
    opacity: 0.9;
  }

  37.5% {
    top: var(--packet-three-eighth-y);
    left: var(--packet-three-eighth-x);
    transform: rotate(calc(var(--packet-rotation) * 0.375)) scale(1);
    opacity: 0.9;
  }

  50% {
    top: var(--packet-midpoint-y);
    left: var(--packet-midpoint-x);
    transform: rotate(calc(var(--packet-rotation) * 0.5)) scale(1);
    opacity: 0.9;
  }

  62.5% {
    top: var(--packet-five-eighth-y);
    left: var(--packet-five-eighth-x);
    transform: rotate(calc(var(--packet-rotation) * 0.625)) scale(1);
    opacity: 0.9;
  }

  75% {
    top: var(--packet-three-quarter-y);
    left: var(--packet-three-quarter-x);
    transform: rotate(calc(var(--packet-rotation) * 0.75)) scale(1);
    opacity: 0.9;
  }

  87.5% {
    top: var(--packet-seven-eighth-y);
    left: var(--packet-seven-eighth-x);
    transform: rotate(calc(var(--packet-rotation) * 0.875)) scale(1);
    opacity: 0.9;
  }

  100% {
    top: var(--packet-target-y);
    left: var(--packet-target-x);
    transform: translate(0, 0) rotate(var(--packet-rotation)) scale(1);
    opacity: 0.9;
  }
}

@keyframes newsletter-packet-derez {
  0% {
    filter: brightness(1);
    border-color: color-mix(in srgb, var(--secondary) 38%, transparent);
    background: color-mix(in srgb, var(--surface-container-lowest) 82%, transparent);
    color: color-mix(in srgb, var(--secondary) 88%, var(--primary));
  }

  45% {
    filter: brightness(1.8) saturate(0.35);
    border-color: transparent;
    background: transparent;
    color: transparent;
  }

  100% {
    filter: brightness(2.4) saturate(0);
    border-color: transparent;
    background: transparent;
    color: transparent;
  }
}

@keyframes newsletter-packet-fragment-derez {
  0% {
    opacity: 0.9;
    transform: translate(0, 0) scale(1);
  }

  100% {
    opacity: 0;
    transform: translate(calc(var(--fragment-x) * 1rem), calc(var(--fragment-y) * 1rem))
      scale(0.08);
  }
}

@keyframes newsletter-collector-consume {
  0% {
    filter: brightness(1);
    box-shadow:
      inset 0 0 0 0.42rem color-mix(in srgb, currentColor 7%, transparent),
      0 0 0 0.35rem color-mix(in srgb, currentColor 6%, transparent);
  }

  45% {
    filter: brightness(1.7) saturate(1.35);
    box-shadow:
      inset 0 0 0 0.42rem color-mix(in srgb, currentColor 16%, transparent),
      0 0 0 0.8rem color-mix(in srgb, currentColor 16%, transparent),
      0 0 1.3rem color-mix(in srgb, currentColor 62%, transparent);
  }

  100% {
    filter: brightness(1);
    box-shadow:
      inset 0 0 0 0.42rem color-mix(in srgb, currentColor 7%, transparent),
      0 0 0 0.35rem color-mix(in srgb, currentColor 6%, transparent);
  }
}

@keyframes newsletter-collector-shiver {
  0%,
  100% {
    transform: translate(-50%, -50%);
  }

  33% {
    transform: translate(calc(-50% - 1px), calc(-50% + 1px));
  }

  66% {
    transform: translate(calc(-50% + 1px), calc(-50% - 1px));
  }
}

@keyframes newsletter-orange-route-x-v2 {
  0%,
  2% {
    left: calc(1% + var(--newsletter-orange-start-end-x-alignment));
  }
  4% {
    left: 10%;
  }
  8%,
  10% {
    left: 18%;
  }
  14% {
    left: 25%;
  }
  18%,
  20% {
    left: 33%;
  }
  24% {
    left: 38%;
  }
  28%,
  30% {
    left: 45%;
  }
  34% {
    left: 52%;
  }
  38%,
  40% {
    left: 60%;
  }
  44% {
    left: 67%;
  }
  48%,
  50% {
    left: 75%;
  }
  52% {
    left: 82%;
  }
  56% {
    left: 89%;
  }
  58% {
    left: 93%;
  }
  60% {
    left: 97%;
  }
  62% {
    left: 99%;
  }
  64% {
    left: 100%;
  }
  66.1% {
    left: 97%;
  }
  68.2% {
    left: 90%;
  }
  70.3% {
    left: 83%;
  }
  72.4% {
    left: 76%;
  }
  74.5% {
    left: 69%;
  }
  76.6% {
    left: 62%;
  }
  78.7% {
    left: 55%;
  }
  80.8% {
    left: 48%;
  }
  82.9% {
    left: 41%;
  }
  85% {
    left: 34%;
  }
  87.5% {
    left: 27%;
  }
  90% {
    left: 20%;
  }
  92% {
    left: 13%;
  }
  94% {
    left: 9.5%;
  }
  96% {
    left: 6%;
  }
  97.5% {
    left: 3.5%;
  }
  100% {
    left: calc(1% + var(--newsletter-orange-start-end-x-alignment));
  }
}

@keyframes newsletter-orange-route-y-v2 {
  0%,
  2% {
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    top: calc(
      15% +
      var(--newsletter-orange-y-shift-15) +
      var(--newsletter-orange-start-end-alignment)
    );
  }
  4% {
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    top: calc(-3% + var(--newsletter-orange-y-shift-negative-3));
  }
  8%,
  10% {
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    top: calc(
      15% +
      var(--newsletter-orange-y-shift-15) +
      var(--newsletter-orange-initial-hop-alignment)
    );
  }
  14% {
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    top: calc(-3% + var(--newsletter-orange-y-shift-negative-3));
  }
  18%,
  20% {
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    top: calc(
      14.6% +
      var(--newsletter-orange-y-shift-14-6) +
      var(--newsletter-orange-initial-hop-alignment)
    );
  }
  24% {
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    top: calc(-3% + var(--newsletter-orange-y-shift-negative-3));
  }
  28%,
  30% {
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    top: calc(
      14.5% +
      var(--newsletter-orange-y-shift-14-5) +
      var(--newsletter-orange-initial-hop-alignment)
    );
  }
  34% {
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    top: calc(-3% + var(--newsletter-orange-y-shift-negative-3));
  }
  38%,
  40% {
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    top: calc(15% + var(--newsletter-orange-y-shift-15));
  }
  44% {
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    top: calc(-3% + var(--newsletter-orange-y-shift-negative-3));
  }
  48%,
  50% {
    animation-timing-function: cubic-bezier(0.2, 0, 0.8, 1);
    top: calc(15% + var(--newsletter-orange-y-shift-15));
  }
  52% {
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    top: calc(-3% + var(--newsletter-orange-y-shift-negative-3));
  }
  56% {
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    top: calc(15% + var(--newsletter-orange-y-shift-15));
  }
  58% {
    animation-timing-function: cubic-bezier(0.42, 0, 1, 1);
    top: calc(-3% + var(--newsletter-orange-y-shift-negative-3));
  }
  64% {
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    top: calc(
      67% +
      var(--newsletter-orange-y-shift-67) +
      var(--newsletter-orange-floor-alignment)
    );
  }
  66.1% {
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    top: calc(
      58% +
      var(--newsletter-orange-y-shift-58) +
      var(--newsletter-orange-text-alignment)
    );
  }
  68.2% {
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    top: calc(
      67% +
      var(--newsletter-orange-y-shift-67) +
      var(--newsletter-orange-floor-alignment)
    );
  }
  70.3% {
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    top: calc(
      45% +
      var(--newsletter-orange-y-shift-45) +
      var(--newsletter-orange-text-alignment)
    );
  }
  72.4% {
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    top: calc(
      67% +
      var(--newsletter-orange-y-shift-67) +
      var(--newsletter-orange-floor-alignment)
    );
  }
  74.5% {
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    top: calc(
      45% +
      var(--newsletter-orange-y-shift-45) +
      var(--newsletter-orange-text-alignment)
    );
  }
  76.6% {
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    top: calc(
      67% +
      var(--newsletter-orange-y-shift-67) +
      var(--newsletter-orange-floor-alignment)
    );
  }
  78.7% {
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    top: calc(
      45% +
      var(--newsletter-orange-y-shift-45) +
      var(--newsletter-orange-text-alignment)
    );
  }
  80.8% {
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    top: calc(
      67% +
      var(--newsletter-orange-y-shift-67) +
      var(--newsletter-orange-floor-alignment)
    );
  }
  82.9% {
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    top: calc(
      45% +
      var(--newsletter-orange-y-shift-45) +
      var(--newsletter-orange-text-alignment)
    );
  }
  85% {
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    top: calc(
      67% +
      var(--newsletter-orange-y-shift-67) +
      var(--newsletter-orange-floor-alignment)
    );
  }
  87.5% {
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
    top: calc(
      45% +
      var(--newsletter-orange-y-shift-45) +
      var(--newsletter-orange-text-alignment)
    );
  }
  90% {
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    top: calc(
      67% +
      var(--newsletter-orange-y-shift-67) +
      var(--newsletter-orange-floor-alignment)
    );
  }
  92% {
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    top: calc(
      58% +
      var(--newsletter-orange-y-shift-58) +
      var(--newsletter-orange-text-alignment)
    );
  }
  94% {
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    top: calc(43% + var(--newsletter-orange-y-shift-43));
  }
  96% {
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
    top: calc(30% + var(--newsletter-orange-y-shift-30));
  }
  97.5% {
    animation-timing-function: cubic-bezier(0.42, 0, 1, 1);
    top: calc(11% + var(--newsletter-orange-y-shift-11));
  }
  100% {
    top: calc(
      15% +
      var(--newsletter-orange-y-shift-15) +
      var(--newsletter-orange-start-end-alignment)
    );
  }
}

@keyframes newsletter-orange-route-spin-v2 {
  0%,
  2% {
    transform: rotate(0deg);
  }
  4% {
    transform: rotate(720deg);
  }
  8% {
    animation-timing-function: cubic-bezier(0.16, 0.8, 0.24, 1);
    transform: rotate(1440deg);
  }
  9% {
    transform: rotate(1530deg);
  }
  10% {
    transform: rotate(1560deg);
  }
  14% {
    transform: rotate(2280deg);
  }
  18% {
    animation-timing-function: cubic-bezier(0.16, 0.8, 0.24, 1);
    transform: rotate(3000deg);
  }
  19% {
    transform: rotate(3090deg);
  }
  20% {
    transform: rotate(3120deg);
  }
  24% {
    transform: rotate(3840deg);
  }
  28% {
    animation-timing-function: cubic-bezier(0.16, 0.8, 0.24, 1);
    transform: rotate(4560deg);
  }
  29% {
    transform: rotate(4650deg);
  }
  30% {
    transform: rotate(4680deg);
  }
  34% {
    transform: rotate(5400deg);
  }
  38% {
    animation-timing-function: cubic-bezier(0.16, 0.8, 0.24, 1);
    transform: rotate(6120deg);
  }
  39% {
    transform: rotate(6210deg);
  }
  40% {
    transform: rotate(6240deg);
  }
  44% {
    transform: rotate(6960deg);
  }
  48% {
    animation-timing-function: cubic-bezier(0.16, 0.8, 0.24, 1);
    transform: rotate(7680deg);
  }
  49% {
    transform: rotate(7770deg);
  }
  50% {
    transform: rotate(7800deg);
  }
  52% {
    transform: rotate(8520deg);
  }
  56% {
    transform: rotate(9960deg);
  }
  58% {
    transform: rotate(10680deg);
  }
  64% {
    transform: rotate(12840deg);
  }
  66.1% {
    transform: rotate(12120deg);
  }
  68.2% {
    transform: rotate(11400deg);
  }
  70.3% {
    transform: rotate(10680deg);
  }
  72.4% {
    transform: rotate(9960deg);
  }
  74.5% {
    transform: rotate(9240deg);
  }
  76.6% {
    transform: rotate(8520deg);
  }
  78.7% {
    transform: rotate(7800deg);
  }
  80.8% {
    transform: rotate(7080deg);
  }
  82.9% {
    transform: rotate(6360deg);
  }
  85% {
    transform: rotate(5640deg);
  }
  87.5% {
    transform: rotate(4920deg);
  }
  90% {
    transform: rotate(4200deg);
  }
  92% {
    transform: rotate(3840deg);
  }
  94% {
    transform: rotate(3360deg);
  }
  96% {
    transform: rotate(2820deg);
  }
  97.5% {
    transform: rotate(2280deg);
  }
  100% {
    transform: rotate(1800deg);
  }
}

@media (min-width: 768px) {
  .newsletter-panel {
    --newsletter-orange-y-shift-15: clamp(1.232rem, 2.464vw, 2.156rem);
    --newsletter-orange-y-shift-negative-3: clamp(1.866rem, 3.731vw, 3.265rem);
    --newsletter-orange-y-shift-14-6: clamp(1.247rem, 2.494vw, 2.182rem);
    --newsletter-orange-y-shift-14-5: clamp(1.25rem, 2.499vw, 2.187rem);
    --newsletter-orange-y-shift-67: clamp(-1.047rem, -1.183vw, -0.598rem);
    --newsletter-orange-y-shift-58: clamp(-0.493rem, -0.557vw, -0.282rem);
    --newsletter-orange-y-shift-45: clamp(0.176rem, 0.352vw, 0.308rem);
    --newsletter-orange-y-shift-43: clamp(0.246rem, 0.493vw, 0.431rem);
    --newsletter-orange-y-shift-30: clamp(0.704rem, 1.408vw, 1.232rem);
    --newsletter-orange-y-shift-11: clamp(1.373rem, 2.746vw, 2.402rem);
    padding: clamp(5.76rem, 11.52vw, 10.08rem) 2rem;
  }
}

@media (max-width: 900px) {
  .newsletter-panel {
    grid-template-columns: 1fr;
    gap: 2rem;
  }

  .newsletter-content {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .newsletter-card {
    width: 100%;
  }

  .newsletter-creature,
  .newsletter-orange-platform {
    display: none;
  }

  .newsletter-error,
  .newsletter-privacy,
  .newsletter-error + .newsletter-privacy {
    position: static;
    margin-top: 0.8rem;
  }

  .newsletter-form {
    grid-template-columns: 1fr;
  }

  :global(.newsletter-submit) {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .newsletter-creature,
  .newsletter-creature::after,
  .newsletter-packet,
  .newsletter-orange-platform {
    animation: none;
  }

  .newsletter-creature {
    opacity: 0.55;
  }

  .newsletter-packet {
    opacity: 0.52;
  }
}
</style>
