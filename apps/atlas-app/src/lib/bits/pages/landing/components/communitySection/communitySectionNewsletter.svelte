<script lang="ts">
import { onMount } from 'svelte'
import CommunitySectionEcosystem from './communitySectionEcosystem.svelte'
import CommunitySectionHeader from './communitySectionHeader.svelte'
import CommunitySectionSubstack from './communitySectionSubstack.svelte'
import type {
  ActiveDataPacket,
  GreenCreatureState,
  Obstacle,
  OrangeHop,
} from './communitySectionTypes'

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
let newsletterSignal = $state<HTMLDivElement>(undefined as never)
let newsletterHeader = $state<HTMLElement>(undefined as never)
let newsletterContent = $state<HTMLElement>(undefined as never)
let orangeCreature = $state<HTMLSpanElement>(undefined as never)
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
</script>

<div class="landing-newsletter overflow-visible scroll-mt-22">
  <div
    class="newsletter-panel"
    class:newsletter-panel-active={isNewsletterActive}
    bind:this={newsletterPanel}
  >
    <CommunitySectionEcosystem
      packets={activeDataPackets}
      collectors={greenCreatureStates}
      {packetElements}
      {collectorElements}
      bind:signal={newsletterSignal}
      bind:orangeCreature
      onpacketsettled={markDataPacketSettled}
    />
    <CommunitySectionHeader bind:element={newsletterHeader} />
    <CommunitySectionSubstack bind:element={newsletterContent} />
  </div>
</div>

<style>
.newsletter-panel {
  position: relative;
  display: grid;
  width: 100%;
  min-height: calc(100svh - var(--community-header-height, 4.5rem));
  max-width: var(--spacing-container-max);
  box-sizing: border-box;
  grid-template-columns: minmax(0, 1fr) minmax(22rem, 0.82fr);
  gap: clamp(2rem, 6vw, 6rem);
  align-items: center;
  justify-content: flex-start;
  margin-inline: auto;
  padding: clamp(4.68rem, 10.08vw, 8.64rem) 1.5rem;
  isolation: isolate;
}

:global(.newsletter-panel .newsletter-orange-route) {
  translate: 0;
}

@media (min-width: 768px) {
  .newsletter-panel {
    padding: clamp(5.76rem, 11.52vw, 10.08rem) 2rem;
  }
}

@media (max-width: 900px) {
  .newsletter-panel {
    grid-template-columns: 1fr;
    gap: 2rem;
  }
}
</style>
