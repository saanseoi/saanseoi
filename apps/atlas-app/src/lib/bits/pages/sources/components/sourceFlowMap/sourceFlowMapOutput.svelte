<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'

import type { SourceFlowLane } from './sourceFlowMapTypes'

type Props = { lane: SourceFlowLane; groupId: string }
let { lane, groupId }: Props = $props()
</script>

<a class="source-flow-output group" href={lane.href} id={`source-flow-${groupId}`}>
  <span class="source-flow-output-image" aria-hidden="true"
    ><img src={lane.image} alt=""></span
  >
  <span class="source-flow-output-label">
    <span class="font-display text-2xl font-bold leading-none">{lane.label}</span>
    <span class="source-flow-output-subtitle">{m.sources_flow_api_family()}</span>
  </span>
</a>

<style>
.source-flow-output {
  grid-column: 3;
  grid-row: 1;
  position: relative;
  display: flex;
  min-height: 5.65rem;
  align-self: start;
  align-items: center;
  justify-content: space-between;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--outline-variant) 78%, transparent);
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--surface-container-low) 88%, transparent);
  padding: 1.25rem 1.3rem;
  color: var(--flow-ink);
  transform: translateY(0.5rem);
  transition:
    border-color 180ms ease,
    background 180ms ease,
    transform 180ms ease;
}
.source-flow-output::before {
  position: absolute;
  inset: 0;
  content: "";
  background: var(--flow-accent);
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
.source-flow-output:hover,
.source-flow-output:focus-visible {
  border-color: color-mix(in srgb, var(--flow-accent) 72%, var(--outline-variant));
  outline: none;
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
    var(--flow-accent) 0%,
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
@media (max-width: 900px) {
  .source-flow-output {
    grid-column: 1;
    grid-row: auto;
    margin-left: var(--stacked-flow-gutter);
  }
}
</style>
