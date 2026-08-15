<script lang="ts">
import type { Snippet } from 'svelte'

import { cn } from '#lib/bits/utilities/helpers/cn.js'

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
  .landing-pipeline:not(.landing-pipeline-active) .pipeline-traveller,
  .landing-pipeline:not(.landing-pipeline-active) .pipeline-number::before,
  .landing-pipeline:not(.landing-pipeline-active) .artefact,
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

  .pipeline-traveller {
    opacity: 0;
    filter: drop-shadow(0 0 0.35rem currentColor);
  }

  .pipeline-traveller-source {
    color: #7ff7d8;
    fill: currentColor;
    animation: pipeline-traveller-source-flare 6s linear infinite;
  }

  .pipeline-traveller-release {
    color: #ffb08c;
    fill: currentColor;
    animation: pipeline-traveller-release-flare 6s linear infinite;
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

  .pipeline-artefacts {
    position: absolute;
    inset: -3.5rem -1.25rem;
    pointer-events: none;
  }

  .artefact {
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

  .artefact-raw {
    color: var(--pipeline-source);
    animation-name: raw-drift;
  }

  .artefact-raw-coord {
    top: 1.1rem;
    left: 1.4rem;
  }

  .artefact-raw-ref {
    top: 3.1rem;
    left: 2.2rem;
    animation-delay: -2s;
  }

  .artefact-raw-meter {
    right: 1.35rem;
    bottom: 2.1rem;
    animation-delay: -4s;
  }

  .artefact-release {
    color: var(--tertiary);
    animation-name: release-float;
  }

  .artefact-release-square {
    top: -4.85rem;
    right: 1.8rem;
    width: 4.2rem;
    height: 4.2rem;
    border: 1px solid currentColor;
    transform: rotate(14deg);
  }

  .artefact-release-circle {
    top: -2.7rem;
    right: 4.7rem;
    width: 1.8rem;
    height: 1.8rem;
    border: 1px solid currentColor;
    border-radius: 999px;
    animation-delay: -2.5s;
  }

  .artefact-release-label {
    top: 0.25rem;
    right: 0.1rem;
    animation-delay: -4s;
  }

  .artefact-release-grid {
    right: 8.2rem;
    bottom: 1rem;
    width: 3.2rem;
    height: 3.2rem;
    background-image: radial-gradient(currentColor 34%, transparent 36%);
    background-size: 0.75rem 0.75rem;
    animation-delay: -6s;
  }

  .artefact-release-bars {
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

  .artefact-api {
    color: var(--secondary);
    animation-name: api-pulse;
  }

  .artefact-api-target {
    right: 1.4rem;
    bottom: 3.8rem;
    width: 1.5rem;
    height: 1.5rem;
    border: 1px solid currentColor;
    border-radius: 999px;
    animation-delay: -2s;
  }

  .artefact-api-target::after {
    position: absolute;
    inset: 0.38rem;
    content: "";
    border: 1px solid currentColor;
    border-radius: inherit;
  }

  .artefact-api-latency {
    bottom: 0.6rem;
    left: 3.9rem;
    white-space: nowrap;
    animation-delay: -4s;
  }

  .artefact-api-coord {
    top: 0.6rem;
    right: 3rem;
    text-align: right;
    animation-delay: -6s;
  }

  .artefact-api-status {
    top: 3rem;
    right: 1.6rem;
    padding: 0.12rem 0.45rem;
    background: color-mix(in srgb, var(--secondary) 12%, transparent);
    animation-delay: -1s;
  }

  .pipeline-arrow {
    animation: arrow-breathe 3.5s ease-in-out infinite;
  }

  /* Light mode uses clear, colour-coded stages; dark mode keeps its original treatment. */
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

  :global(html:not(.dark)) .pipeline-traveller-source {
    color: #24a98c;
  }

  :global(html:not(.dark)) .pipeline-traveller-release {
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

  :global(html:not(.dark)) .artefact {
    opacity: 0.44;
  }

  :global(html:not(.dark)) .artefact-release {
    color: #b64e1f;
  }

  :global(html:not(.dark)) .artefact-api {
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

  @keyframes pipeline-traveller-source-flare {
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

  @keyframes pipeline-traveller-release-flare {
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

  @media (min-width: 120rem) {
    .pipeline-panel {
      max-width: max(var(--spacing-container-max), min(63.333333vw, 112.592593vh));
      padding-inline: max(2rem, min(1.666667vw, 2.962963vh));
      padding-top: max(11.5rem, min(9.583333vw, 17.037037vh));
      padding-bottom: max(5rem, min(4.166667vw, 7.407407vh));
    }

    .landing-section-header {
      gap: max(1.5rem, min(1.25vw, 2.222222vh));
      padding-bottom: max(1.5rem, min(1.25vw, 2.222222vh));
    }

    .landing-section-header h2 {
      font-size: max(4.2rem, min(3.5vw, 6.222222vh));
    }

    .landing-section-header p {
      margin-top: max(1rem, min(0.833333vw, 1.481481vh));
      font-size: max(1.14rem, min(0.95vw, 1.688889vh));
    }

    .pipeline {
      margin-top: max(3rem, min(2.5vw, 4.444444vh));
      padding-block: max(4rem, min(3.333333vw, 5.925926vh));
    }

    .pipeline-wave-field {
      background-size: max(8.75rem, min(7.291667vw, 12.962963vh))
        max(5.25rem, min(4.375vw, 7.777778vh));
    }

    .pipeline-stages {
      min-height: max(24rem, min(20vw, 35.555556vh));
    }

    .pipeline-arc {
      height: max(15rem, min(12.5vw, 22.222222vh));
    }

    .pipeline-arc path {
      stroke-width: max(1.4px, min(0.072917vw, 0.12963vh));
    }

    .pipeline-traveller {
      r: max(6px, min(0.3125vw, 0.555556vh));
    }

    .pipeline-stage {
      min-height: max(13rem, min(10.833333vw, 19.259259vh));
      padding-block: max(2rem, min(1.666667vw, 2.962963vh));
      transform-origin: 50% min(-24rem, max(-20vw, -35.555556vh));
    }

    .pipeline-number {
      width: max(4.75rem, min(3.958333vw, 7.037037vh));
      border-width: max(1px, min(0.052083vw, 0.092593vh));
      box-shadow:
        0 0 0 max(0.38rem, min(0.316667vw, 0.562963vh))
        color-mix(in srgb, currentColor 7%, transparent),
        0 max(0.85rem, min(0.708333vw, 1.259259vh))
        max(2rem, min(1.666667vw, 2.962963vh)) rgb(0 0 0 / 0.16);
      font-size: max(1.8rem, min(1.5vw, 2.666667vh));
    }

    .pipeline-number::before {
      inset: min(-0.38rem, max(-0.316667vw, -0.562963vh));
      border-width: max(2px, min(0.104167vw, 0.185185vh));
    }

    .pipeline-stage-source,
    .pipeline-stage-api {
      transform: translateY(max(1.45rem, min(1.208333vw, 2.148148vh)));
    }

    .pipeline-stage-release {
      transform: translateY(max(3.35rem, min(2.791667vw, 4.962963vh))) scale(1.05);
    }

    .pipeline-stage > div > p:first-of-type {
      margin-top: max(1.25rem, min(1.041667vw, 1.851852vh));
      font-size: max(0.875rem, min(0.729167vw, 1.296296vh));
      letter-spacing: max(0.18em, min(0.15vw, 0.266667vh));
    }

    .pipeline-stage h2 {
      margin-top: max(0.25rem, min(0.208333vw, 0.37037vh));
      font-size: max(1.5rem, min(1.25vw, 2.222222vh));
    }

    .pipeline-stage h2 + p {
      max-width: max(20rem, min(16.666667vw, 29.62963vh));
      margin-top: max(0.5rem, min(0.416667vw, 0.740741vh));
      font-size: max(1rem, min(0.833333vw, 1.481481vh));
      line-height: max(1.5rem, min(1.25vw, 2.222222vh));
    }

    .pipeline-artefacts {
      inset: min(-3.5rem, max(-2.916667vw, -5.185185vh))
        min(-1.25rem, max(-1.041667vw, -1.851852vh));
    }

    .artefact {
      font-size: max(0.68rem, min(0.566667vw, 1.007407vh));
      letter-spacing: max(0.08em, min(0.066667vw, 0.118519vh));
    }

    .artefact-raw-coord {
      top: max(1.1rem, min(0.916667vw, 1.62963vh));
      left: max(1.4rem, min(1.166667vw, 2.074074vh));
    }

    .artefact-raw-ref {
      top: max(3.1rem, min(2.583333vw, 4.592593vh));
      left: max(2.2rem, min(1.833333vw, 3.259259vh));
    }

    .artefact-raw-meter {
      right: max(1.35rem, min(1.125vw, 2vh));
      bottom: max(2.1rem, min(1.75vw, 3.111111vh));
    }

    .artefact-release-square {
      top: min(-4.85rem, max(-4.041667vw, -7.185185vh));
      right: max(1.8rem, min(1.5vw, 2.666667vh));
      width: max(4.2rem, min(3.5vw, 6.222222vh));
      height: max(4.2rem, min(3.5vw, 6.222222vh));
      border-width: max(1px, min(0.052083vw, 0.092593vh));
    }

    .artefact-release-circle {
      top: min(-2.7rem, max(-2.25vw, -4vh));
      right: max(4.7rem, min(3.916667vw, 6.962963vh));
      width: max(1.8rem, min(1.5vw, 2.666667vh));
      height: max(1.8rem, min(1.5vw, 2.666667vh));
      border-width: max(1px, min(0.052083vw, 0.092593vh));
    }

    .artefact-release-label {
      top: max(0.25rem, min(0.208333vw, 0.37037vh));
      right: max(0.1rem, min(0.083333vw, 0.148148vh));
    }

    .artefact-release-grid {
      right: max(8.2rem, min(6.833333vw, 12.148148vh));
      bottom: max(1rem, min(0.833333vw, 1.481481vh));
      width: max(3.2rem, min(2.666667vw, 4.740741vh));
      height: max(3.2rem, min(2.666667vw, 4.740741vh));
      background-size: max(0.75rem, min(0.625vw, 1.111111vh))
        max(0.75rem, min(0.625vw, 1.111111vh));
    }

    .artefact-release-bars {
      bottom: max(2.1rem, min(1.75vw, 3.111111vh));
      left: max(2.4rem, min(2vw, 3.555556vh));
      width: max(4.7rem, min(3.916667vw, 6.962963vh));
      height: max(0.5rem, min(0.416667vw, 0.740741vh));
      border-width: max(0.25rem, min(0.208333vw, 0.37037vh));
    }

    .artefact-api-target {
      right: max(1.4rem, min(1.166667vw, 2.074074vh));
      bottom: max(3.8rem, min(3.166667vw, 5.62963vh));
      width: max(1.5rem, min(1.25vw, 2.222222vh));
      height: max(1.5rem, min(1.25vw, 2.222222vh));
      border-width: max(1px, min(0.052083vw, 0.092593vh));
    }

    .artefact-api-target::after {
      inset: max(0.38rem, min(0.316667vw, 0.562963vh));
      border-width: max(1px, min(0.052083vw, 0.092593vh));
    }

    .artefact-api-latency {
      bottom: max(0.6rem, min(0.5vw, 0.888889vh));
      left: max(3.9rem, min(3.25vw, 5.777778vh));
    }

    .artefact-api-coord {
      top: max(0.6rem, min(0.5vw, 0.888889vh));
      right: max(3rem, min(2.5vw, 4.444444vh));
    }

    .artefact-api-status {
      top: max(3rem, min(2.5vw, 4.444444vh));
      right: max(1.6rem, min(1.333333vw, 2.37037vh));
      padding: max(0.12rem, min(0.1vw, 0.177778vh))
        max(0.45rem, min(0.375vw, 0.666667vh));
    }

    .pipeline-arrow {
      padding-inline: max(0.5rem, min(0.416667vw, 0.740741vh));
      font-size: max(1.875rem, min(1.5625vw, 2.777778vh));
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
