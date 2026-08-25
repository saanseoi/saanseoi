<script lang="ts">
import type { Snippet } from 'svelte'

import Icon from '#lib/bits/primitives/icon/icon.svelte'

import GuideCodeBlock from './guideCodeBlock.svelte'

type Props = {
  code: string
  displayCode?: string
  comments?: Array<{ line: number; spacerAfter?: boolean; text: string }>
  copiedLabel: string
  copyLabel: string
  dimmedLines?: number[]
  editorIcon?: string
  label: string
  language?: 'bash' | 'css' | 'powershell' | 'text' | 'typescript'
  preview: Snippet
  previewLabel: string
  showCodeLabel: string
  variant?: 'code' | 'editor'
}

let {
  code,
  displayCode,
  comments = [],
  copiedLabel,
  copyLabel,
  dimmedLines,
  editorIcon,
  label,
  language = 'text',
  preview,
  previewLabel,
  showCodeLabel,
  variant = 'editor',
}: Props = $props()
let view = $state<'code' | 'preview'>('code')
let commentsVisible = $state(true)
</script>

<div class="grid w-full min-w-0 max-w-[80ch] font-mono [perspective:1200px]">
  <div
    aria-hidden={view !== 'code'}
    inert={view !== 'code'}
    class={`col-start-1 row-start-1 w-full min-w-0 transition-[opacity,transform] duration-500 [backface-visibility:hidden] [transform-style:preserve-3d] motion-reduce:transition-none ${
      view === 'code'
        ? 'pointer-events-auto opacity-100 [transform:rotateY(0deg)]'
        : 'pointer-events-none opacity-0 [transform:rotateY(-180deg)]'
    }`}
  >
    <GuideCodeBlock
      code={displayCode ?? code}
      copyCode={code}
      {comments}
      bind:commentsVisible
      {copiedLabel}
      {copyLabel}
      {dimmedLines}
      {editorIcon}
      {label}
      {language}
      {variant}
    >
      {#snippet actions()}
        <button
          class="inline-flex items-center gap-1.5 font-body text-label-sm font-semibold text-white/75 hover:text-white"
          type="button"
          aria-pressed="false"
          onclick={() => (view = 'preview')}
        >
          <Icon icon="proicons:map" class="size-4" aria-hidden="true" />
          {previewLabel}
        </button>
      {/snippet}
    </GuideCodeBlock>
  </div>
  <section
    aria-label={previewLabel}
    aria-hidden={view !== 'preview'}
    inert={view !== 'preview'}
    class={`col-start-1 row-start-1 flex h-full w-full min-w-0 flex-col overflow-hidden border border-[#596074] bg-[#131722] shadow-card transition-[opacity,transform] duration-500 [backface-visibility:hidden] [transform-style:preserve-3d] motion-reduce:transition-none ${
      view === 'preview'
        ? 'pointer-events-auto opacity-100 [transform:rotateY(0deg)]'
        : 'pointer-events-none opacity-0 [transform:rotateY(180deg)]'
    }`}
  >
    <header
      class="flex items-center justify-between gap-3 border-b border-[#596074] bg-[#202633] px-4 py-2.5"
    >
      <div class="flex min-w-0 items-center gap-3">
        <span
          class="inline-flex size-7 items-center justify-center rounded-sm bg-[#2d3547] text-[#a5d6ff]"
          aria-hidden="true"
        >
          <Icon icon="proicons:map" class="size-4" />
        </span>
        <span class="truncate font-mono text-label-sm font-semibold text-[#d6e4ff]"
          >{previewLabel}</span
        >
      </div>
      <button
        class="inline-flex shrink-0 items-center gap-1.5 font-body text-label-sm font-semibold text-white/75 hover:text-white"
        type="button"
        aria-pressed="true"
        onclick={() => (view = 'code')}
      >
        <Icon
          icon="material-symbols-light:code-rounded"
          class="size-4"
          aria-hidden="true"
        />
        {showCodeLabel}
      </button>
    </header>
    <div class="min-h-0 flex-1 bg-[#131722] p-4">{@render preview()}</div>
  </section>
</div>
