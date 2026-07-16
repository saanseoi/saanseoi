<script lang="ts">
import type { Snippet } from 'svelte'

import { cn } from '$lib/bits/utilities/helpers/cn'

type Props = {
  children?: Snippet
  class?: string
}

let { children, class: className = '' }: Props = $props()
</script>

<section class={cn('landing-pipeline-section', className)}>
  {@render children?.()}
</section>

<style>
:global {
  .landing-pipeline:not(.landing-pipeline-active) .pipeline-traveler,
  .landing-pipeline:not(.landing-pipeline-active) .pipeline-number::before,
  .landing-pipeline:not(.landing-pipeline-active) .artifact,
  .landing-pipeline:not(.landing-pipeline-active) .pipeline-arrow {
    animation-play-state: paused;
  }

  .landing-pipeline .landing-section-header,
  .landing-pipeline .pipeline-stage {
    transition:
      opacity 480ms ease,
      translate 560ms cubic-bezier(0.2, 0.7, 0.2, 1);
  }

  .landing-pipeline:not(.landing-pipeline-revealed) .landing-section-header,
  .landing-pipeline:not(.landing-pipeline-revealed) .pipeline-stage {
    opacity: 0;
    translate: 0 1rem;
  }

  .landing-pipeline.landing-pipeline-revealed .pipeline-stage:nth-child(1) {
    transition-delay: 80ms;
  }

  .landing-pipeline.landing-pipeline-revealed .pipeline-stage:nth-child(3) {
    transition-delay: 160ms;
  }

  .landing-pipeline.landing-pipeline-revealed .pipeline-stage:nth-child(5) {
    transition-delay: 240ms;
  }
  .landing-pipeline {
    overflow: clip;
    scroll-margin-top: var(--landing-header-height, 4.5rem);
  }

  .landing-section-header {
    display: block;
    gap: 1.5rem;
    padding-bottom: 1.5rem;
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
    max-width: 60rem;
    margin-top: 1rem;
    font-family: var(--font-body);
    font-size: clamp(1rem, 1.4vw, 1.14rem);
    line-height: 1.8;
    color: var(--foreground-alt);
  }

  .pipeline {
    position: relative;
    isolation: isolate;
    --pipeline-source: var(--secondary);
    margin-top: clamp(1rem, 4svh, 3rem);
    padding-block: clamp(2rem, 6svh, 4rem);
  }

  .pipeline-wave-field {
    position: absolute;
    top: -10%;
    bottom: -25%;
    left: 50%;
    z-index: -1;
    width: 100vw;
    transform: translateX(-50%);
    background-image: url("data:image/svg+xml,%3Csvg width='140' height='84' viewBox='0 0 140 84' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 14c28 0 42 9 70 9s42-9 70-9M0 38c28 0 42 9 70 9s42-9 70-9M0 62c28 0 42 9 70 9s42-9 70-9' fill='none' stroke='%238e9192' stroke-width='0.65' opacity='0.13'/%3E%3C/svg%3E");
    background-repeat: repeat;
    pointer-events: none;
  }

  .pipeline-stages {
    position: relative;
    display: grid;
    min-height: 24rem;
    gap: 12rem;
  }

  .pipeline-arc {
    position: absolute;
    top: 0;
    left: 50%;
    z-index: 0;
    width: 100%;
    height: 15rem;
    overflow: visible;
    transform: translateX(-50%);
    pointer-events: none;
  }

  .pipeline-arc path {
    fill: none;
    stroke-width: 1.4;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.52;
    marker-end: url("#pipeline-arc-arrow");
  }

  .pipeline-arc marker path {
    fill: currentColor;
  }

  .pipeline-traveler {
    opacity: 0;
    filter: drop-shadow(0 0 0.35rem currentColor);
  }

  .pipeline-traveler-source {
    color: #7ff7d8;
    fill: currentColor;
    animation: pipeline-traveler-source-flare 6s linear infinite;
  }

  .pipeline-traveler-release {
    color: #ffb08c;
    fill: currentColor;
    animation: pipeline-traveler-release-flare 6s linear infinite;
  }

  .pipeline-arc-left {
    color: var(--secondary);
    stroke: color-mix(in srgb, var(--secondary) 58%, transparent);
  }

  .pipeline-arc-right {
    color: var(--tertiary);
    stroke: color-mix(in srgb, var(--tertiary) 45%, var(--secondary));
  }

  .pipeline-stage {
    display: flex;
    min-height: 13rem;
    flex-direction: column;
    align-items: center;
    text-align: center;
    transform-origin: 50% -24rem;
  }

  .pipeline-stage h2,
  .pipeline-stage p {
    margin-right: auto;
    margin-left: auto;
  }

  .pipeline-number {
    position: relative;
    z-index: 1;
    display: inline-grid;
    width: 4.75rem;
    aspect-ratio: 1;
    place-items: center;
    border: 1px solid currentColor;
    border-radius: 999px;
    background: color-mix(in srgb, currentColor 11%, var(--surface-container-lowest));
    box-shadow:
      0 0 0 0.38rem color-mix(in srgb, currentColor 7%, transparent),
      0 0.85rem 2rem rgb(0 0 0 / 0.16);
    font-family: var(--font-display);
    font-size: 1.8rem;
    font-weight: 800;
    line-height: 1;
  }

  .pipeline-number::before {
    position: absolute;
    inset: -0.38rem;
    z-index: -1;
    content: "";
    border: 2px solid currentColor;
    border-radius: inherit;
    opacity: 0;
    transform: scale(0.9);
  }

  .pipeline-number-source::before {
    color: #7ff7d8;
    animation: pipeline-ring-source 6s ease-in-out infinite;
  }

  .pipeline-number-release::before {
    color: #ffb08c;
    animation: pipeline-ring-release 6s ease-in-out infinite;
  }

  .pipeline-number-api::before {
    color: #7ff7d8;
    animation: pipeline-ring-api 6s ease-in-out infinite;
  }

  .pipeline-stage-source,
  .pipeline-stage-api {
    transform: translateY(1.45rem);
  }

  .pipeline-stage-release {
    transform: translateY(3.35rem) scale(1.05);
  }

  .pipeline-artifacts {
    position: absolute;
    inset: -3.5rem -1.25rem;
    pointer-events: none;
  }

  .artifact {
    position: absolute;
    display: block;
    font-family:
      ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
      "Courier New", monospace;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    opacity: 0.34;
    animation-duration: 9s;
    animation-iteration-count: infinite;
    animation-timing-function: ease-in-out;
  }

  .artifact-raw {
    color: var(--pipeline-source);
    animation-name: raw-drift;
  }

  .artifact-raw-coord {
    top: 1.1rem;
    left: 1.4rem;
  }

  .artifact-raw-ref {
    top: 3.1rem;
    left: 2.2rem;
    animation-delay: -2s;
  }

  .artifact-raw-meter {
    right: 1.35rem;
    bottom: 2.1rem;
    animation-delay: -4s;
  }

  .artifact-release {
    color: var(--tertiary);
    animation-name: release-float;
  }

  .artifact-release-square {
    top: -4.85rem;
    right: 1.8rem;
    width: 4.2rem;
    height: 4.2rem;
    border: 1px solid currentColor;
    transform: rotate(14deg);
  }

  .artifact-release-circle {
    top: -2.7rem;
    right: 4.7rem;
    width: 1.8rem;
    height: 1.8rem;
    border: 1px solid currentColor;
    border-radius: 999px;
    animation-delay: -2.5s;
  }

  .artifact-release-label {
    top: 0.25rem;
    right: 0.1rem;
    animation-delay: -4s;
  }

  .artifact-release-grid {
    right: 8.2rem;
    bottom: 1rem;
    width: 3.2rem;
    height: 3.2rem;
    background-image: radial-gradient(currentColor 34%, transparent 36%);
    background-size: 0.75rem 0.75rem;
    animation-delay: -6s;
  }

  .artifact-release-bars {
    bottom: 2.1rem;
    left: 2.4rem;
    width: 4.7rem;
    height: 0.5rem;
    border-top: 0.25rem solid currentColor;
    border-bottom: 0.25rem solid currentColor;
    border-left: 0.25rem solid currentColor;
    opacity: 0.28;
    animation-delay: -1s;
  }

  .artifact-api {
    color: var(--secondary);
    animation-name: api-pulse;
  }

  .artifact-api-target {
    right: 1.4rem;
    bottom: 3.8rem;
    width: 1.5rem;
    height: 1.5rem;
    border: 1px solid currentColor;
    border-radius: 999px;
    animation-delay: -2s;
  }

  .artifact-api-target::after {
    position: absolute;
    inset: 0.38rem;
    content: "";
    border: 1px solid currentColor;
    border-radius: inherit;
  }

  .artifact-api-latency {
    bottom: 0.6rem;
    left: 3.9rem;
    white-space: nowrap;
    animation-delay: -4s;
  }

  .artifact-api-coord {
    top: 0.6rem;
    right: 3rem;
    text-align: right;
    animation-delay: -6s;
  }

  .artifact-api-status {
    top: 3rem;
    right: 1.6rem;
    padding: 0.12rem 0.45rem;
    background: color-mix(in srgb, var(--secondary) 12%, transparent);
    animation-delay: -1s;
  }

  .pipeline-arrow {
    animation: arrow-breathe 3.5s ease-in-out infinite;
  }

  /* Light mode uses clear, color-coded stages; dark mode keeps its original treatment. */
  :global(html:not(.dark)) .landing-pipeline {
    background: #f8f5ec;
  }

  :global(html:not(.dark)) .pipeline {
    --pipeline-source: #007b66;
  }

  :global(html:not(.dark)) .pipeline-wave-field {
    background-image: url("data:image/svg+xml,%3Csvg width='140' height='84' viewBox='0 0 140 84' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 14c28 0 42 9 70 9s42-9 70-9M0 38c28 0 42 9 70 9s42-9 70-9M0 62c28 0 42 9 70 9s42-9 70-9' fill='none' stroke='%23006b59' stroke-width='0.65' opacity='0.16'/%3E%3C/svg%3E");
  }

  :global(html:not(.dark)) .pipeline-stage-release .pipeline-number,
  :global(html:not(.dark)) .pipeline-stage-release > p:first-of-type {
    color: #b64e1f;
  }

  :global(html:not(.dark)) .pipeline-arc-left {
    color: #007b66;
    stroke: color-mix(in srgb, #007b66 62%, transparent);
  }

  :global(html:not(.dark)) .pipeline-arc-right {
    color: #b64e1f;
    stroke: color-mix(in srgb, #b64e1f 58%, #007b66);
  }

  :global(html:not(.dark)) .pipeline-traveler-source {
    color: #24a98c;
  }

  :global(html:not(.dark)) .pipeline-traveler-release {
    color: #df7548;
  }

  :global(html:not(.dark)) .pipeline-number {
    background: rgb(255 253 248 / 0.88);
    box-shadow:
      0 0 0 0.38rem color-mix(in srgb, currentColor 6%, transparent),
      0 0.75rem 1.5rem rgb(43 40 35 / 0.1);
  }

  :global(html:not(.dark)) .pipeline-number-source::before,
  :global(html:not(.dark)) .pipeline-number-api::before {
    color: #24a98c;
  }

  :global(html:not(.dark)) .pipeline-number-release::before {
    color: #df7548;
  }

  :global(html:not(.dark)) .artifact {
    opacity: 0.44;
  }

  :global(html:not(.dark)) .artifact-release {
    color: #b64e1f;
  }

  :global(html:not(.dark)) .artifact-api {
    color: #007b66;
  }

  @keyframes raw-drift {
    0%,
    100% {
      transform: translate3d(0, 0, 0);
      opacity: 0.24;
    }
    50% {
      transform: translate3d(0.45rem, -0.25rem, 0);
      opacity: 0.44;
    }
  }

  @keyframes release-float {
    0%,
    100% {
      transform: translate3d(0, 0, 0) rotate(0deg);
      opacity: 0.2;
    }
    50% {
      transform: translate3d(-0.35rem, 0.45rem, 0) rotate(4deg);
      opacity: 0.38;
    }
  }

  @keyframes api-pulse {
    0%,
    100% {
      transform: translate3d(0, 0, 0);
      opacity: 0.22;
    }
    50% {
      transform: translate3d(0.25rem, 0.35rem, 0);
      opacity: 0.42;
    }
  }

  @keyframes arrow-breathe {
    0%,
    100% {
      transform: translateX(0);
      opacity: 0.55;
    }
    50% {
      transform: translateX(0.35rem);
      opacity: 0.95;
    }
  }

  @keyframes pipeline-traveler-source-flare {
    0%,
    11.8%,
    47.8%,
    100% {
      opacity: 0;
    }
    12%,
    45% {
      opacity: 1;
    }
  }

  @keyframes pipeline-traveler-release-flare {
    0%,
    46.8%,
    82.8%,
    100% {
      opacity: 0;
    }
    47%,
    80% {
      opacity: 1;
    }
  }

  @keyframes pipeline-ring-source {
    0%,
    22%,
    100% {
      opacity: 0;
      transform: scale(0.94);
    }
    12% {
      opacity: 1;
      transform: scale(1.03);
      box-shadow:
        0 0 1.2rem color-mix(in srgb, currentColor 84%, transparent),
        0 0 2.1rem color-mix(in srgb, currentColor 48%, transparent);
    }
    21% {
      opacity: 0;
      transform: scale(1.32);
    }
  }

  @keyframes pipeline-ring-release {
    0%,
    39%,
    57%,
    100% {
      opacity: 0;
      transform: scale(0.94);
    }
    47% {
      opacity: 1;
      transform: scale(1.03);
      box-shadow:
        0 0 1.2rem color-mix(in srgb, currentColor 84%, transparent),
        0 0 2.1rem color-mix(in srgb, currentColor 48%, transparent);
    }
    56% {
      opacity: 0;
      transform: scale(1.32);
    }
  }

  @keyframes pipeline-ring-api {
    0%,
    74% {
      opacity: 0;
      transform: scale(0.94);
    }
    82% {
      opacity: 1;
      transform: scale(1.03);
      box-shadow:
        0 0 1.2rem color-mix(in srgb, currentColor 84%, transparent),
        0 0 2.1rem color-mix(in srgb, currentColor 48%, transparent);
    }
    91%,
    100% {
      opacity: 0;
      transform: scale(1.32);
    }
  }

  @media (min-width: 768px) {
    .pipeline {
      margin-block: auto;
    }
  }

  @media (min-width: 768px) {
    .pipeline-stages {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0;
    }
  }

  @media (max-width: 900px) {
    .pipeline {
      margin-top: 1rem;
      padding-block: 2rem;
    }

    .pipeline-stages {
      gap: 2.5rem;
    }

    .pipeline-stage,
    .pipeline-stage-source,
    .pipeline-stage-release,
    .pipeline-stage-api {
      min-height: auto;
      transform: none;
    }
  }

  @media (min-width: 768px) and (max-width: 900px) {
    .pipeline {
      margin-block: auto;
    }

    /* Tablet keeps the stages level, so the connectors must meet each node. */
    .pipeline-arc-left {
      d: path("M166.667 102 C278 35 403 35 500 102");
    }

    .pipeline-arc-right {
      d: path("M500 102 C597 35 722 35 833.333 102");
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .landing-pipeline .landing-section-header,
    .landing-pipeline .pipeline-stage {
      transition: none;
    }

    .landing-pipeline:not(.landing-pipeline-revealed) .landing-section-header,
    .landing-pipeline:not(.landing-pipeline-revealed) .pipeline-stage {
      opacity: 1;
      translate: 0;
    }
  }
}
</style>
