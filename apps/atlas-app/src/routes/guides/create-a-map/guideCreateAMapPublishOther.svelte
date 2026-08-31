<script lang="ts">
import { GuideCodeBlock, GuidePromptBlock } from '#lib/bits/pages/guides/index.js'
import { m } from '#lib/bits/internal/i18n.js'

import GuidePublishRequirement from './guidePublishRequirement.svelte'

type Props = {
  completed?: boolean
  onCompletedChange?: (completed: boolean) => void
  onPublishedChange?: (published: boolean) => void
  terminalProjectPath: string
}

let {
  completed = false,
  onCompletedChange,
  onPublishedChange,
  terminalProjectPath,
}: Props = $props()

$effect(() => {
  onPublishedChange?.(completed)
})
</script>

<div class="mt-3 space-y-10">
  <p class="max-w-3xl font-body text-body-lg leading-8 text-foreground-alt">
    {@html m.guide_publish_other_intro()}
  </p>

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
      complete={completed}
      completeAction={m.guide_publish_other_complete_action()}
      eyebrow={m.guide_publish_other_ready()}
      description={m.guide_publish_other_ready_description()}
      resetDescription={m.guide_publish_reset_description()}
      resetLabel={m.guide_readiness_reset()}
      scrollTargetId="publish-other-success-title"
      onComplete={() => onCompletedChange?.(true)}
      onReset={() => onCompletedChange?.(false)}
    >
      <div class="space-y-8">
        <div>
          <h4 class="font-display text-title-lg font-bold text-primary">
            {m.guide_publish_other_build_title()}
          </h4>
          <p class="mt-2 font-body text-body-lg leading-8 text-foreground-alt">
            {@html m.guide_publish_other_build_description()}
          </p>
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
          <p
            class="mt-2 font-body text-body-lg leading-8 text-foreground-alt [&_code]:rounded-sm [&_code]:bg-black [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-white"
          >
            {@html m.guide_publish_other_docs_description()}
          </p>
        </div>

        <div>
          <h4 class="font-display text-title-lg font-bold text-primary">
            {m.guide_publish_other_prompt_title()}
          </h4>
          <p class="mt-2 font-body text-body-lg leading-8 text-foreground-alt">
            {m.guide_publish_other_prompt_description()}
          </p>
          <div class="mt-4">
            <GuidePromptBlock code={m.guide_publish_other_prompt()} />
          </div>
        </div>

        <div>
          <h4 class="font-display text-title-lg font-bold text-primary">
            {m.guide_publish_other_check_title()}
          </h4>
          <p class="mt-2 font-body text-body-lg leading-8 text-foreground-alt">
            {m.guide_publish_other_check_description()}
          </p>
        </div>
      </div>
    </GuidePublishRequirement>
  </section>

  <section aria-labelledby="publish-other-success-title">
    <h3
      id="publish-other-success-title"
      class="font-display text-headline-sm font-bold text-primary"
    >
      {m.guide_publish_other_success_title()}
    </h3>
    <p class="mt-3 max-w-3xl font-body text-body-lg leading-8 text-foreground-alt">
      {m.guide_publish_other_success_description()}
    </p>
  </section>
</div>
