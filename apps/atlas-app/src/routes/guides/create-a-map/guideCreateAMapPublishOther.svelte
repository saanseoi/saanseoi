<script lang="ts">
import {
  GuideCodeBlock,
  GuideParagraph,
  GuidePromptBlock,
} from '#lib/bits/pages/guides/index.js'
import { m } from '#lib/bits/internal/i18n.js'

import GuidePublishRequirement from './guidePublishRequirement.svelte'

type Props = {
  completedRequirements?: number[]
  onCompletedRequirementsChange?: (requirements: number[]) => void
  onAccessibleChange?: (accessible: boolean) => void
  terminalProjectPath: string
}

let {
  completedRequirements = [],
  onCompletedRequirementsChange,
  onAccessibleChange,
  terminalProjectPath,
}: Props = $props()

$effect(() => {
  onAccessibleChange?.(completedRequirements.includes(1))
})

const completeRequirement = (requirement: number) => {
  if (completedRequirements.includes(requirement)) return
  onCompletedRequirementsChange?.([...completedRequirements, requirement])
}

const resetRequirement = (requirement: number) => {
  onCompletedRequirementsChange?.(
    completedRequirements.filter(value => value !== requirement),
  )
}
</script>

<div class="mt-3 space-y-10">
  <GuideParagraph> {@html m.guide_publish_other_intro()} </GuideParagraph>

  <section aria-labelledby="publish-other-title">
    <p
      class="font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase"
    >
      {m.guide_publish_requirement({ current: 1, total: 1 })}
    </p>
    <h3
      id="publish-other-title"
      class="mt-1 font-display text-headline-sm font-bold text-primary"
    >
      {m.guide_publish_other_title()}
    </h3>

    <GuidePublishRequirement
      id="publish-other-readiness"
      titleId="publish-other-readiness-title"
      complete={completedRequirements.includes(1)}
      completeAction={m.guide_publish_other_complete_action()}
      eyebrow={m.guide_publish_other_ready()}
      description={m.guide_publish_other_ready_description()}
      resetDescription={m.guide_publish_reset_description()}
      resetLabel={m.guide_readiness_reset()}
      scrollTargetId="publish-other-title"
      onComplete={() => completeRequirement(1)}
      onReset={() => resetRequirement(1)}
    >
      <div class="space-y-8">
        <div>
          <h4 class="font-display text-title-lg font-bold text-primary">
            {m.guide_publish_other_build_title()}
          </h4>
          <GuideParagraph class="mt-2">
            {@html m.guide_publish_other_build_description()}
          </GuideParagraph>
          <div class="mt-4">
            <GuideCodeBlock
              label={m.guide_setup_terminal_label({
                action: m.guide_publish_cloudflare_build_command(),
                path: terminalProjectPath,
              })}
              code="bun run build"
              language="bash"
              copyLabel={m.common_copy()}
              copiedLabel={m.common_copied()}
            />
          </div>
        </div>

        <div>
          <h4 class="font-display text-title-lg font-bold text-primary">
            {m.guide_publish_other_docs_title()}
          </h4>
          <GuideParagraph
            class="mt-2 [&_code]:rounded-sm [&_code]:bg-black [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-white"
          >
            {@html m.guide_publish_other_docs_description()}
          </GuideParagraph>
        </div>

        <div>
          <h4 class="font-display text-title-lg font-bold text-primary">
            {m.guide_publish_other_prompt_title()}
          </h4>
          <GuideParagraph class="mt-2">
            {m.guide_publish_other_prompt_description()}
          </GuideParagraph>
          <div class="mt-4">
            <GuidePromptBlock code={m.guide_publish_other_prompt()} />
          </div>
        </div>

        <div>
          <h4 class="font-display text-title-lg font-bold text-primary">
            {m.guide_publish_other_check_title()}
          </h4>
          <GuideParagraph class="mt-2">
            {m.guide_publish_other_check_description()}
          </GuideParagraph>
        </div>
      </div>
    </GuidePublishRequirement>
  </section>
</div>
