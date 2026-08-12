<script lang="ts">
import GuidePromptBlock from './guidePromptBlock.svelte'
import GuideSubSectionHeader from './guideSubSectionHeader.svelte'

type Props = {
  eyebrow: string
  prompt: string
  promptIcon?: string
  title: string
}

let { eyebrow, prompt, promptIcon, title }: Props = $props()
</script>

<div class="border-t border-border-card pt-10">
  <GuideSubSectionHeader {eyebrow} {title} />
  <div class="mt-6 max-w-3xl">
    <GuidePromptBlock code={prompt} {promptIcon} />
  </div>
</div>
