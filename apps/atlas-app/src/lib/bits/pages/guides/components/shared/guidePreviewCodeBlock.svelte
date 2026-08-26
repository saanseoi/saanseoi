<script lang="ts">
import { onMount, tick, type Snippet } from 'svelte'

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
  expandable?: boolean
  expandLabel?: string
  label: string
  language?: 'bash' | 'css' | 'powershell' | 'text' | 'typescript'
  preview: Snippet
  previewLabel: string
  closeLabel?: string
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
  expandable = false,
  expandLabel,
  label,
  language = 'text',
  preview,
  previewLabel,
  closeLabel,
  showCodeLabel,
  variant = 'editor',
}: Props = $props()
let view = $state<'code' | 'preview'>('code')
let commentsVisible = $state(true)
let expanded = $state(false)
let viewTransitionName = $state<string>()
let previewInstance = $state(0)

function showPreview() {
  // Recreate an interactive preview so its map returns to the configured view.
  previewInstance += 1
  view = 'preview'
}

onMount(() => {
  if (!expandable) return
  viewTransitionName = `guide-map-preview-${crypto.randomUUID()}`
})

function expandPreview() {
  const update = async () => {
    expanded = true
    await tick()
  }

  if (!document.startViewTransition) {
    void update()
    return
  }

  void document.startViewTransition(update).finished.catch(() => {})
}

function closePreview() {
  const update = async () => {
    expanded = false
    await tick()
  }

  if (!document.startViewTransition) {
    void update()
    return
  }

  void document.startViewTransition(update).finished.catch(() => {})
}
</script>

<div
  class={`grid w-full min-w-0 max-w-[80ch] font-mono ${expanded ? '' : 'perspective-distant'}`}
>
  <div
    aria-hidden={view !== 'code'}
    inert={view !== 'code'}
    class={`col-start-1 row-start-1 w-full min-w-0 transition-[opacity,transform] duration-500 backface-hidden transform-3d motion-reduce:transition-none ${
      view === 'code'
        ? 'pointer-events-auto opacity-100 transform-[rotateY(0deg)]'
        : 'pointer-events-none opacity-0 transform-[rotateY(-180deg)]'
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
          onclick={showPreview}
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
    data-guide-map-expanded={expanded || undefined}
    style={expandable && viewTransitionName
      ? `view-transition-name: ${viewTransitionName}`
      : undefined}
    class={`${
      expanded
        ? 'fixed top-1/2 left-1/2 z-100 h-[calc(100dvh-2rem)] w-[calc(100dvw-2rem)] -translate-x-1/2 -translate-y-1/2'
        : 'col-start-1 row-start-1 h-full w-full'
    } flex min-w-0 flex-col overflow-hidden border border-[#596074] bg-[#131722] shadow-card transition-[opacity,transform] duration-500 backface-hidden contain-[size] transform-3d motion-reduce:transition-none ${
      view === 'preview'
        ? 'pointer-events-auto opacity-100 transform-[rotateY(0deg)]'
        : 'pointer-events-none opacity-0 transform-[rotateY(180deg)]'
    }`}
  >
    {#if expanded}
      <button
        class="absolute top-4 right-4 z-10 inline-flex size-10 items-center justify-center rounded-sm border border-white/25 bg-[#10151a]/90 text-white shadow-sm hover:bg-[#202633]"
        type="button"
        aria-label={closeLabel}
        onclick={closePreview}
      >
        <Icon
          icon="material-symbols-light:close-rounded"
          class="size-5"
          aria-hidden="true"
        />
      </button>
    {:else}
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
        <div class="flex shrink-0 items-center gap-4">
          {#if expandable}
            <button
              class="inline-flex size-6 items-center justify-center text-white/75 hover:text-white"
              type="button"
              aria-label={expandLabel}
              onclick={expandPreview}
            >
              <Icon icon="ion:expand-outline" class="size-4" aria-hidden="true" />
            </button>
          {/if}
          <button
            class="inline-flex items-center gap-1.5 font-body text-label-sm font-semibold text-white/75 hover:text-white"
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
        </div>
      </header>
    {/if}
    <div class={`min-h-0 flex-1 bg-[#131722] ${expanded ? '' : 'p-4'}`}>
      {#key previewInstance}
        {@render preview()}
      {/key}
    </div>
  </section>
</div>
