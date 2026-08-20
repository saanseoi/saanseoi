<script lang="ts">
import { scale } from 'svelte/transition'

import type { SourceFlowInput } from './sourceFlowMapTypes'

type Props = {
  input: SourceFlowInput
}

let { input }: Props = $props()
</script>

<svelte:element
  this={input.href ? 'a' : 'div'}
  class="source-flow-input group"
  style={`--source-accent: ${input.accent};`}
  href={input.href}
  aria-label={input.href ? `${input.publisher}: ${input.source}` : undefined}
  data-sveltekit-preload-code={input.href ? 'viewport' : undefined}
  data-sveltekit-preload-data={input.href ? 'hover' : undefined}
  transition:scale={{ duration: 180, start: 0.96 }}
>
  {#if input.icon}
    <img class="source-flow-watermark" src={input.icon} alt="" aria-hidden="true">
  {/if}
  <span
    class={`source-flow-icon ${input.iconTone ? `source-flow-icon-${input.iconTone}` : ''}`}
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
  {#if input.planned || input.variant}
    <span class="source-flow-statuses">
      {#if input.planned}
        <span class="source-flow-status source-flow-status-planned">PLANNED</span>
      {/if}
      {#if input.variant}
        <span class="source-flow-status source-flow-status-variant"
          >{input.variant}</span
        >
      {/if}
    </span>
  {/if}
</svelte:element>

<style>
.source-flow-input {
  position: relative;
  display: grid;
  min-height: 5.65rem;
  grid-template-columns: 4.5rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 1rem;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--outline-variant) 78%, transparent);
  border-radius: 0.5rem;
  background: var(--surface-container-low);
  padding: 0.9rem 1rem;
  color: #fff;
  transition:
    border-color 180ms ease,
    background 180ms ease,
    transform 180ms ease;
}

.source-flow-input::before {
  position: absolute;
  inset: 0;
  content: "";
  background: linear-gradient(
    160deg,
    color-mix(in srgb, var(--source-accent) 86%, white),
    var(--source-accent)
  );
}

:global(.dark) .source-flow-input::before {
  background: linear-gradient(
    160deg,
    color-mix(in srgb, var(--source-accent) 72%, black),
    color-mix(in srgb, var(--source-accent) 88%, black)
  );
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

.source-flow-watermark {
  position: absolute;
  inset-block: 0;
  left: 0;
  z-index: 0;
  width: 72%;
  height: 100%;
  object-fit: cover;
  object-position: 5% 60%;
  opacity: 0.25;
  filter: blur(7px) brightness(105%) saturate(75%);
  mix-blend-mode: screen;
  mask-image: linear-gradient(
    to right,
    black 0%,
    black 58%,
    rgb(0 0 0 / 0.8) 72%,
    transparent 100%
  );
  -webkit-mask-image: linear-gradient(
    to right,
    black 0%,
    black 58%,
    rgb(0 0 0 / 0.8) 72%,
    transparent 100%
  );
  transform: scale(1.11);
  transform-origin: left center;
}

:global(.dark) .source-flow-watermark {
  opacity: 0.27;
  filter: blur(7px) brightness(115%) saturate(75%);
}

.source-flow-input:hover,
.source-flow-input:focus-visible {
  border-color: color-mix(in srgb, var(--source-accent) 72%, var(--outline-variant));
  outline: none;
}

.source-flow-icon {
  position: relative;
  z-index: 1;
  display: inline-flex;
  width: 4.5rem;
  height: 4.5rem;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--source-accent) 42%, transparent);
  border-radius: 0.35rem;
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
  width: 3.1rem;
  height: 3.1rem;
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
  color: rgb(255 255 255 / 0.82);
}

.source-flow-source {
  font-family: var(--font-display);
  font-size: 1.08rem;
  font-weight: 800;
  color: #fff;
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
  min-width: 0;
  align-items: baseline;
  gap: 0.22rem;
  font-family: var(--font-body);
  font-size: 0.68rem;
  color: var(--foreground-alt);
}
.source-flow-field-label {
  font-weight: 760;
  color: rgb(255 255 255 / 0.72);
  text-transform: lowercase;
}
.source-flow-field-value {
  max-width: 12.5rem;
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
  font-size: 0.72rem;
  font-weight: 750;
  color: #fff;
  text-transform: uppercase;
}
.source-flow-status {
  position: relative;
  z-index: 1;
  border: 1px solid rgb(255 255 255 / 0.42);
  border-radius: 0.25rem;
  background: rgb(255 255 255 / 0.12);
  padding: 0.22rem 0.42rem;
  font-family: var(--font-body);
  font-size: 0.68rem;
  font-weight: 800;
  color: #fff;
  text-transform: uppercase;
}
.source-flow-statuses {
  position: relative;
  z-index: 1;
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  align-self: stretch;
  margin: -0.18rem -0.18rem -0.18rem 0;
  pointer-events: none;
}

.source-flow-status-planned {
  margin-top: auto;
}
.source-flow-status-variant {
  order: -1;
  border-color: color-mix(in srgb, #fff 65%, transparent);
  background: rgb(255 255 255 / 0.08);
  color: #fff;
}
.source-flow-statuses .source-flow-status {
  position: static;
}

@media (max-width: 640px) {
  .source-flow-input {
    grid-template-columns: 3.8rem minmax(0, 1fr) auto;
  }
  .source-flow-icon {
    width: 3.8rem;
    height: 3.8rem;
  }
  .source-flow-icon img {
    width: 2.6rem;
    height: 2.6rem;
  }
}
</style>
