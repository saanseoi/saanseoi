<script lang="ts">
import { onMount } from 'svelte'
import CommunitySectionEcosystem from './communitySectionEcosystem.svelte'
import CommunitySectionHeader from './communitySectionHeader.svelte'
import CommunitySectionSubstack from './communitySectionSubstack.svelte'
import type {
  ActiveDataPacket,
  GreenCreatureState,
  Obstacle,
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

const packetsPerGodJump = 2

let newsletterPanel: HTMLDivElement
let newsletterSignal = $state<HTMLDivElement>(undefined as never)
let newsletterHeader = $state<HTMLElement>(undefined as never)
let newsletterContent = $state<HTMLElement>(undefined as never)
let orangeCreature = $state<HTMLSpanElement>(undefined as never)
let isNewsletterActive = $state(false)
let hasOrangeAnimationSpace = $state(false)
let activeDataPackets = $state<ActiveDataPacket[]>([])
let greenCreatureStates = $state<GreenCreatureState[]>([])
let nextDataPacketId = 0
let packetLaunchesEnabled = false
// Element references are written by `bind:this`, so the maps must be reactive.
// `$state` also keeps indexed bindings reactive when the keyed each-block updates.
const packetElements = $state<Record<number, HTMLSpanElement | undefined>>({})
const collectorElements = $state<Record<number, HTMLSpanElement | undefined>>({})
const collectorBearingElements = $state<Record<number, HTMLSpanElement | undefined>>({})
const startPacketCycles = () => {
  packetLaunchesEnabled = true
}
const stopPacketCycles = () => {
  packetLaunchesEnabled = false
  activeDataPackets = []
}
let startCollectors = () => {}
let stopCollectors = () => {}
let startOrangeBearingPhysics = () => {}
let stopOrangeBearingPhysics = () => {}
let startCollectorBearingPhysics = () => {}
let stopCollectorBearingPhysics = () => {}

type OrangeBearingState = {
  angle: number
  angularVelocity: number
  restAngle: number
  element: HTMLSpanElement
}

function randomBetween(minimum: number, maximum: number) {
  return minimum + Math.random() * (maximum - minimum)
}

function getPacketSafeAreaObstacle(signalRect: DOMRect, padding = 30): Obstacle {
  const headerRect = newsletterHeader.getBoundingClientRect()
  const contentRect = newsletterContent.getBoundingClientRect()

  return {
    left: Math.min(headerRect.left, contentRect.left) - signalRect.left - padding,
    top: Math.min(headerRect.top, contentRect.top) - signalRect.top - padding,
    right: Math.max(headerRect.right, contentRect.right) - signalRect.left + padding,
    bottom: Math.max(headerRect.bottom, contentRect.bottom) - signalRect.top + padding,
  }
}

function spawnDataPacket(spinDirection: 1 | -1) {
  const signalRect = newsletterSignal.getBoundingClientRect()
  const orangeRect = orangeCreature.getBoundingClientRect()
  const packetWidth = 42
  const packetHeight = 26
  const label =
    hongKongDataPacketThemes[
      Math.floor(Math.random() * hongKongDataPacketThemes.length)
    ] ?? hongKongDataPacketThemes[0]
  const id = nextDataPacketId++
  const godCentre = {
    x: orangeRect.left + orangeRect.width / 2,
    y: orangeRect.top + orangeRect.height / 2,
  }
  const launchRadius = orangeRect.width * 0.56
  const launchAngle = (spinDirection * (240 * Math.PI)) / 180
  const launchCentre = {
    x: godCentre.x + Math.sin(launchAngle) * launchRadius,
    y: godCentre.y - Math.cos(launchAngle) * launchRadius,
  }
  const launchCentreInSignal = {
    x: launchCentre.x - signalRect.left,
    y: launchCentre.y - signalRect.top,
  }
  const originX = ((launchCentreInSignal.x - packetWidth / 2) / signalRect.width) * 100
  const originY =
    ((launchCentreInSignal.y - packetHeight / 2) / signalRect.height) * 100
  const safeArea = getPacketSafeAreaObstacle(
    signalRect,
    12 + Math.max(packetWidth, packetHeight) / 2,
  )
  const minimumTargetX = packetWidth / 2 + 8
  const maximumTargetX = signalRect.width - packetWidth / 2 - 8
  const minimumTargetY = packetHeight / 2 + 32
  const maximumTargetY = signalRect.height - packetHeight / 2 - 32
  const maximumHorizontalDistance = Math.min(320, signalRect.width - packetWidth)
  const minimumHorizontalDistance = Math.min(
    110,
    Math.max(40, maximumHorizontalDistance * 0.55),
  )
  let landingCentre: { x: number; y: number } | undefined

  if (maximumTargetY <= minimumTargetY || maximumHorizontalDistance < 40) return

  for (let attempt = 0; attempt < 160; attempt += 1) {
    const distance = randomBetween(minimumHorizontalDistance, maximumHorizontalDistance)
    const candidate = {
      x: godCentre.x - spinDirection * distance,
      y: signalRect.top + randomBetween(minimumTargetY, maximumTargetY),
    }

    if (
      candidate.x < signalRect.left + minimumTargetX ||
      candidate.x > signalRect.left + maximumTargetX
    ) {
      continue
    }

    const signalPoint = {
      x: candidate.x - signalRect.left,
      y: candidate.y - signalRect.top,
    }

    if (!pointIsBlocked(signalPoint, [safeArea])) {
      landingCentre = signalPoint
      break
    }
  }

  if (!landingCentre) return

  const landing = {
    x: ((landingCentre.x - packetWidth / 2) / signalRect.width) * 100,
    y: ((landingCentre.y - packetHeight / 2) / signalRect.height) * 100,
  }
  const originPoint = {
    x: (originX / 100) * signalRect.width,
    y: (originY / 100) * signalRect.height,
  }
  const landingPoint = {
    x: (landing.x / 100) * signalRect.width,
    y: (landing.y / 100) * signalRect.height,
  }
  const getControlPoint = (lift: number) => {
    const apexY = Math.min(originPoint.y, landingPoint.y) - lift

    return {
      x: (originPoint.x + landingPoint.x) / 2,
      y: 2 * apexY - (originPoint.y + landingPoint.y) / 2,
    }
  }
  const pointOnArcPixels = (control: { x: number; y: number }, progress: number) => ({
    x:
      (1 - progress) ** 2 * originPoint.x +
      2 * (1 - progress) * progress * control.x +
      progress ** 2 * landingPoint.x,
    y:
      (1 - progress) ** 2 * originPoint.y +
      2 * (1 - progress) * progress * control.y +
      progress ** 2 * landingPoint.y,
  })
  const measureArcLength = (control: { x: number; y: number }) => {
    let distance = 0
    let previousPoint = originPoint

    for (let step = 1; step <= 24; step += 1) {
      const point = pointOnArcPixels(control, step / 24)
      distance += Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y)
      previousPoint = point
    }

    return distance
  }
  const desiredArcLength = signalRect.height * 1.4
  let minimumLift = 0
  let maximumLift = signalRect.height * 2

  for (let attempt = 0; attempt < 18; attempt += 1) {
    const lift = (minimumLift + maximumLift) / 2

    if (measureArcLength(getControlPoint(lift)) < desiredArcLength) {
      minimumLift = lift
    } else {
      maximumLift = lift
    }
  }

  const control = getControlPoint((minimumLift + maximumLift) / 2)
  const pointOnArc = (progress: number) => {
    const point = pointOnArcPixels(control, progress)

    return {
      x: (point.x / signalRect.width) * 100,
      y: (point.y / signalRect.height) * 100,
    }
  }
  const eighthPoint = pointOnArc(0.125)
  const quarterPoint = pointOnArc(0.25)
  const threeEighthPoint = pointOnArc(0.375)
  const midpoint = pointOnArc(0.5)
  const fiveEighthPoint = pointOnArc(0.625)
  const threeQuarterPoint = pointOnArc(0.75)
  const sevenEighthPoint = pointOnArc(0.875)
  const travelDistance = measureArcLength(control)

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

function spawnDataPacketsForGodJump(spinDirection: 1 | -1) {
  if (!packetLaunchesEnabled) return

  for (let packetIndex = 0; packetIndex < packetsPerGodJump; packetIndex += 1) {
    spawnDataPacket(spinDirection)
  }
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

type OrangeHopType =
  | 'stair-climbing'
  | 'upper-platform'
  | 'jump-off'
  | 'lower-platform'
  | 'freefall'

type OrangeRoutePoint = { x: number; y: number }

function calculateOrangeHopArc(
  start: OrangeRoutePoint,
  end: OrangeRoutePoint,
  routeWidth: number,
  routeHeight: number,
  creatureSize: number,
  type: OrangeHopType,
) {
  const horizontalDirection = Math.sign(end.x - start.x) || 1
  const horizontalDistance = Math.abs(end.x - start.x)
  const naturalLift = Math.min(
    routeHeight *
      ({
        'lower-platform': 0.3,
        'stair-climbing': 0.162,
        'upper-platform': 0.13,
        'jump-off': 0.06,
        freefall: 0.08,
      }[type] ?? 0.1),
    creatureSize *
      ({
        'lower-platform': 2.4,
        'stair-climbing': 2.16,
        'upper-platform': 1.8,
        'jump-off': 1,
        freefall: 0.8,
      }[type] ?? 1.5),
  )
  // The lettering hops should clear the title without leaving the frame. They
  // previously used a 320px minimum; keep the lower and freefall arcs
  // unchanged while making these post-second-step hops 25% shorter. The
  // stair-climbing arc is 10% shorter in both its section and creature caps.
  const minimumLift = type === 'upper-platform' || type === 'jump-off' ? 240 : 0
  const lift = Math.max(minimumLift, naturalLift)
  const apexY = Math.min(start.y, end.y) - lift
  const control = {
    x:
      (start.x + end.x) / 2 +
      horizontalDirection *
        Math.min(horizontalDistance * 0.08, creatureSize * 0.7, routeWidth * 0.025),
    y: 2 * apexY - (start.y + end.y) / 2,
  }
  const pointAt = (progress: number): OrangeRoutePoint => ({
    x:
      (1 - progress) ** 2 * start.x +
      2 * (1 - progress) * progress * control.x +
      progress ** 2 * end.x,
    y:
      (1 - progress) ** 2 * start.y +
      2 * (1 - progress) * progress * control.y +
      progress ** 2 * end.y,
  })

  return {
    start,
    apex: pointAt(0.5),
    end,
    control,
  }
}

function setOrangeRouteGeometry() {
  if (!newsletterPanel || !newsletterSignal || !orangeCreature) return

  const route = newsletterPanel.querySelector<HTMLElement>('.newsletter-orange-route')
  const firstPlatform = route?.querySelector<HTMLElement>(
    '.newsletter-orange-platform-first',
  )
  const secondPlatform = route?.querySelector<HTMLElement>(
    '.newsletter-orange-platform-second',
  )
  const footer = newsletterPanel
    .closest('.landing-community-closing')
    ?.querySelector('footer')

  if (!route || !firstPlatform || !secondPlatform || !footer) return

  const routeRect = route.getBoundingClientRect()
  const rootFontSize =
    Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  const creatureSize =
    orangeCreature.offsetWidth ||
    Math.min(
      rootFontSize * 6.5,
      Math.max(rootFontSize * 4.75, window.innerWidth * 0.08),
    )
  const routeHeight = routeRect.height
  const groundTop = footer.getBoundingClientRect().top - routeRect.top - creatureSize
  const startX = -routeRect.left - creatureSize * 1.7
  const edgeX = -routeRect.left - creatureSize
  const pointToRoute = (point: { x: number; y: number }) => ({
    x: point.x - routeRect.left - creatureSize / 2,
    y: point.y - routeRect.top - creatureSize / 2,
  })
  const firstPlatformRect = firstPlatform.getBoundingClientRect()
  const heading = newsletterHeader.querySelector('h2')
  const textWalker = heading
    ? document.createTreeWalker(heading, NodeFilter.SHOW_TEXT)
    : undefined
  let firstTextNode = textWalker?.nextNode()

  while (firstTextNode && !firstTextNode.textContent?.trim()) {
    firstTextNode = textWalker?.nextNode() ?? null
  }

  if (!firstTextNode) return

  const firstLetterRange = document.createRange()
  firstLetterRange.setStart(firstTextNode, 0)
  firstLetterRange.setEnd(firstTextNode, 1)
  const firstLetterRect = firstLetterRange.getBoundingClientRect()
  const headingRect = heading?.getBoundingClientRect()
  const headingFontSize = heading
    ? Number.parseFloat(getComputedStyle(heading).fontSize)
    : 0
  const firstLetterTop =
    Math.max(firstLetterRect.top, headingRect?.top ?? firstLetterRect.top) +
    headingFontSize * 0.1
  const inboxWalker = heading
    ? document.createTreeWalker(heading, NodeFilter.SHOW_TEXT)
    : undefined
  let inboxTextNode = inboxWalker?.nextNode() ?? null
  let inboxTextIndex = inboxTextNode?.textContent?.indexOf('Inbox') ?? -1

  while (inboxTextNode && inboxTextIndex < 0) {
    inboxTextNode = inboxWalker?.nextNode() ?? null
    inboxTextIndex = inboxTextNode?.textContent?.indexOf('Inbox') ?? -1
  }

  if (!inboxTextNode || inboxTextIndex < 0) return

  const inboxLetterRange = document.createRange()
  inboxLetterRange.setStart(inboxTextNode, inboxTextIndex)
  inboxLetterRange.setEnd(inboxTextNode, inboxTextIndex + 1)
  const inboxLetterRect = inboxLetterRange.getBoundingClientRect()
  const setup = {
    ...pointToRoute({
      x: firstPlatformRect.left - creatureSize * 0.8,
      y: firstPlatformRect.top - creatureSize / 2,
    }),
    y: groundTop,
  }
  const firstGround = {
    x: (edgeX + setup.x) / 2,
    y: groundTop,
  }
  const platformLanding = (platform: HTMLElement) => {
    const rect = platform.getBoundingClientRect()

    return pointToRoute({
      x: rect.left + rect.width / 2,
      y: rect.top - creatureSize / 2,
    })
  }
  const firstStep = platformLanding(firstPlatform)
  const secondStep = platformLanding(secondPlatform)
  const firstLetter = pointToRoute({
    x: firstLetterRect.left + firstLetterRect.width / 2,
    y: firstLetterTop - creatureSize / 2,
  })
  const inboxLetter = pointToRoute({
    x: inboxLetterRect.left + inboxLetterRect.width / 2,
    y: firstLetterTop - creatureSize / 2,
  })
  const titleHopSpacing = (inboxLetter.x - firstLetter.x) / 3
  const titleHopRightShift = 40
  const titleHopOne = {
    x: firstLetter.x + titleHopSpacing * 0.97 + titleHopRightShift,
    y: firstLetter.y,
  }
  const titleHopTwo = {
    x: titleHopOne.x + titleHopSpacing * 1.04 + titleHopRightShift,
    y: firstLetter.y,
  }
  const titleHopThree = {
    x: inboxLetter.x + titleHopRightShift * 3 - 32,
    y: firstLetter.y + 6,
  }
  const footerLanding = {
    x: Math.min(titleHopThree.x + creatureSize * 0.9, routeRect.width - creatureSize),
    y: groundTop,
  }
  const lowerPlatformApproach = {
    x: Math.min(firstStep.x + 80, routeRect.width - creatureSize),
    y: groundTop,
  }
  const returnPoint = (progress: number) => ({
    x: footerLanding.x + (lowerPlatformApproach.x - footerLanding.x) * progress,
    y: groundTop,
  })
  const returnHopOne = returnPoint(0.25)
  const returnHopTwo = returnPoint(0.5)
  const returnHopThree = returnPoint(0.75)
  const returnHopFour = returnPoint(1)
  const firstArc = calculateOrangeHopArc(
    { x: edgeX, y: groundTop },
    firstGround,
    routeRect.width,
    routeHeight,
    creatureSize,
    'lower-platform',
  )
  const secondArc = calculateOrangeHopArc(
    firstGround,
    setup,
    routeRect.width,
    routeHeight,
    creatureSize,
    'lower-platform',
  )
  const thirdArc = calculateOrangeHopArc(
    setup,
    firstStep,
    routeRect.width,
    routeHeight,
    creatureSize,
    'lower-platform',
  )
  const lowerPlatformApproachArc = calculateOrangeHopArc(
    lowerPlatformApproach,
    firstStep,
    routeRect.width,
    routeHeight,
    creatureSize,
    'lower-platform',
  )
  const fourthArc = calculateOrangeHopArc(
    firstStep,
    secondStep,
    routeRect.width,
    routeHeight,
    creatureSize,
    'stair-climbing',
  )
  const fifthArc = calculateOrangeHopArc(
    secondStep,
    firstLetter,
    routeRect.width,
    routeHeight,
    creatureSize,
    'upper-platform',
  )
  const sixthArc = calculateOrangeHopArc(
    firstLetter,
    titleHopOne,
    routeRect.width,
    routeHeight,
    creatureSize,
    'jump-off',
  )
  const seventhArc = calculateOrangeHopArc(
    titleHopOne,
    titleHopTwo,
    routeRect.width,
    routeHeight,
    creatureSize,
    'jump-off',
  )
  const eighthArc = calculateOrangeHopArc(
    titleHopTwo,
    titleHopThree,
    routeRect.width,
    routeHeight,
    creatureSize,
    'jump-off',
  )
  const freefallArc = calculateOrangeHopArc(
    titleHopThree,
    footerLanding,
    routeRect.width,
    routeHeight,
    creatureSize,
    'freefall',
  )
  const returnArcOne = calculateOrangeHopArc(
    footerLanding,
    returnHopOne,
    routeRect.width,
    routeHeight,
    creatureSize,
    'lower-platform',
  )
  const returnArcTwo = calculateOrangeHopArc(
    returnHopOne,
    returnHopTwo,
    routeRect.width,
    routeHeight,
    creatureSize,
    'lower-platform',
  )
  const returnArcThree = calculateOrangeHopArc(
    returnHopTwo,
    returnHopThree,
    routeRect.width,
    routeHeight,
    creatureSize,
    'lower-platform',
  )
  const returnArcFour = calculateOrangeHopArc(
    returnHopThree,
    returnHopFour,
    routeRect.width,
    routeHeight,
    creatureSize,
    'lower-platform',
  )
  const values: Record<string, string> = {
    '--newsletter-orange-start-x': `${startX}px`,
    '--newsletter-orange-edge-x': `${edgeX}px`,
    '--newsletter-orange-ground-top': `${groundTop}px`,
    '--newsletter-orange-first-ground-x': `${firstGround.x}px`,
    '--newsletter-orange-setup-x': `${setup.x}px`,
    '--newsletter-orange-setup-y': `${setup.y}px`,
    '--newsletter-orange-intro-apex-x': `${firstArc.apex.x}px`,
    '--newsletter-orange-intro-apex-y': `${firstArc.apex.y}px`,
    '--newsletter-orange-setup-apex-x': `${secondArc.apex.x}px`,
    '--newsletter-orange-setup-apex-y': `${secondArc.apex.y}px`,
    '--newsletter-orange-step-one-x': `${firstStep.x}px`,
    '--newsletter-orange-step-one-y': `${firstStep.y}px`,
    '--newsletter-orange-step-one-apex-x': `${thirdArc.apex.x}px`,
    '--newsletter-orange-step-one-apex-y': `${thirdArc.apex.y}px`,
    '--newsletter-orange-step-two-x': `${secondStep.x}px`,
    '--newsletter-orange-step-two-y': `${secondStep.y}px`,
    '--newsletter-orange-step-two-apex-x': `${fourthArc.apex.x}px`,
    '--newsletter-orange-step-two-apex-y': `${fourthArc.apex.y}px`,
    '--newsletter-orange-letter-x': `${firstLetter.x}px`,
    '--newsletter-orange-letter-y': `${firstLetter.y}px`,
    '--newsletter-orange-letter-apex-x': `${fifthArc.apex.x}px`,
    '--newsletter-orange-letter-apex-y': `${fifthArc.apex.y}px`,
    '--newsletter-orange-title-hop-one-x': `${titleHopOne.x}px`,
    '--newsletter-orange-title-hop-one-y': `${titleHopOne.y}px`,
    '--newsletter-orange-title-hop-one-apex-x': `${sixthArc.apex.x}px`,
    '--newsletter-orange-title-hop-one-apex-y': `${sixthArc.apex.y}px`,
    '--newsletter-orange-title-hop-two-x': `${titleHopTwo.x}px`,
    '--newsletter-orange-title-hop-two-y': `${titleHopTwo.y}px`,
    '--newsletter-orange-title-hop-two-apex-x': `${seventhArc.apex.x}px`,
    '--newsletter-orange-title-hop-two-apex-y': `${seventhArc.apex.y}px`,
    '--newsletter-orange-title-hop-three-x': `${titleHopThree.x}px`,
    '--newsletter-orange-title-hop-three-y': `${titleHopThree.y}px`,
    '--newsletter-orange-title-hop-three-apex-x': `${eighthArc.apex.x}px`,
    '--newsletter-orange-title-hop-three-apex-y': `${eighthArc.apex.y}px`,
    '--newsletter-orange-freefall-apex-x': `${freefallArc.apex.x}px`,
    '--newsletter-orange-freefall-apex-y': `${freefallArc.apex.y}px`,
    '--newsletter-orange-freefall-end-x': `${footerLanding.x}px`,
    '--newsletter-orange-freefall-end-y': `${footerLanding.y}px`,
    '--newsletter-orange-lower-platform-approach-x': `${lowerPlatformApproach.x}px`,
    '--newsletter-orange-lower-platform-approach-y': `${lowerPlatformApproach.y}px`,
    '--newsletter-orange-lower-platform-approach-apex-x': `${lowerPlatformApproachArc.apex.x}px`,
    '--newsletter-orange-lower-platform-approach-apex-y': `${lowerPlatformApproachArc.apex.y}px`,
    '--newsletter-orange-return-one-x': `${returnHopOne.x}px`,
    '--newsletter-orange-return-one-y': `${returnHopOne.y}px`,
    '--newsletter-orange-return-one-apex-x': `${returnArcOne.apex.x}px`,
    '--newsletter-orange-return-one-apex-y': `${returnArcOne.apex.y}px`,
    '--newsletter-orange-return-two-x': `${returnHopTwo.x}px`,
    '--newsletter-orange-return-two-y': `${returnHopTwo.y}px`,
    '--newsletter-orange-return-two-apex-x': `${returnArcTwo.apex.x}px`,
    '--newsletter-orange-return-two-apex-y': `${returnArcTwo.apex.y}px`,
    '--newsletter-orange-return-three-x': `${returnHopThree.x}px`,
    '--newsletter-orange-return-three-y': `${returnHopThree.y}px`,
    '--newsletter-orange-return-three-apex-x': `${returnArcThree.apex.x}px`,
    '--newsletter-orange-return-three-apex-y': `${returnArcThree.apex.y}px`,
    '--newsletter-orange-return-four-x': `${returnHopFour.x}px`,
    '--newsletter-orange-return-four-y': `${returnHopFour.y}px`,
    '--newsletter-orange-return-four-apex-x': `${returnArcFour.apex.x}px`,
    '--newsletter-orange-return-four-apex-y': `${returnArcFour.apex.y}px`,
  }

  for (const [property, value] of Object.entries(values)) {
    newsletterPanel.style.setProperty(property, value)
  }
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
  const signalRect = newsletterSignal.getBoundingClientRect()
  const obstacles = getCollectorObstacles()
  const startingPoints = [
    { x: 14, y: signalRect.height - 58 },
    { x: signalRect.width - 58, y: 14 },
    { x: signalRect.width - 58, y: signalRect.height - 58 },
  ].filter(point => !pointIsBlocked(point, obstacles))
  const timers = new Set<number>()
  // Use the layout width rather than the transformed box while GOD is moving;
  // the latter can briefly shrink to a few pixels and make the scavengers
  // render as dots.
  const maximumCollectorSize = Math.max(
    orangeCreature.offsetWidth,
    Number.parseFloat(getComputedStyle(orangeCreature).width) || 0,
  )
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
  const godMode = new URLSearchParams(window.location.search).get('godMode') === 'true'
  const compactViewport = window.matchMedia('(max-width: 900px)')
  let activeFreefallSpinStart = 6120
  let loopFreefallSpinStart = 12600
  let returnSpinStart = 8640
  let lowerLandingSpinStart = 8640
  let returnAdvanceTimer = 0
  let startOrangeLoop = () => {}
  const getAnimationName = (animation: Animation) =>
    'animationName' in animation ? String(animation.animationName) : ''

  const startOrangeFreefall = (spinStart: number) => {
    if (!isNewsletterActive) return

    activeFreefallSpinStart = spinStart
    orangeCreature.style.setProperty(
      '--newsletter-orange-freefall-spin-start',
      `${spinStart}deg`,
    )

    orangeCreature.style.animation = `
      newsletter-orange-freefall var(--newsletter-orange-freefall-duration) linear both,
      newsletter-orange-freefall-spin var(--newsletter-orange-freefall-duration) linear both
    `
  }
  const startOrangeReturn = (spinStart: number) => {
    if (!isNewsletterActive) return

    window.clearTimeout(returnAdvanceTimer)
    returnSpinStart = spinStart
    orangeCreature.style.setProperty(
      '--newsletter-orange-return-spin-start',
      `${spinStart}deg`,
    )
    orangeCreature.style.animation = `
      newsletter-orange-return var(--newsletter-orange-return-duration) linear both,
      newsletter-orange-return-spin var(--newsletter-orange-return-duration) linear both
    `

    const returnDuration =
      Number.parseFloat(
        getComputedStyle(orangeCreature).getPropertyValue(
          '--newsletter-orange-return-duration',
        ),
      ) * 1000
    returnAdvanceTimer = window.setTimeout(
      () => {
        if (
          isNewsletterActive &&
          [...orangeCreature.getAnimations()].some(
            animation => getAnimationName(animation) === 'newsletter-orange-return',
          )
        ) {
          startOrangeLoop()
        }
      },
      Math.max(0, returnDuration - 2000),
    )
  }
  const startOrangeLowerLanding = (spinStart: number) => {
    if (!isNewsletterActive) return

    lowerLandingSpinStart = spinStart
    orangeCreature.style.setProperty(
      '--newsletter-orange-lower-landing-spin-start',
      `${spinStart}deg`,
    )
    orangeCreature.style.animation = `
      newsletter-orange-lower-landing
        var(--newsletter-orange-lower-landing-duration) linear both,
      newsletter-orange-lower-landing-spin
        var(--newsletter-orange-lower-landing-duration) linear both
    `
  }
  startOrangeLoop = () => {
    if (!isNewsletterActive) return

    window.clearTimeout(returnAdvanceTimer)
    const loopSpinStart = returnSpinStart - 5760
    loopFreefallSpinStart = loopSpinStart - 360
    orangeCreature.style.setProperty(
      '--newsletter-orange-loop-spin-start',
      `${loopSpinStart}deg`,
    )
    orangeCreature.style.animation = `
      newsletter-orange-loop var(--newsletter-orange-loop-duration) linear both,
      newsletter-orange-loop-spin var(--newsletter-orange-loop-duration) linear both,
      newsletter-orange-loop-freefall-trigger
        var(--newsletter-orange-loop-freefall-trigger-duration) linear both
    `
  }
  const handleOrangeAnimationEnd = (event: AnimationEvent) => {
    if (event.animationName === 'newsletter-orange-freefall-trigger') {
      startOrangeFreefall(6120)
    }
    if (event.animationName === 'newsletter-orange-loop-freefall-trigger') {
      startOrangeFreefall(loopFreefallSpinStart)
    }
    if (event.animationName === 'newsletter-orange-freefall') {
      startOrangeLowerLanding(activeFreefallSpinStart + 1080)
    }
    if (event.animationName === 'newsletter-orange-lower-landing') {
      startOrangeReturn(lowerLandingSpinStart)
    }
    if (event.animationName === 'newsletter-orange-return') {
      startOrangeLoop()
    }
  }
  orangeCreature.addEventListener('animationend', handleOrangeAnimationEnd)
  let bearingAnimationFrame = 0
  let bearingPhysicsRunning = false
  let bearingStates: OrangeBearingState[] = []
  let lastBearingFrameTime = 0
  let lastGodTop: number | undefined
  let lastGodVerticalVelocity = 0
  let lastGodRotation: number | undefined
  let lastGodRotationDelta = 0
  let godSpinDirection: 1 | -1 = 1
  let godWasAscending = false

  const bearingKickDirections = [1, -1, 1, -1]

  const initialiseBearingPhysics = () => {
    if (bearingStates.length > 0 || !orangeCreature) return

    const elements = Array.from(
      orangeCreature.querySelectorAll<HTMLSpanElement>('.newsletter-orange-bearing'),
    )
    const initialAngles = [0.28, 1.96, 3.72, 5.08]
    const initialVelocities = [1.1, -0.85, 0.72, -1.2]
    const restAngles = [Math.PI - 0.48, Math.PI - 0.16, Math.PI + 0.16, Math.PI + 0.48]

    bearingStates = elements.map((element, index) => ({
      angle: initialAngles[index] ?? index * (Math.PI / 2),
      angularVelocity: initialVelocities[index] ?? 0,
      restAngle: restAngles[index] ?? Math.PI,
      element,
    }))
  }

  const readGodTop = () => {
    const top = Number.parseFloat(getComputedStyle(orangeCreature).top)
    return Number.isFinite(top) ? top : orangeCreature.offsetTop
  }

  const renderBearingPhysics = () => {
    // GOD rotates during every hop. Its transformed bounding box therefore
    // grows towards the square's diagonal; using that box here would make
    // the bearings leave the track whenever GOD turns. Use the layout width,
    // which stays constant while the creature spins.
    const diameter = orangeCreature?.offsetWidth ?? 0
    // The outermost repeating radial line is centred at 88.5% of GOD's
    // radius, so the bearing centreline is 44.25% of its diameter.
    const radius = diameter * -0.4425

    for (const bearing of bearingStates) {
      bearing.element.style.transform = `translate(-50%, -50%) rotate(${bearing.angle}rad) translateY(${radius}px)`
    }
  }

  const isLowerPlatformMotionActive = () =>
    [...orangeCreature.getAnimations()].some(animation =>
      ['newsletter-orange-return', 'newsletter-orange-loop'].includes(
        getAnimationName(animation),
      ),
    )

  const kickBearingsOnLanding = (
    direction: 1 | -1 = godSpinDirection,
    momentumScale = 1,
  ) => {
    for (const [index, bearing] of bearingStates.entries()) {
      bearing.angularVelocity +=
        (index % 2 === 0 ? 1 : -1) * (2.8 + index * 0.35) * momentumScale
      bearing.angularVelocity += direction * (1.5 + index * 0.15) * momentumScale
      bearing.angle += (index % 2 === 0 ? 1 : -1) * 0.06
    }
  }

  const stepBearingPhysics = (time: number) => {
    if (!bearingPhysicsRunning) return

    const deltaTime = Math.min(
      0.05,
      Math.max(0.001, (time - lastBearingFrameTime) / 1000),
    )
    lastBearingFrameTime = time
    const godStyle = getComputedStyle(orangeCreature)
    const godTop = readGodTop()
    const godVerticalVelocity =
      lastGodTop === undefined ? 0 : (godTop - lastGodTop) / deltaTime
    const rotationValue = godStyle.rotate
    const rotationMatch = rotationValue.match(/-?\d+(?:\.\d+)?/)
    const godRotation = rotationMatch ? Number(rotationMatch[0]) : undefined
    if (godRotation !== undefined && lastGodRotation !== undefined) {
      const rotationDelta = godRotation - lastGodRotation
      if (Math.abs(rotationDelta) > 0.01) {
        lastGodRotationDelta = rotationDelta
        godSpinDirection = rotationDelta >= 0 ? 1 : -1
      }
    }
    const godIsAscending = lastGodTop !== undefined && godTop < lastGodTop - 0.15
    const godHasJumped = godIsAscending && !godWasAscending
    const godHasLanded = lastGodVerticalVelocity > 0.08 && godVerticalVelocity <= 0.02
    const lowerPlatformMotion = isLowerPlatformMotionActive()

    if (godHasJumped) {
      spawnDataPacketsForGodJump(godSpinDirection)
      const spinKick = lowerPlatformMotion
        ? Math.min(14, Math.max(5.5, Math.abs(lastGodRotationDelta) * 0.5))
        : Math.min(6, Math.max(2.2, Math.abs(lastGodRotationDelta) * 0.28))
      for (const [index, bearing] of bearingStates.entries()) {
        bearing.angularVelocity +=
          (bearingKickDirections[index] ?? 1) *
          (spinKick + index * 0.25) *
          (lowerPlatformMotion ? 1.7 : 1)
      }
    }
    if (godHasLanded) {
      kickBearingsOnLanding(godSpinDirection, lowerPlatformMotion ? 1.7 : 1)
    }

    lastGodTop = godTop
    lastGodVerticalVelocity = godVerticalVelocity
    lastGodRotation = godRotation
    godWasAscending = godIsAscending

    // Gravity points toward the bottom of the ring (pi radians). Damping
    // removes energy on each pass, so a bearing cannot freeze at an arbitrary
    // point in the band as a finite CSS keyframe animation can.
    const gravity = lowerPlatformMotion ? 5.8 : 8.4
    const damping = lowerPlatformMotion ? 0.16 : 0.55

    for (const bearing of bearingStates) {
      const angleFromRest = bearing.angle - bearing.restAngle
      bearing.angularVelocity -= Math.sin(angleFromRest) * gravity * deltaTime
      bearing.angularVelocity *= Math.exp(-damping * deltaTime)
      bearing.angle += bearing.angularVelocity * deltaTime
    }

    // Keep the small bearings from occupying the same point while they settle.
    // This is a soft collision: it separates overlapping balls and exchanges a
    // little momentum without making them look mechanically spaced.
    const minimumGap = 0.3
    for (let firstIndex = 0; firstIndex < bearingStates.length; firstIndex += 1) {
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < bearingStates.length;
        secondIndex += 1
      ) {
        const first = bearingStates[firstIndex]
        const second = bearingStates[secondIndex]
        if (!first || !second) continue

        const difference = Math.atan2(
          Math.sin(second.angle - first.angle),
          Math.cos(second.angle - first.angle),
        )
        const distance = Math.abs(difference)
        if (distance >= minimumGap) continue

        const direction = difference >= 0 ? 1 : -1
        const correction = (minimumGap - distance) * 0.5
        first.angle -= direction * correction
        second.angle += direction * correction
        first.angularVelocity -= direction * 0.12
        second.angularVelocity += direction * 0.12
      }
    }

    renderBearingPhysics()
    bearingAnimationFrame = window.requestAnimationFrame(stepBearingPhysics)
  }

  startOrangeBearingPhysics = () => {
    if (bearingPhysicsRunning) return

    initialiseBearingPhysics()
    bearingPhysicsRunning = true
    lastBearingFrameTime = performance.now()
    lastGodTop = readGodTop()
    lastGodVerticalVelocity = 0
    lastGodRotation = undefined
    lastGodRotationDelta = 0
    godWasAscending = false
    renderBearingPhysics()
    bearingAnimationFrame = window.requestAnimationFrame(stepBearingPhysics)
  }

  stopOrangeBearingPhysics = () => {
    bearingPhysicsRunning = false
    window.cancelAnimationFrame(bearingAnimationFrame)
    bearingAnimationFrame = 0
    lastGodTop = undefined
    lastGodVerticalVelocity = 0
    lastGodRotation = undefined
    lastGodRotationDelta = 0
    godSpinDirection = 1
    godWasAscending = false
  }

  type CollectorBearingState = {
    angle: number
    angularVelocity: number
    restAngle: number
    collectorId: number
    element: HTMLSpanElement
    previousX: number
    previousY: number
    previousVelocityX: number
    previousVelocityY: number
    previousRotation: number
  }

  let collectorBearingAnimationFrame = 0
  let collectorBearingPhysicsRunning = false
  let lastCollectorBearingFrameTime = 0
  let collectorBearingStates: CollectorBearingState[] = []

  const shortestAngleDifference = (current: number, previous: number) => {
    let difference = current - previous

    while (difference > 180) difference -= 360
    while (difference < -180) difference += 360

    return difference
  }

  const initialiseCollectorBearingPhysics = () => {
    if (collectorBearingStates.length > 0) return

    const states = greenCreatureStates.flatMap(collector => {
      const element = collectorBearingElements[collector.id]
      const collectorElement = collectorElements[collector.id]

      if (!element || !collectorElement) return []

      const bounds = collectorElement.getBoundingClientRect()

      return [
        {
          angle: Math.PI + randomBetween(-0.24, 0.24),
          angularVelocity: randomBetween(-0.45, 0.45),
          restAngle: Math.PI,
          collectorId: collector.id,
          element,
          previousX: bounds.left + bounds.width / 2,
          previousY: bounds.top + bounds.height / 2,
          previousVelocityX: 0,
          previousVelocityY: 0,
          previousRotation: collector.rotation,
        },
      ]
    })

    if (states.length === greenCreatureStates.length) {
      collectorBearingStates = states
    }
  }

  const renderCollectorBearingPhysics = () => {
    for (const bearing of collectorBearingStates) {
      const collector = greenCreatureStates.find(
        state => state.id === bearing.collectorId,
      )

      if (!collector) continue

      const radius = Math.max(4, collector.size * 0.31)
      bearing.element.style.transform = `translate(-50%, -50%) rotate(${bearing.angle}rad) translateY(${-radius}px)`
    }
  }

  const stepCollectorBearingPhysics = (time: number) => {
    if (!collectorBearingPhysicsRunning) return

    const deltaTime = Math.min(
      0.05,
      Math.max(0.001, (time - lastCollectorBearingFrameTime) / 1000),
    )
    lastCollectorBearingFrameTime = time

    initialiseCollectorBearingPhysics()

    for (const bearing of collectorBearingStates) {
      const collector = greenCreatureStates.find(
        state => state.id === bearing.collectorId,
      )
      const collectorElement = collector && collectorElements[collector.id]

      if (!collector || !collectorElement) continue

      const bounds = collectorElement.getBoundingClientRect()
      const centreX = bounds.left + bounds.width / 2
      const centreY = bounds.top + bounds.height / 2
      const velocityX = (centreX - bearing.previousX) / deltaTime
      const velocityY = (centreY - bearing.previousY) / deltaTime
      const accelerationX = (velocityX - bearing.previousVelocityX) / deltaTime
      const accelerationY = (velocityY - bearing.previousVelocityY) / deltaTime
      const rotationVelocity =
        (shortestAngleDifference(collector.rotation, bearing.previousRotation) *
          Math.PI) /
        180 /
        deltaTime

      // The ball is pulled towards the bottom of the shell, while movement and
      // rotation create the opposing inertial force that makes it roll loose.
      const tangentX = Math.cos(bearing.angle)
      const tangentY = Math.sin(bearing.angle)
      const inertialTorque =
        ((-accelerationX * tangentX - accelerationY * tangentY) /
          Math.max(collector.size, 1)) *
        0.42

      bearing.angularVelocity += inertialTorque * deltaTime
      bearing.angularVelocity -= rotationVelocity * 0.18
      bearing.angularVelocity -=
        Math.sin(bearing.angle - bearing.restAngle) * 8.4 * deltaTime
      bearing.angularVelocity *= Math.exp(-0.58 * deltaTime)
      bearing.angle += bearing.angularVelocity * deltaTime
      bearing.previousX = centreX
      bearing.previousY = centreY
      bearing.previousVelocityX = velocityX
      bearing.previousVelocityY = velocityY
      bearing.previousRotation = collector.rotation
    }

    renderCollectorBearingPhysics()
    collectorBearingAnimationFrame = window.requestAnimationFrame(
      stepCollectorBearingPhysics,
    )
  }

  startCollectorBearingPhysics = () => {
    if (collectorBearingPhysicsRunning) return

    collectorBearingPhysicsRunning = true
    lastCollectorBearingFrameTime = performance.now()
    initialiseCollectorBearingPhysics()
    renderCollectorBearingPhysics()
    collectorBearingAnimationFrame = window.requestAnimationFrame(
      stepCollectorBearingPhysics,
    )
  }

  stopCollectorBearingPhysics = () => {
    collectorBearingPhysicsRunning = false
    window.cancelAnimationFrame(collectorBearingAnimationFrame)
    collectorBearingAnimationFrame = 0
  }

  const syncAnimationState = () => {
    const shouldAnimate =
      isPanelIntersecting &&
      (godMode || (!document.hidden && isWindowFocused)) &&
      !compactViewport.matches &&
      hasOrangeAnimationSpace &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    isNewsletterActive = shouldAnimate

    if (shouldAnimate) {
      startOrangeBearingPhysics()
      startCollectorBearingPhysics()
      startPacketCycles()
      startCollectors()
    } else {
      orangeCreature.style.animation = ''
      stopOrangeBearingPhysics()
      stopCollectorBearingPhysics()
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
  const resizeObserver = new ResizeObserver(() => {
    const hasSpace = newsletterPanel.getBoundingClientRect().height >= 512

    if (!hasSpace) {
      hasOrangeAnimationSpace = false
      syncAnimationState()
      return
    }

    hasOrangeAnimationSpace = false
    window.requestAnimationFrame(() => {
      setOrangeRouteGeometry()
      hasOrangeAnimationSpace = true
      syncAnimationState()
    })
  })
  resizeObserver.observe(newsletterPanel)
  hasOrangeAnimationSpace = false
  const refreshOrangeRoute = () => {
    setOrangeRouteGeometry()
  }
  window.addEventListener('resize', refreshOrangeRoute)
  window.addEventListener('load', refreshOrangeRoute)
  void document.fonts.ready.then(refreshOrangeRoute)
  const initialRouteRefresh = window.setTimeout(() => {
    setOrangeRouteGeometry()
    hasOrangeAnimationSpace = newsletterPanel.getBoundingClientRect().height >= 512
    syncAnimationState()
  }, 1000)
  document.addEventListener('visibilitychange', syncAnimationState)
  window.addEventListener('focus', handleWindowFocus)
  window.addEventListener('blur', handleWindowBlur)
  compactViewport.addEventListener('change', syncAnimationState)

  return () => {
    observer.disconnect()
    resizeObserver.disconnect()
    window.removeEventListener('resize', refreshOrangeRoute)
    window.removeEventListener('load', refreshOrangeRoute)
    window.clearTimeout(initialRouteRefresh)
    document.removeEventListener('visibilitychange', syncAnimationState)
    window.removeEventListener('focus', handleWindowFocus)
    window.removeEventListener('blur', handleWindowBlur)
    compactViewport.removeEventListener('change', syncAnimationState)
    orangeCreature?.removeEventListener('animationend', handleOrangeAnimationEnd)
    stopPacketCycles()
    stopCollectors()
    stopOrangeBearingPhysics()
    stopCollectorBearingPhysics()
    window.clearTimeout(returnAdvanceTimer)
  }
})
</script>

<div class="landing-newsletter overflow-hidden scroll-mt-22">
  <div
    class="newsletter-panel"
    class:newsletter-panel-active={isNewsletterActive}
    class:newsletter-panel-animation-disabled={!hasOrangeAnimationSpace}
    bind:this={newsletterPanel}
  >
    <CommunitySectionEcosystem
      packets={activeDataPackets}
      collectors={greenCreatureStates}
      {packetElements}
      {collectorElements}
      {collectorBearingElements}
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
  max-width: var(--spacing-container-max);
  grid-template-columns: minmax(0, 1fr) minmax(22rem, 0.82fr);
  gap: clamp(2rem, 6vw, 6rem);
  align-items: center;
  justify-content: flex-start;
  margin-inline: auto;
  padding: clamp(1.5rem, 2svh, 2rem) 1.5rem clamp(2rem, 4svh, 4rem);
  isolation: isolate;
}

.landing-newsletter {
  --newsletter-highlight: var(--on-tertiary-container);
  position: relative;
  width: min(100%, var(--spacing-container-max));
  margin-inline: auto;
  border: 1px solid color-mix(in srgb, var(--outline-variant) 72%, transparent);
  border-radius: 1.75rem;
  background: color-mix(in srgb, var(--surface-container-lowest) 88%, var(--surface));
  box-shadow: 0 1.5rem 4rem rgb(0 0 0 / 0.1);
  isolation: isolate;
}

.landing-newsletter::before {
  position: absolute;
  inset: 0;
  z-index: 0;
  content: "";
  opacity: 0.5;
  background-image: radial-gradient(
    circle at 1px 1px,
    color-mix(in srgb, var(--newsletter-highlight) 24%, transparent) 1px,
    transparent 0
  );
  background-size: 1.5rem 1.5rem;
  mask-image: linear-gradient(90deg, transparent, black 20% 80%, transparent);
  pointer-events: none;
}

:global(.newsletter-panel .newsletter-orange-route) {
  translate: 0 -1rem;
}

@media (min-width: 768px) {
  .newsletter-panel {
    padding: clamp(1.5rem, 2.5svh, 2.5rem) 2rem clamp(2rem, 4svh, 4rem);
  }
}

@media (min-width: 901px) {
  .landing-newsletter {
    z-index: 1;
    /* The silhouette spans 92.25% of its clipped box, leaving its visible
       edges at a 10vw viewport inset. */
    width: 86.72vw;
    height: 100%;
    min-height: 33rem;
    margin-block: 0;
    overflow: visible;
    border-color: transparent;
    background: transparent;
    box-shadow: none;
    transform-origin: 50% 50%;
    clip-path: none;
  }

  .landing-newsletter::before,
  .landing-newsletter::after {
    position: absolute;
    inset: 0 0 -20%;
    content: "";
    clip-path: shape(
      from 50.59% 4.44%,
      curve to 60.68% 5.94% with 55.51% 6.35%,
      smooth to 70.78% 7.21%,
      smooth to 77.49% 14.53%,
      smooth to 83.26% 22.92%,
      smooth to 90.63% 29.51%,
      smooth to 96.51% 38.09%,
      smooth to 95.29% 47.91%,
      smooth to 94.61% 58.55%,
      smooth to 93.88% 68.14%,
      smooth to 85.34% 74.52%,
      smooth to 77.84% 80.58%,
      smooth to 71.39% 87.11%,
      smooth to 63.40% 92.61%,
      smooth to 54.17% 95.77%,
      smooth to 44.64% 93.96%,
      smooth to 35.24% 91.08%,
      smooth to 25.15% 89.36%,
      smooth to 16.79% 83.99%,
      smooth to 12.38% 74.78%,
      smooth to 10.31% 65.13%,
      smooth to 9.68% 55.98%,
      smooth to 7.08% 46.59%,
      smooth to 4.26% 36.25%,
      smooth to 9.45% 28.00%,
      smooth to 16.19% 19.91%,
      smooth to 22.64% 12.99%,
      smooth to 32.38% 10.40%,
      smooth to 41.39% 5.98%,
      smooth to 50.59% 4.44%
    );
  }

  .landing-newsletter::before {
    z-index: -1;
  }

  .landing-newsletter::after {
    z-index: -2;
    border: 1px solid color-mix(in srgb, var(--outline-variant) 72%, transparent);
    border-radius: 1.75rem;
    background: color-mix(in srgb, var(--surface-container-lowest) 88%, var(--surface));
    box-shadow: 0 1.5rem 4rem rgb(0 0 0 / 0.1);
    pointer-events: none;
  }

  .newsletter-panel {
    height: 100%;
    grid-template-columns: 1fr;
    gap: 1rem;
    align-content: center;
    justify-items: center;
    padding: clamp(4rem, 5.5vw, 5.5rem);
    text-align: center;
    z-index: 1;
  }

  .newsletter-panel :global(.landing-section-header) {
    position: relative;
    z-index: 1;
    width: min(100%, 50rem);
  }

  .newsletter-panel :global(.newsletter-content) {
    position: relative;
    z-index: 1;
    width: min(100%, 34rem);
  }

  .newsletter-panel :global(.landing-section-header h2) {
    max-width: none;
    font-size: clamp(1.85rem, 2.35vw, 2.5rem);
    white-space: nowrap;
  }
}

@media (max-width: 900px) {
  .landing-newsletter {
    width: calc(100% - 3rem);
    border-radius: 1.6rem;
  }

  .newsletter-panel {
    grid-template-columns: 1fr;
    gap: 0;
    padding: 1.25rem;
  }

  .newsletter-panel :global(.newsletter-content) {
    margin-top: -0.75rem;
  }
}

@media (min-width: 37.5rem) and (max-width: 900px) {
  .newsletter-panel {
    text-align: center;
  }

  .newsletter-panel :global(.landing-section-header) {
    width: 100%;
    text-align: center;
  }

  .newsletter-panel :global(.landing-section-header h2) {
    max-width: none;
    white-space: nowrap;
  }

  .newsletter-panel :global(.landing-section-header p) {
    max-width: none;
  }
}
</style>
