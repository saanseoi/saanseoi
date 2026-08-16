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
  transition:scale={{ duration: 180, start: 0.96 }}
>
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
        <span class="source-flow-status">PLANNED</span>
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
  grid-template-columns: 4rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 1rem;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--outline-variant) 78%, transparent);
  border-radius: 0.5rem;
  background: var(--surface-container-low);
  padding: 0.9rem 1rem;
  color: var(--primary);
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

.source-flow-icon {
  position: relative;
  z-index: 1;
  display: inline-flex;
  width: 4rem;
  height: 4rem;
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
  min-width: 0;
  align-items: baseline;
  gap: 0.22rem;
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
.source-flow-statuses {
  position: absolute;
  inset: 0.72rem;
  z-index: 1;
  pointer-events: none;
}
.source-flow-status-variant {
  border-color: color-mix(in srgb, #fff 65%, transparent);
  background: rgb(255 255 255 / 0.08);
  color: #fff;
}
.source-flow-statuses .source-flow-status {
  position: absolute;
  right: 0;
  bottom: 0;
}
.source-flow-statuses .source-flow-status-variant {
  top: 0;
  bottom: auto;
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
}
</style>
