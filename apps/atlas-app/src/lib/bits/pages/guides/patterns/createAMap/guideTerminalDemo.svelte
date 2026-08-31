<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import Icon from '#lib/bits/primitives/icon/icon.svelte'

type Props = {
  operatingSystem?: 'windows' | 'macos' | 'linux'
  variant: 'history' | 'navigation' | 'completion' | 'interrupt'
}

let { operatingSystem, variant }: Props = $props()

const terminalExample = $derived(
  operatingSystem === 'windows'
    ? {
        completion: 'cd projects',
        completionStart: 'cd pro',
        enter: 'cd projects',
        list: 'dir',
        prompt: 'PS C:\\Users\\you',
        projectPrompt: 'PS C:\\Users\\you\\projects',
      }
    : {
        completion: 'cd projects/',
        completionStart: 'cd pro',
        enter: 'cd projects',
        list: 'ls',
        prompt: '~',
        projectPrompt: '~/projects',
      },
)
</script>

{#if variant === 'navigation'}
  <div
    class="terminal-demo"
    aria-label={m.guide_terminal_demo_navigation_label()}
    role="img"
  >
    <div class="terminal-demo__bar"><span></span><span></span><span></span></div>
    <div class="terminal-demo__body">
      <p class="terminal-demo__line terminal-demo__line--one">
        <span class="terminal-demo__prompt">{terminalExample.prompt}</span>
        {terminalExample.list}
      </p>
      <p class="terminal-demo__output terminal-demo__line--two">
        notes&nbsp;&nbsp; projects&nbsp;&nbsp; photos
      </p>
      <p class="terminal-demo__line terminal-demo__line--three">
        <span class="terminal-demo__prompt">{terminalExample.prompt}</span>
        {terminalExample.enter}
      </p>
      <p class="terminal-demo__line terminal-demo__line--four">
        <span class="terminal-demo__prompt">{terminalExample.projectPrompt}</span>
        cd ..
      </p>
      <p class="terminal-demo__line terminal-demo__line--five">
        <span class="terminal-demo__prompt">{terminalExample.prompt}</span>
        <span class="terminal-demo__cursor"></span>
      </p>
    </div>
  </div>
{:else if variant === 'completion'}
  <div
    class="terminal-demo"
    aria-label={m.guide_terminal_demo_completion_label()}
    role="img"
  >
    <div class="terminal-demo__bar"><span></span><span></span><span></span></div>
    <div class="terminal-demo__body">
      <p class="terminal-demo__line terminal-demo__line--one">
        <span class="terminal-demo__prompt">{terminalExample.prompt}</span>
        {terminalExample.completionStart}<span class="terminal-demo__cursor"></span>
      </p>
      <div class="terminal-demo__key terminal-demo__key--tab">
        <Icon icon="material-symbols-light:keyboard-tab-rounded" aria-hidden="true" />
        Tab
      </div>
      <p class="terminal-demo__line terminal-demo__line--complete">
        <span class="terminal-demo__prompt">{terminalExample.prompt}</span>
        {terminalExample.completion}
      </p>
    </div>
  </div>
{:else if variant === 'history'}
  <div
    class="terminal-demo"
    aria-label={m.guide_terminal_demo_history_label()}
    role="img"
  >
    <div class="terminal-demo__bar"><span></span><span></span><span></span></div>
    <div class="terminal-demo__body">
      <p class="terminal-demo__line terminal-demo__line--one">
        <span class="terminal-demo__prompt">{terminalExample.projectPrompt}</span>
        bun dev
      </p>
      <div class="terminal-demo__key terminal-demo__key--up">
        <Icon
          icon="material-symbols-light:keyboard-arrow-up-rounded"
          aria-hidden="true"
        />
        Up
      </div>
      <p class="terminal-demo__line terminal-demo__line--history">
        <span class="terminal-demo__prompt">{terminalExample.projectPrompt}</span>
        bun dev<span class="terminal-demo__cursor"></span>
      </p>
    </div>
  </div>
{:else}
  <div
    class="terminal-demo"
    aria-label={m.guide_terminal_demo_interrupt_label()}
    role="img"
  >
    <div class="terminal-demo__bar"><span></span><span></span><span></span></div>
    <div class="terminal-demo__body">
      <p class="terminal-demo__line terminal-demo__line--one">
        <span class="terminal-demo__prompt">{terminalExample.projectPrompt}</span>
        bun dev
      </p>
      <p class="terminal-demo__output terminal-demo__line--two">
        Local: http://localhost:5173/
      </p>
      <div class="terminal-demo__key terminal-demo__key--interrupt">
        <Icon icon="material-symbols-light:keyboard-rounded" aria-hidden="true" />
        Ctrl + C
      </div>
      <p class="terminal-demo__line terminal-demo__line--interrupt">
        ^C <span class="terminal-demo__cursor"></span>
      </p>
    </div>
  </div>
{/if}

<style>
.terminal-demo {
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--color-secondary) 35%, transparent);
  background: color-mix(in srgb, var(--color-background) 88%, black);
}

.terminal-demo__bar {
  display: flex;
  gap: 0.3rem;
  padding: 0.55rem 0.7rem;
  border-bottom: 1px solid color-mix(in srgb, var(--color-secondary) 22%, transparent);
}

.terminal-demo__bar span {
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-foreground-alt) 52%, transparent);
}

.terminal-demo__bar span:last-child {
  background: var(--color-secondary);
}

.terminal-demo__body {
  position: relative;
  min-height: 7.75rem;
  padding: 0.85rem 0.9rem;
  font-family: var(--font-mono);
  font-size: 0.71rem;
  line-height: 1.8;
  color: var(--color-primary);
}

.terminal-demo__line,
.terminal-demo__output {
  margin: 0;
  white-space: nowrap;
}
.terminal-demo__prompt {
  color: var(--color-secondary);
}
.terminal-demo__output {
  color: var(--color-foreground-alt);
}
.terminal-demo__cursor {
  display: inline-block;
  width: 0.42rem;
  height: 1em;
  margin-left: 0.15rem;
  vertical-align: -0.15em;
  background: var(--color-secondary);
  animation: terminal-demo-blink 1s step-end infinite;
}

.terminal-demo__key {
  position: absolute;
  right: 0.7rem;
  display: flex;
  align-items: center;
  gap: 0.1rem;
  padding: 0.12rem 0.3rem;
  border: 1px solid color-mix(in srgb, var(--color-secondary) 55%, transparent);
  color: #fff;
  font-family: var(--font-body);
  font-size: 0.6rem;
  font-weight: 700;
  animation: terminal-demo-key 6s ease-in-out infinite;
}

.terminal-demo__key :global(svg) {
  width: 0.8rem;
  height: 0.8rem;
}
.terminal-demo__key--tab {
  top: 2.75rem;
}
.terminal-demo__key--up {
  top: 2.75rem;
}
.terminal-demo__key--interrupt {
  top: 3.8rem;
}
.terminal-demo__line--two,
.terminal-demo__line--three,
.terminal-demo__line--four,
.terminal-demo__line--five,
.terminal-demo__line--complete,
.terminal-demo__line--history {
  opacity: 0;
  animation: terminal-demo-reveal 6s infinite;
}
.terminal-demo__line--interrupt {
  margin-top: 1.8rem;
  opacity: 0;
  animation: terminal-demo-reveal 6s 2.8s infinite;
}
.terminal-demo__line--two {
  animation-delay: 1.2s;
}
.terminal-demo__line--three {
  animation-delay: 2.4s;
}
.terminal-demo__line--four {
  animation-delay: 3.4s;
}
.terminal-demo__line--five {
  animation-delay: 4.4s;
}
.terminal-demo__line--complete,
.terminal-demo__line--history {
  margin-top: 1.8rem;
  animation-delay: 2.8s;
}

@keyframes terminal-demo-reveal {
  0%,
  19% {
    opacity: 0;
  }
  25%,
  88% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
@keyframes terminal-demo-key {
  0%,
  31% {
    opacity: 0;
    transform: translateY(0.25rem);
  }
  38%,
  49% {
    opacity: 1;
    transform: translateY(0);
  }
  56%,
  100% {
    opacity: 0;
  }
}
@keyframes terminal-demo-blink {
  50% {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .terminal-demo__cursor,
  .terminal-demo__key,
  .terminal-demo__line--two,
  .terminal-demo__line--three,
  .terminal-demo__line--four,
  .terminal-demo__line--five,
  .terminal-demo__line--complete,
  .terminal-demo__line--history,
  .terminal-demo__line--interrupt {
    animation: none;
    opacity: 1;
  }
}
</style>
