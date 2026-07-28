<script lang="ts">
import type { SourceFlowInput } from './sourceFlowMapTypes'

type ConnectorGeometry = {
  inputY: number[]
  outputY: number
  lineEnd: number
}

type Props = {
  groupElement: HTMLElement | undefined
  inputs: SourceFlowInput[]
}

let { groupElement, inputs }: Props = $props()
let geometry = $state<ConnectorGeometry>()
let stackedGeometry = $state<ConnectorGeometry>()
let stackedArrowHalfHeight = $state(2.625)

const defaultConnectorY = (inputCount: number, inputIndex: number) => {
  const cardHeight = 5.65
  const rowHeight = 6.4
  const flowHeight = Math.max(
    cardHeight,
    inputCount * rowHeight - (rowHeight - cardHeight),
  )
  const outputY = (cardHeight / 2 / flowHeight) * 100
  const inputY = ((cardHeight / 2 + inputIndex * rowHeight) / flowHeight) * 100

  return { inputY, outputY }
}

const fallbackGeometry = (inputCount: number): ConnectorGeometry => ({
  inputY: Array.from(
    { length: inputCount },
    (_, inputIndex) => defaultConnectorY(inputCount, inputIndex).inputY,
  ),
  outputY: defaultConnectorY(inputCount, 0).outputY,
  lineEnd: 145,
})

const connectorPath = (
  inputY: number,
  outputY: number,
  lineEnd: number,
  isPrimary: boolean,
) => {
  if (isPrimary) return `M 0 ${outputY} H ${lineEnd}`

  const joinX = 72 + 150 * 0.09
  return `M 0 ${inputY} C 34 ${inputY}, 42 ${outputY}, ${joinX} ${outputY}`
}

const fallbackStackedGeometry = (inputCount: number): ConnectorGeometry => {
  const pointsByCount = {
    1: { inputY: [34], outputY: 76 },
    2: { inputY: [18, 56], outputY: 86 },
    3: { inputY: [13, 39, 65], outputY: 90 },
    4: { inputY: [10, 29, 48, 67], outputY: 92 },
  } as const

  const points = pointsByCount[Math.min(Math.max(inputCount, 1), 4) as 1 | 2 | 3 | 4]
  return { inputY: [...points.inputY], outputY: points.outputY, lineEnd: 0 }
}

const stackedInputPath = (inputY: number) => `M 36 ${inputY} H 14`

const stackedTrunkPath = (inputY: number, outputY: number) =>
  `M 14 ${inputY} V ${outputY} H 27.25`

const stackedArrowPath = (outputY: number, arrowHalfHeight: number) =>
  `M 27.25 ${outputY - arrowHalfHeight} L 36 ${outputY} L 27.25 ${outputY + arrowHalfHeight} Z`

$effect(() => {
  const laneElement = groupElement
  const inputCount = inputs.length
  if (!laneElement) return

  const measure = () => {
    const connectorElement = laneElement.querySelector<SVGElement>(
      '.source-flow-connectors',
    )
    const stackedConnectorElement = laneElement.querySelector<SVGElement>(
      '.source-flow-stacked-connectors',
    )
    const outputElement = laneElement.querySelector<HTMLElement>('.source-flow-output')
    const inputElements = Array.from(
      laneElement.querySelectorAll<HTMLElement>('.source-flow-input'),
    )
    if (!inputElements.length) return

    const inputRects = inputElements.map(input => input.getBoundingClientRect())
    if (connectorElement) {
      const connectorRect = connectorElement.getBoundingClientRect()
      if (connectorRect.height) {
        const inputY = inputRects.map(
          input =>
            ((input.top + input.height / 2 - connectorRect.top) /
              connectorRect.height) *
            100,
        )
        geometry = {
          inputY,
          outputY: inputY[0] ?? 0,
          lineEnd: 150 - (5 / connectorRect.width) * 150,
        }
      }
    }

    if (stackedConnectorElement && outputElement) {
      const stackedConnectorRect = stackedConnectorElement.getBoundingClientRect()
      const outputRect = outputElement.getBoundingClientRect()
      if (stackedConnectorRect.height) {
        const relativeY = (rect: DOMRect) =>
          ((rect.top + rect.height / 2 - stackedConnectorRect.top) /
            stackedConnectorRect.height) *
          100
        stackedGeometry = {
          inputY: inputRects.map(relativeY),
          outputY: relativeY(outputRect),
          lineEnd: 0,
        }
        stackedArrowHalfHeight = (8 / stackedConnectorRect.height) * 100
      }
    }
  }

  geometry = fallbackGeometry(inputCount)
  stackedGeometry = fallbackStackedGeometry(inputCount)
  const frame = requestAnimationFrame(measure)
  const observer = new ResizeObserver(measure)
  observer.observe(laneElement)

  return () => {
    cancelAnimationFrame(frame)
    observer.disconnect()
  }
})

let displayedGeometry = $derived(geometry ?? fallbackGeometry(inputs.length))
let displayedStackedGeometry = $derived(
  stackedGeometry ?? fallbackStackedGeometry(inputs.length),
)
</script>

<svg
  class="source-flow-connectors"
  viewBox="0 0 150 100"
  preserveAspectRatio="none"
  aria-hidden="true"
>
  {#each inputs as input, inputIndex (input.id)}
    <path
      class="source-flow-path"
      d={connectorPath(
        displayedGeometry.inputY[inputIndex] ?? displayedGeometry.outputY,
        displayedGeometry.outputY,
        displayedGeometry.lineEnd,
        inputIndex === 0,
      )}
    ></path>
  {/each}
</svg>

<svg
  class="source-flow-stacked-connectors"
  viewBox="0 0 36 100"
  preserveAspectRatio="none"
  aria-hidden="true"
>
  {#each inputs as input, inputIndex (input.id)}
    <path
      class="source-flow-stacked-input"
      d={stackedInputPath(
        displayedStackedGeometry.inputY[inputIndex] ?? displayedStackedGeometry.outputY,
      )}
    ></path>
  {/each}
  <path
    class="source-flow-stacked-trunk"
    d={stackedTrunkPath(
      displayedStackedGeometry.inputY[0] ?? displayedStackedGeometry.outputY,
      displayedStackedGeometry.outputY,
    )}
  ></path>
  <path
    class="source-flow-stacked-arrow"
    d={stackedArrowPath(
      displayedStackedGeometry.outputY,
      stackedArrowHalfHeight,
    )}
  ></path>
</svg>

<span class="source-flow-arrow-head" aria-hidden="true"></span>

<style>
.source-flow-connectors {
  grid-column: 2;
  grid-row: 1;
  z-index: 0;
  width: calc(100% + 1.25rem);
  height: max(5.65rem, calc(var(--visible-source-count) * 6.4rem - 0.75rem));
  align-self: start;
  margin-left: -1.25rem;
  overflow: visible;
}
.source-flow-stacked-connectors {
  display: none;
}
.source-flow-arrow-head {
  grid-column: 3;
  grid-row: 1;
  z-index: 2;
  width: 0;
  height: 0;
  align-self: start;
  justify-self: start;
  margin-left: calc(-0.5rem - 16px);
  border-top: 0.4rem solid transparent;
  border-bottom: 0.4rem solid transparent;
  border-left: 0.5rem solid var(--flow-connector);
  transform: translateY(2.95rem);
  filter: drop-shadow(
    0 0 0.2rem color-mix(in srgb, var(--flow-connector) 32%, transparent)
  );
  pointer-events: none;
}
.source-flow-path,
.source-flow-stacked-input,
.source-flow-stacked-trunk {
  fill: none;
  stroke: var(--flow-connector);
  stroke-width: 1.55;
  stroke-linecap: round;
  stroke-dasharray: 6 8;
  opacity: 0.78;
  animation: source-flow-dash 3.8s linear infinite;
  animation-delay: calc(var(--flow-index) * -360ms);
  filter: drop-shadow(
    0 0 0.35rem color-mix(in srgb, var(--flow-connector) 22%, transparent)
  );
}
.source-flow-path {
  vector-effect: non-scaling-stroke;
}
.source-flow-stacked-input,
.source-flow-stacked-trunk,
.source-flow-stacked-arrow {
  display: none;
}
.source-flow-stacked-input,
.source-flow-stacked-trunk {
  stroke: var(--flow-connector);
  vector-effect: non-scaling-stroke;
  filter: drop-shadow(
    0 0 0.35rem color-mix(in srgb, var(--flow-connector) 22%, transparent)
  );
}
.source-flow-stacked-arrow {
  fill: var(--flow-connector);
  filter: drop-shadow(
    0 0 0.2rem color-mix(in srgb, var(--flow-connector) 32%, transparent)
  );
}
@keyframes source-flow-dash {
  to {
    stroke-dashoffset: -28;
  }
}
@keyframes source-flow-arrow-bob {
  to {
    transform: translateX(2px);
  }
}
@media (max-width: 900px) {
  .source-flow-connectors,
  .source-flow-arrow-head {
    display: none;
  }
  .source-flow-stacked-connectors {
    position: absolute;
    top: 0;
    bottom: 0;
    left: -1.25rem;
    z-index: 0;
    display: block;
    width: 2.25rem;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }
  .source-flow-path {
    display: none;
  }
  .source-flow-stacked-input,
  .source-flow-stacked-trunk {
    display: block;
    stroke-width: 3;
  }
  .source-flow-stacked-arrow {
    display: block;
    animation: source-flow-arrow-bob 1.2s ease-in-out infinite alternate;
    transform-box: fill-box;
    transform-origin: center;
  }
}
</style>
