export type ActiveDataPacket = {
  id: number
  label: string
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

export type GreenCreatureState = {
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

export type Obstacle = {
  left: number
  top: number
  right: number
  bottom: number
}
