<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { m } from '#lib/bits/internal/i18n.js'
import GuidePrerequisiteBlocker from './guidePrerequisiteBlocker.svelte'

type Props = {
  action: string
  href: string
  requirement: string
}

let { action, href, requirement }: Props = $props()
</script>

<GuidePrerequisiteBlocker class="mt-8">
  <div class="flex items-start gap-3">
    <Icon
      icon="material-symbols-light:warning-rounded"
      class="mt-1 size-5 shrink-0 text-error"
      aria-hidden="true"
    />
    <div class="min-w-0">
      <p>
        <strong class="text-primary"
          >{m.guide_section_missing_requirement({ requirement, action })}</strong
        >
      </p>
      <div class="mt-5 flex justify-end">
        <a
          class="inline-flex items-center border border-error bg-error px-4 py-2 font-body text-label-md font-semibold text-on-error transition-colors hover:bg-error/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error"
          {href}
        >
          {m.guide_section_missing_requirement_link({ requirement })}
        </a>
      </div>
    </div>
  </div>
</GuidePrerequisiteBlocker>
