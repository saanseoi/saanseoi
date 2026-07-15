<script lang="ts">
import type { Snippet } from 'svelte'

import { cn } from '$lib/bits/utilities/helpers/cn'

type Props = {
  children?: Snippet
  class?: string
}

let { children, class: className = '' }: Props = $props()
</script>

<section class={cn('landing-foundation-section', className)}>
  {@render children?.()}
</section>

<style>
:global {
  .foundation-section {
    isolation: isolate;
  }

  .foundation-map {
    --landing-header-height: 4.5rem;
    --foundation-map-background: #feffeb;
    position: relative;
    min-height: clamp(38rem, 56vw, 47rem);
    height: max(clamp(38rem, 56vw, 47rem), calc(100svh - var(--landing-header-height)));
    overflow: hidden;
    background: var(--foundation-map-background);
  }

  :global(.dark) .foundation-map {
    --foundation-map-background: var(--surface);
  }

  .foundation-harbour-map {
    position: absolute;
    inset: -2px;
    width: calc(100% + 4px);
    height: calc(100% + 4px);
  }

  .map-bg {
    fill: var(--foundation-map-background);
  }

  .map-noise circle {
    fill: color-mix(in srgb, var(--secondary) 22%, transparent);
    opacity: 0.5;
  }

  .coastlines {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke: var(--secondary);
    stroke-width: 0.925;
    opacity: 0.64;
  }

  .motion-paths {
    visibility: hidden;
  }

  .vessel {
    opacity: 0.72;
  }

  .vessel-hull {
    fill: var(--on-tertiary-container);
    stroke: color-mix(in srgb, #0e0e0c 82%, transparent);
    stroke-width: 0.35;
    shape-rendering: geometricPrecision;
  }

  .star-ferry-hull {
    fill: color-mix(in srgb, var(--secondary-fixed-dim) 72%, #163b2e);
    stroke: color-mix(in srgb, #0e0e0c 86%, transparent);
    stroke-width: 1.15;
  }

  .star-ferry-top {
    fill: color-mix(in srgb, var(--secondary-fixed-dim) 78%, #ffffff);
    stroke: none;
  }

  .vessel-warm .vessel-hull {
    fill: var(--tertiary-fixed-dim);
  }

  .vessel-dim {
    opacity: 0.48;
  }

  .vessel-dim .vessel-hull {
    fill: color-mix(in srgb, var(--on-tertiary-container) 70%, transparent);
  }

  .foundation-center {
    position: absolute;
    top: 52%;
    left: 50%;
    z-index: 5;
    width: min(70rem, calc(100% - 3rem));
    text-align: center;
    transform: translate(-50%, -50%);
  }

  .foundation-center::before {
    display: none;
  }

  .foundation-eyebrow {
    font-family: var(--font-body);
    font-size: 0.76rem;
    font-weight: 900;
    color: var(--secondary);
    text-transform: uppercase;
    letter-spacing: 0.14em;
  }

  .foundation-eyebrow span,
  .foundation-label-number {
    font-family: var(--font-display);
    font-size: 0.8rem;
    font-weight: 900;
    letter-spacing: 0;
    color: var(--label-accent, var(--secondary-fixed-dim));
  }

  .foundation-label-number {
    display: inline-block;
  }

  .foundation-label-eyebrow {
    display: inline-flex;
    gap: 0.25rem;
    align-items: baseline;
    padding: 0.12rem 0.32rem;
    margin-left: 0;
    font-family: var(--font-body);
    font-size: 0.76rem;
    font-weight: 900;
    color: var(--secondary);
    text-transform: uppercase;
    letter-spacing: 0.14em;
    background: var(--foundation-map-background);
  }

  .foundation-label-eyebrow-cjk {
    translate: 0 -2px;
  }

  .foundation-label-data .foundation-label-eyebrow {
    margin-left: 0;
    padding-right: 0;
  }

  .foundation-center h2 {
    margin-inline: auto;
    margin-top: 0.85rem;
    font-family: var(--font-display);
    font-size: clamp(2rem, 5.2vw, 5rem);
    font-weight: 900;
    line-height: 0.92;
    color: var(--primary);
    text-shadow: 0 1px 0 var(--foundation-map-background);
    text-wrap: balance;
  }

  .foundation-center h2 span {
    display: block;
  }

  .foundation-center p {
    max-width: 34rem;
    margin: 1.05rem auto 0;
    font-family: var(--font-body);
    font-size: clamp(0.94rem, 1.2vw, 1.06rem);
    line-height: 1.7;
    color: color-mix(in srgb, var(--foreground-alt) 78%, transparent);
  }

  .foundation-labels {
    position: absolute;
    inset: 0;
    z-index: 4;
  }

  .foundation-label {
    --label-accent: var(--secondary-fixed-dim);
    position: absolute;
    top: var(--label-y);
    left: var(--label-x);
    display: block;
    width: min(18.5rem, 23vw);
    color: var(--primary);
    text-decoration: none;
    transform: translate(-50%, -50%);
    opacity: 0;
    transition:
      opacity 620ms ease,
      translate 620ms cubic-bezier(0.2, 0.7, 0.2, 1),
      filter 240ms ease;
    translate: 0 0.75rem;
  }

  .foundation-label::before {
    display: none;
  }

  .foundation-label-right {
    text-align: right;
  }

  .foundation-label:hover,
  .foundation-label:focus-visible {
    outline: none;
  }

  .foundation-label-data {
    --label-accent: var(--tertiary-fixed-dim);
  }

  .foundation-label-humane {
    --label-accent: var(--tertiary-fixed-dim);
  }

  .foundation-label-projects {
    --label-accent: var(--tertiary-fixed-dim);
  }

  .foundation-label h3 {
    margin-top: 0.2rem;
    font-family: var(--font-display);
    font-size: clamp(1.8rem, 2.75vw, 3.05rem);
    font-weight: 900;
    line-height: 0.9;
    color: var(--primary);
    text-shadow: 0 1px 0 var(--foundation-map-background);
  }

  .foundation-label p {
    display: block;
    max-width: 22rem;
    margin-top: 0.8rem;
    font-family: var(--font-body);
    font-size: clamp(0.9rem, 1.1vw, 1.05rem);
    line-height: 1.65;
    text-wrap: balance;
    color: color-mix(in srgb, var(--foreground-alt) 82%, transparent);
    background: transparent;
  }

  .foundation-label p > span {
    padding: 0.08rem 0.26rem 0.14rem;
    background: color-mix(in srgb, var(--foundation-map-background) 90%, transparent);
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
  }

  .foundation-label-right p {
    margin-left: auto;
  }

  .foundation-label small {
    display: block;
    width: fit-content;
    padding: 0.12rem 0.3rem 0.16rem;
    margin-top: 0.65rem;
    font-family: var(--font-body);
    font-size: 0.82rem;
    font-weight: 800;
    color: var(--on-tertiary-container);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    background: color-mix(in srgb, var(--foundation-map-background) 92%, transparent);
  }

  .foundation-label-right small {
    margin-left: auto;
  }

  :global(.dark) .foundation-center h2,
  :global(.dark) .foundation-label,
  :global(.dark) .foundation-label h3 {
    color: #ffffff;
  }

  :global(.dark) .foundation-center p,
  :global(.dark) .foundation-label p {
    color: rgb(255 255 255 / 0.78);
  }

  :global(.dark) .foundation-label h3 {
    text-shadow: 0 1px 0 var(--foundation-map-background);
  }

  :global(.dark) .foundation-label p,
  :global(.dark) .foundation-label small {
    background: transparent;
  }

  :global(.dark) .foundation-label p > span,
  :global(.dark) .foundation-label small {
    background: rgb(19 19 17 / 0.86);
  }

  .foundation-section-visible .foundation-label {
    opacity: 1;
    translate: 0 0;
  }

  .foundation-section-visible .foundation-label-humane {
    transition-delay: 140ms;
  }

  .foundation-section-visible .foundation-label-data {
    transition-delay: 240ms;
  }

  .foundation-section-visible .foundation-label-projects {
    transition-delay: 340ms;
  }

  @media (min-width: 768px) {
    .foundation-center .foundation-eyebrow,
    .foundation-center p {
      display: none;
    }
  }

  @media (min-width: 786px) {
    .foundation-label {
      width: min(22rem, 32vw);
    }

    .foundation-label-data {
      width: min(25rem, 39vw);
    }

    .foundation-label-data p {
      max-width: 26rem;
    }

    .foundation-label > .foundation-label-number {
      display: none;
    }
  }

  @media (min-width: 786px) and (max-width: 1080px) {
    .foundation-label-data {
      right: 5%;
      left: auto;
      transform: translateY(-50%);
    }
  }

  @media (max-width: 785px) {
    .foundation-map {
      height: auto;
      min-height: auto;
    }

    .foundation-harbour-map {
      position: relative;
      inset: auto;
      width: 100%;
      height: 30rem;
    }

    .foundation-center {
      top: 15rem;
      width: min(32rem, calc(100% - 1rem));
    }

    .foundation-center h2 {
      font-size: clamp(1.35rem, 6.2vw, 2.5rem);
    }

    .foundation-labels {
      position: relative;
      inset: auto;
      display: grid;
      width: min(30rem, calc(100% - 2.5rem));
      gap: 1.25rem;
      justify-items: center;
      margin-inline: auto;
      padding: 0.5rem 1.25rem 2.75rem;
    }

    .foundation-label {
      --mobile-marker-size: 4.25rem;
      position: relative;
      top: auto;
      left: auto;
      width: 100%;
      min-height: 12rem;
      padding: 1.05rem 0 1.05rem calc(var(--mobile-marker-size) + 1rem);
      text-align: left;
      transform: none;
      opacity: 1;
      translate: 0 0;
    }

    .foundation-label:nth-child(2) {
      --mobile-marker-offset: calc(var(--mobile-marker-size) + 0.5rem);
      justify-self: stretch;
      width: 100%;
      padding-right: var(--mobile-marker-offset);
      padding-left: 0;
      text-align: right;
    }

    .foundation-label:nth-child(3) {
      justify-self: stretch;
      width: 100%;
    }

    .foundation-label::before {
      display: none;
    }

    .foundation-label::after {
      position: absolute;
      top: calc(1.05rem + var(--mobile-marker-size));
      left: calc(var(--mobile-marker-size) / 2);
      width: 1px;
      height: calc(100% - 1.1rem);
      content: "";
      background: linear-gradient(
        to bottom,
        color-mix(in srgb, var(--label-accent) 56%, transparent),
        transparent
      );
    }

    .foundation-label:nth-child(2)::after {
      right: calc(var(--mobile-marker-size) / 2);
      left: auto;
    }

    .foundation-label-number {
      position: absolute;
      top: 1.05rem;
      left: 0;
      z-index: 1;
      display: inline-grid;
      width: var(--mobile-marker-size);
      aspect-ratio: 1;
      place-items: center;
      border: 1px solid currentColor;
      border-radius: 999px;
      background: color-mix(in srgb, currentColor 11%, var(--surface-container-lowest));
      box-shadow:
        0 0 0 0.34rem color-mix(in srgb, currentColor 7%, transparent),
        0 0.85rem 2rem rgb(0 0 0 / 0.16);
      font-size: 1.45rem;
      line-height: 1;
      transform: none;
    }

    .foundation-label-eyebrow {
      display: block;
      padding: 0;
      margin-left: 0;
      font-size: 0.72rem;
    }

    .foundation-label-eyebrow-number {
      display: none;
    }

    .foundation-label-eyebrow-divider,
    .foundation-label-eyebrow-data-number {
      display: none;
    }

    .foundation-label-number::before {
      position: absolute;
      inset: -0.34rem;
      z-index: -1;
      content: "";
      border: 2px solid currentColor;
      border-radius: inherit;
      opacity: 0.42;
      transform: scale(0.94);
    }

    .foundation-label:nth-child(2) > .foundation-label-number {
      right: 0;
      left: auto;
    }

    .foundation-label h3 {
      margin-top: 0.55rem;
      font-size: clamp(2.05rem, 10.5vw, 3.15rem);
    }

    .foundation-label p {
      display: block;
      width: min(20.5rem, calc(100% + 2rem));
      max-width: none;
      padding: 0;
      margin-top: 0.9rem;
      background: transparent;
    }

    .foundation-label small {
      margin-top: 0.95rem;
      padding: 0;
      background: transparent;
    }

    .foundation-label-right p {
      margin-left: auto;
    }

    .foundation-label-right small {
      margin-left: auto;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .foundation-label {
      opacity: 1;
      translate: 0 0;
      transition: none;
    }
  }
}
</style>
