<script lang="ts">
export type SourceFlowInput = {
  id: string
  publisher: string
  source: string
  href?: string
  icon?: string
  fallbackIcon?: string
  accent: string
  iconTone?: 'light' | 'hkgov' | 'diana'
  fields?: Array<{
    label: string
    value: string
  }>
  status?: string
}

export type SourceFlowLane = {
  id: string
  label: string
  href: string
  accent: string
  secondary: string
  ink: string
  image: string
  inputs: SourceFlowInput[]
}

let { lanes }: { lanes: SourceFlowLane[] } = $props()

const connectorPath = (inputCount: number, inputIndex: number) => {
  const outputY = 50
  const inputYByCount = {
    1: [50],
    2: [32, 68],
    3: [22, 50, 78],
  } as const
  const inputY =
    inputYByCount[Math.min(Math.max(inputCount, 1), 3) as 1 | 2 | 3][inputIndex] ??
    outputY

  return `M 4 ${inputY} C 34 ${inputY}, 42 ${outputY}, 72 ${outputY} S 114 ${outputY}, 146 ${outputY}`
}

const stackedFlowPoints = (inputCount: number) => {
  const pointsByCount = {
    1: { inputY: [34], outputY: 76 },
    2: { inputY: [18, 56], outputY: 86 },
    3: { inputY: [13, 39, 65], outputY: 90 },
  } as const

  return pointsByCount[Math.min(Math.max(inputCount, 1), 3) as 1 | 2 | 3]
}

const stackedInputPath = (inputCount: number, inputIndex: number) => {
  const { inputY } = stackedFlowPoints(inputCount)
  const sourceY = inputY[inputIndex] ?? inputY[0]

  return `M 36 ${sourceY} H 14`
}

const stackedTrunkPath = (inputCount: number) => {
  const { inputY, outputY } = stackedFlowPoints(inputCount)

  return `M 14 ${inputY[0]} V ${outputY} H 27.25`
}

const stackedArrowPath = (inputCount: number) => {
  const { outputY } = stackedFlowPoints(inputCount)

  return `M 27.25 ${outputY - 2.625} L 36 ${outputY} L 27.25 ${outputY + 2.625} Z`
}
</script>

<div class="source-flow-map grid gap-4">
  {#each lanes as lane, laneIndex (lane.id)}
    <section
      class="source-flow-lane"
      style={`--flow-accent: ${lane.accent}; --flow-secondary: ${lane.secondary}; --flow-connector: ${lane.id === 'addresses' ? lane.secondary : lane.accent}; --flow-ink: ${lane.ink}; --flow-index: ${laneIndex};`}
      aria-labelledby={`source-flow-${lane.id}`}
    >
      <div class="source-flow-inputs">
        {#each lane.inputs.slice(0, 3) as input (input.id)}
          <svelte:element
            this={input.href ? 'a' : 'div'}
            class="source-flow-input group"
            style={`--source-accent: ${input.accent};`}
            href={input.href}
            aria-label={input.href ? `${input.publisher}: ${input.source}` : undefined}
          >
            <span
              class={`source-flow-icon ${
                input.iconTone ? `source-flow-icon-${input.iconTone}` : ''
              }`}
              aria-hidden="true"
            >
              {#if input.icon}
                <img src={input.icon} alt="">
              {:else}
                <span>{input.fallbackIcon ?? input.publisher.slice(0, 2)}</span>
              {/if}
            </span>
            <span class="min-w-0">
              <span class="source-flow-source">{input.source}</span>
              <span class="source-flow-publisher">{input.publisher}</span>
              {#if input.fields?.length}
                <span class="source-flow-fields">
                  {#each input.fields as field}
                    <span class="source-flow-field">
                      <span class="source-flow-field-label">{field.label}</span>
                      <span class="source-flow-field-value">{field.value}</span>
                    </span>
                  {/each}
                </span>
              {/if}
            </span>
            {#if input.status}
              <span class="source-flow-status">{input.status}</span>
            {/if}
          </svelte:element>
        {/each}
      </div>

      <svg
        class="source-flow-connectors"
        viewBox="0 0 150 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <marker
            id={`source-flow-arrow-${lane.id}`}
            markerWidth="8"
            markerHeight="8"
            refX="6.8"
            refY="4"
            orient="auto"
          >
            <path d="M 0 1 L 7 4 L 0 7 Z" fill="var(--flow-accent)"></path>
          </marker>
        </defs>
        {#each lane.inputs.slice(0, 3) as input, inputIndex (input.id)}
          <path
            class="source-flow-path"
            d={connectorPath(Math.min(lane.inputs.length, 3), inputIndex)}
            marker-end={`url(#source-flow-arrow-${lane.id})`}
          ></path>
        {/each}
      </svg>

      <svg
        class="source-flow-stacked-connectors"
        viewBox="0 0 36 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {#each lane.inputs.slice(0, 3) as input, inputIndex (input.id)}
          <path
            class="source-flow-stacked-input"
            d={stackedInputPath(Math.min(lane.inputs.length, 3), inputIndex)}
          ></path>
        {/each}
        <path
          class="source-flow-stacked-trunk"
          d={stackedTrunkPath(Math.min(lane.inputs.length, 3))}
        ></path>
        <path
          class="source-flow-stacked-arrow"
          d={stackedArrowPath(Math.min(lane.inputs.length, 3))}
        ></path>
      </svg>

      <a
        class="source-flow-output group"
        href={lane.href}
        id={`source-flow-${lane.id}`}
      >
        <span class="source-flow-output-image" aria-hidden="true">
          <img src={lane.image} alt="">
        </span>
        <span class="source-flow-output-label">
          <span class="font-display text-2xl font-bold leading-none">{lane.label}</span>
          <span class="source-flow-output-subtitle">API FAMILY</span>
        </span>
      </a>
    </section>
  {/each}
</div>

<style>
.source-flow-map {
  isolation: isolate;
}

.source-flow-lane {
  position: relative;
  display: grid;
  min-height: 9.5rem;
  grid-template-columns: minmax(0, 1.25fr) minmax(7rem, 0.42fr) minmax(14rem, 0.72fr);
  align-items: center;
  gap: 1.25rem;
  padding: 1rem 0;
}

.source-flow-lane:not(:last-child) {
  border-bottom: 1px solid color-mix(in srgb, var(--outline-variant) 82%, transparent);
}

.source-flow-inputs {
  display: grid;
  gap: 0.75rem;
}

.source-flow-input,
.source-flow-output {
  border: 1px solid color-mix(in srgb, var(--outline-variant) 78%, transparent);
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--surface-container-low) 88%, transparent);
  transition:
    border-color 180ms ease,
    background 180ms ease,
    transform 180ms ease;
}

.source-flow-input {
  position: relative;
  display: grid;
  min-height: 5.65rem;
  grid-template-columns: 4rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 1rem;
  overflow: hidden;
  padding: 0.9rem 1rem;
  background: var(--surface-container-low);
  color: var(--primary);
}

.source-flow-input::before {
  position: absolute;
  inset: 0;
  content: "";
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--source-accent) 72%, var(--surface-container-low)) 0%,
    color-mix(in srgb, var(--source-accent) 42%, var(--surface-container-low)) 36%,
    color-mix(in srgb, var(--source-accent) 18%, var(--surface-container-low)) 72%,
    color-mix(in srgb, var(--source-accent) 6%, var(--surface-container-low)) 100%
  );
  opacity: 0.44;
}

.source-flow-input::after {
  position: absolute;
  inset: 0;
  content: "";
  opacity: 0.14;
  background-image:
    linear-gradient(var(--source-accent) 1px, transparent 1px),
    linear-gradient(90deg, var(--source-accent) 1px, transparent 1px);
  background-size: 1rem 1rem;
  mask-image: linear-gradient(
    90deg,
    rgb(0 0 0 / 0.88) 0 6.25rem,
    rgb(0 0 0 / 0.32) 18rem,
    transparent 78%
  );
}

.source-flow-input:hover,
.source-flow-input:focus-visible {
  border-color: color-mix(in srgb, var(--source-accent) 72%, var(--outline-variant));
  outline: none;
}

.source-flow-output:hover,
.source-flow-output:focus-visible {
  border-color: color-mix(in srgb, var(--flow-accent) 72%, var(--outline-variant));
  outline: none;
}

.source-flow-icon {
  position: relative;
  z-index: 1;
  display: inline-flex;
  width: 4rem;
  height: 4rem;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 0.35rem;
  border: 1px solid color-mix(in srgb, var(--source-accent) 42%, transparent);
  background: color-mix(in srgb, var(--surface-container-high) 82%, #000 18%);
  color: var(--source-accent);
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: 800;
}

.source-flow-icon-light {
  background: color-mix(in srgb, #fff 78%, var(--source-accent) 22%);
}

.source-flow-icon-hkgov {
  background: #fff7f4;
}

.source-flow-icon-diana {
  background: #dff0d6;
}

.source-flow-icon img {
  width: 2.75rem;
  height: 2.75rem;
  object-fit: contain;
}

.source-flow-publisher,
.source-flow-source,
.source-flow-field-value {
  position: relative;
  z-index: 1;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-flow-publisher {
  margin-top: 0.18rem;
  font-family: var(--font-body);
  font-size: 0.82rem;
  font-weight: 650;
  color: var(--foreground-alt);
}

.source-flow-source {
  font-family: var(--font-display);
  font-size: 1.08rem;
  font-weight: 800;
  color: var(--primary);
}

.source-flow-fields {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.65rem;
  margin-top: 0.58rem;
}

.source-flow-field {
  display: inline-flex;
  align-items: baseline;
  gap: 0.22rem;
  min-width: 0;
  font-family: var(--font-body);
  font-size: 0.68rem;
  color: var(--foreground-alt);
}

.source-flow-field-label {
  font-weight: 760;
  color: color-mix(in srgb, var(--foreground-alt) 72%, transparent);
  text-transform: lowercase;
}

.source-flow-field-value {
  max-width: 12.5rem;
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
  font-size: 0.72rem;
  font-weight: 750;
  color: var(--primary);
  text-transform: uppercase;
}

.source-flow-status {
  position: relative;
  z-index: 1;
  align-self: start;
  border: 1px solid color-mix(in srgb, var(--source-accent) 42%, transparent);
  border-radius: 0.25rem;
  background: color-mix(in srgb, var(--source-accent) 12%, transparent);
  padding: 0.22rem 0.42rem;
  font-family: var(--font-body);
  font-size: 0.68rem;
  font-weight: 800;
  color: var(--source-accent);
  text-transform: uppercase;
}

.source-flow-connectors {
  width: 100%;
  height: 8rem;
  overflow: visible;
}

.source-flow-stacked-connectors {
  display: none;
}

.source-flow-path,
.source-flow-stacked-input,
.source-flow-stacked-trunk {
  fill: none;
  stroke: var(--flow-accent);
  stroke-width: 1.55;
  stroke-linecap: round;
  stroke-dasharray: 6 8;
  opacity: 0.78;
  animation: source-flow-dash 3.8s linear infinite;
  animation-delay: calc(var(--flow-index) * -360ms);
  filter: drop-shadow(
    0 0 0.35rem color-mix(in srgb, var(--flow-accent) 22%, transparent)
  );
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

.source-flow-output {
  position: relative;
  display: flex;
  min-height: 6.9rem;
  align-items: center;
  justify-content: space-between;
  overflow: hidden;
  padding: 1.25rem 1.3rem;
  color: var(--flow-ink);
}

.source-flow-output::before {
  position: absolute;
  inset: 0;
  content: "";
  background: color-mix(in srgb, var(--flow-accent) 82%, #000 18%);
  opacity: 1;
}

.source-flow-output::after {
  position: absolute;
  inset: 0;
  content: "";
  opacity: 0.18;
  background-image:
    linear-gradient(var(--flow-accent) 1px, transparent 1px),
    linear-gradient(90deg, var(--flow-accent) 1px, transparent 1px);
  background-size: 1.15rem 1.15rem;
  mask-image: linear-gradient(
    90deg,
    rgb(0 0 0 / 0.9),
    rgb(0 0 0 / 0.14) 62%,
    transparent
  );
}

.source-flow-output-image {
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow: hidden;
}

.source-flow-output-image::before {
  position: absolute;
  inset: 0;
  z-index: 1;
  content: "";
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--flow-accent) 82%, #000 18%) 0%,
    color-mix(in srgb, var(--flow-accent) 58%, transparent) 35%,
    transparent 74%
  );
}

.source-flow-output-image img {
  position: absolute;
  top: 50%;
  right: -15%;
  width: 78%;
  height: 135%;
  object-fit: cover;
  opacity: 0.72;
  transform: translateY(-50%) scale(1.02);
  mask-image: linear-gradient(
    90deg,
    transparent 0%,
    rgb(0 0 0 / 0.08) 18%,
    rgb(0 0 0 / 0.96) 68%
  );
  transition:
    opacity 180ms ease,
    transform 220ms ease;
}

.source-flow-output-label {
  position: relative;
  z-index: 2;
}

.source-flow-output-label {
  display: grid;
  gap: 0.34rem;
}

.source-flow-output-subtitle {
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
  font-size: 0.72rem;
  font-weight: 780;
  color: color-mix(in srgb, var(--flow-ink) 74%, transparent);
  text-transform: uppercase;
}

.source-flow-output:hover .source-flow-output-image img,
.source-flow-output:focus-visible .source-flow-output-image img {
  opacity: 0.86;
  transform: translateY(-50%) scale(1.07);
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
  .source-flow-lane {
    --stacked-flow-gutter: 1rem;
    grid-template-columns: 1fr;
    gap: 0.75rem;
    padding: 1rem 0 1.25rem;
  }

  .source-flow-inputs,
  .source-flow-output {
    position: relative;
    z-index: 1;
    margin-left: var(--stacked-flow-gutter);
  }

  .source-flow-connectors {
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

@media (max-width: 640px) {
  .source-flow-input {
    grid-template-columns: 3.4rem minmax(0, 1fr);
  }

  .source-flow-icon {
    width: 3.4rem;
    height: 3.4rem;
  }

  .source-flow-icon img {
    width: 2.35rem;
    height: 2.35rem;
  }

  .source-flow-status {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
