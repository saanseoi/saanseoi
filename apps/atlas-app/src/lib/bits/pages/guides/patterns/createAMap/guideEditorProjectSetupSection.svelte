<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'

import GuideEditorProjectSetupCursorSection from '../../components/createAMap/guideEditorProjectSetupCursorSection.svelte'
import GuideEditorProjectSetupSublimeTextSection from '../../components/createAMap/guideEditorProjectSetupSublimeTextSection.svelte'
import GuideEditorProjectSetupVsCodeSection from '../../components/createAMap/guideEditorProjectSetupVsCodeSection.svelte'
import GuideEditorProjectSetupZedSection from '../../components/createAMap/guideEditorProjectSetupZedSection.svelte'

type CodeEditor = 'zed' | 'vscode' | 'sublime-text' | 'cursor' | 'other'

type Props = {
  editor?: CodeEditor
  showHeading?: boolean
}

let { editor, showHeading = true }: Props = $props()

const editorName = $derived(
  editor === 'zed'
    ? 'Zed'
    : editor === 'vscode'
      ? 'VS Code'
      : editor === 'sublime-text'
        ? 'Sublime Text'
        : editor === 'cursor'
          ? 'Cursor'
          : m.guide_setup_editor_your_editor(),
)

const instruction = $derived(
  editor === 'zed'
    ? m.guide_setup_editor_zed_instruction()
    : editor === 'vscode'
      ? m.guide_setup_editor_vscode_instruction()
      : editor === 'sublime-text'
        ? m.guide_setup_editor_sublime_text_instruction()
        : editor === 'cursor'
          ? m.guide_setup_editor_cursor_instruction()
          : undefined,
)

const description = $derived(
  editor === 'other'
    ? m.guide_setup_editor_other_description()
    : m.guide_setup_editor_description({ name: editorName }),
)
</script>

<div
  class:mt-14={showHeading}
  class:space-y-5={!showHeading}
  class="w-full min-w-0 max-w-3xl"
>
  {#if showHeading}
    <p
      class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
    >
      {@html m.guide_setup_editor_eyebrow()}
    </p>
    <h3 class="mt-1 font-display text-headline-md leading-tight font-bold text-primary">
      {@html m.guide_setup_editor_title()}
    </h3>
  {/if}
  <p class="max-w-3xl font-body text-body-md leading-7 text-foreground-alt">
    {@html description}
  </p>
  {#if instruction}
    <p class="max-w-3xl font-body text-body-md leading-7 text-foreground-alt">
      {@html instruction}
    </p>
  {/if}
  {#if editor === 'zed'}
    <GuideEditorProjectSetupZedSection />
  {:else if editor === 'vscode'}
    <GuideEditorProjectSetupVsCodeSection />
  {:else if editor === 'sublime-text'}
    <GuideEditorProjectSetupSublimeTextSection />
  {:else if editor === 'cursor'}
    <GuideEditorProjectSetupCursorSection />
  {/if}
</div>
