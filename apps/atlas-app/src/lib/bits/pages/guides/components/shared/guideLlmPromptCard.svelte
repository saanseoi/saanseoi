<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { m } from '#lib/bits/internal/i18n.js'
import { trackClientProductUsage } from '#lib/analytics/clientProductUsage.js'

import GuideCodeBlock from './guideCodeBlock.svelte'

export type GuideLlmPromptReference = {
  code: string
  language: 'bash' | 'css' | 'powershell' | 'text' | 'typescript'
  path: string
  title: string
  type: 'CLI' | 'CSS' | 'TS'
}

type Props = {
  prompt: string
  promptIcon?: string
  references: GuideLlmPromptReference[]
  title: string
  previewAlt: string
  previewImageSrc: string
}

let { prompt, promptIcon, references, title, previewAlt, previewImageSrc }: Props =
  $props()
let view = $state<'code' | 'preview' | 'prompt'>('prompt')
let referenceIndex = $state(0)
let expanded = $state(false)

const reference = $derived(references[referenceIndex])

const trackCopy = (outcome: 'success' | 'failure', entityId: string) =>
  trackClientProductUsage({
    event: 'guide.prompt_copy',
    surface: 'guide',
    entityType: 'action',
    entityId,
    outcome,
  })

const selectReference = (offset: number) => {
  referenceIndex = (referenceIndex + offset + references.length) % references.length
}
</script>

<div
  class="grid w-full max-w-232 min-w-0 grid-rows-[minmax(0,1fr)] overflow-hidden font-mono shadow-card"
>
  <section
    aria-hidden={view !== 'prompt'}
    inert={view !== 'prompt'}
    class={`col-start-1 row-start-1 overflow-hidden border border-[color-mix(in_srgb,var(--color-secondary)_55%,#5a4a85)] bg-[#171521] transition-[opacity,transform] duration-500 backface-hidden transform-3d motion-reduce:transition-none ${
      view === 'prompt'
        ? 'pointer-events-auto opacity-100 transform-[rotateY(0deg)]'
        : 'pointer-events-none opacity-0 transform-[rotateY(-180deg)]'
    }`}
  >
    <GuideCodeBlock
      class="max-w-none"
      code={prompt}
      label={title}
      variant="prompt"
      {promptIcon}
      onCopy={outcome => trackCopy(outcome, 'prompt')}
      copyLabel={m.common_copy()}
      copiedLabel={m.common_copied()}
    >
      {#snippet actions()}
        <button
          class="inline-flex items-center gap-1.5 font-body text-label-sm font-semibold text-white/75 hover:text-white"
          type="button"
          onclick={() => (view = 'code')}
        >
          <Icon
            icon="material-symbols-light:code-rounded"
            class="size-4"
            aria-hidden="true"
          />
          {m.guide_code_block_code()}
        </button>
        <button
          class="inline-flex items-center gap-1.5 font-body text-label-sm font-semibold text-white/75 hover:text-white"
          type="button"
          onclick={() => (view = 'preview')}
        >
          <Icon icon="proicons:map" class="size-4" aria-hidden="true" />
          {m.guide_code_block_preview()}
        </button>
      {/snippet}
    </GuideCodeBlock>
  </section>

  <section
    aria-hidden={view !== 'code'}
    inert={view !== 'code'}
    class={`col-start-1 row-start-1 overflow-hidden transition-[opacity,transform] duration-500 backface-hidden transform-3d motion-reduce:transition-none ${
      view === 'code'
        ? 'pointer-events-auto opacity-100 transform-[rotateY(0deg)]'
        : 'pointer-events-none opacity-0 transform-[rotateY(180deg)]'
    }`}
  >
    {#if reference}
      {#snippet referenceLabel()}
        <span
          class="flex min-w-0 items-center gap-2 font-mono text-label-sm font-semibold text-[#d6e4ff]"
        >
          <span class="text-secondary"
            >{String(referenceIndex + 1).padStart(2, '0')}</span
          >
          <span>{reference.type}</span>
          <span aria-hidden="true">•</span>
          <span class="truncate">{reference.title}</span>
        </span>
      {/snippet}
      {#snippet referencePath()}
        <span class="mr-2 text-white/50">{m.guide_llm_prompt_card_path()}</span>
        <span>{reference.path}</span>
      {/snippet}
      {#snippet referenceActions()}
        {#if references.length > 1}
          <button
            class="inline-flex items-center text-white/75 hover:text-white"
            type="button"
            aria-label={m.guide_llm_prompt_card_previous()}
            onclick={() => selectReference(-1)}
          >
            <Icon icon="proicons:chevron-left" class="size-4" aria-hidden="true" />
          </button>
          <button
            class="inline-flex items-center text-white/75 hover:text-white"
            type="button"
            aria-label={m.guide_llm_prompt_card_next()}
            onclick={() => selectReference(1)}
          >
            <Icon icon="proicons:chevron-right" class="size-4" aria-hidden="true" />
          </button>
        {/if}
        <button
          class="inline-flex items-center gap-1.5 font-body text-label-sm font-semibold text-white/75 hover:text-white"
          type="button"
          onclick={() => (view = 'prompt')}
        >
          <Icon
            icon="material-symbols-light:auto-awesome"
            class="size-4"
            aria-hidden="true"
          />
          {m.guide_llm_prompt_card_prompt()}
        </button>
      {/snippet}
      <GuideCodeBlock
        class="max-w-none"
        code={reference.code}
        label={reference.title}
        labelContent={referenceLabel}
        subheader={referencePath}
        language={reference.language}
        variant="reference"
        copyLabel={m.common_copy()}
        copiedLabel={m.common_copied()}
        onCopy={outcome => trackCopy(outcome, 'reference')}
      >
        {#snippet leadingActions()}
          {@render referenceActions()}
        {/snippet}
      </GuideCodeBlock>
    {/if}
  </section>

  <section
    aria-label={m.guide_code_block_preview()}
    aria-hidden={view !== 'preview'}
    inert={view !== 'preview'}
    class={`${
      expanded
        ? 'fixed top-1/2 left-1/2 z-100 h-[calc(100dvh-2rem)] max-h-[1080px] w-[calc(100dvw-2rem)] -translate-x-1/2 -translate-y-1/2'
        : 'col-start-1 row-start-1'
    } flex min-h-0 flex-col overflow-hidden border border-[#596074] bg-[#131722] transition-[opacity,transform] duration-500 backface-hidden transform-3d motion-reduce:transition-none ${
      view === 'preview'
        ? 'pointer-events-auto opacity-100 transform-[rotateY(0deg)]'
        : 'pointer-events-none opacity-0 transform-[rotateY(180deg)]'
    }`}
  >
    <header
      class="flex items-center justify-between gap-3 border-b border-[#596074] bg-[#202633] px-4 py-2.5"
    >
      <span class="truncate font-mono text-label-sm font-semibold text-[#d6e4ff]"
        >{title}</span
      >
      <div class="flex shrink-0 items-center gap-4">
        <button
          class="inline-flex items-center gap-1.5 font-body text-label-sm font-semibold text-white/75 hover:text-white"
          type="button"
          onclick={() => (view = 'code')}
        >
          <Icon
            icon="material-symbols-light:code-rounded"
            class="size-4"
            aria-hidden="true"
          />
          {m.guide_code_block_code()}
        </button>
        <button
          class="inline-flex items-center gap-1.5 font-body text-label-sm font-semibold text-white/75 hover:text-white"
          type="button"
          onclick={() => (view = 'prompt')}
        >
          <Icon
            icon="material-symbols-light:auto-awesome"
            class="size-4"
            aria-hidden="true"
          />
          {m.guide_llm_prompt_card_prompt()}
        </button>
        <button
          class="inline-flex items-center gap-1.5 font-body text-label-sm font-semibold text-white/75 hover:text-white"
          type="button"
          onclick={() => (expanded = !expanded)}
        >
          <Icon
            icon={expanded ? 'ion:contract-outline' : 'ion:expand-outline'}
            class="size-4"
            aria-hidden="true"
          />
          {m.guide_code_block_expand()}
        </button>
      </div>
    </header>
    <div class="min-h-0 flex-1 overflow-auto bg-[#131722] p-4">
      <img class="h-full w-full object-contain" src={previewImageSrc} alt={previewAlt}>
    </div>
  </section>
</div>
