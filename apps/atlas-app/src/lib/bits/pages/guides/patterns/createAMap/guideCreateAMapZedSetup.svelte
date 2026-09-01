<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { slide } from 'svelte/transition'

import { m } from '#lib/bits/internal/i18n.js'
import { Button } from '#lib/bits/primitives/button/index.js'

import GuideExternalAction from '../../components/createAMap/guideExternalAction.svelte'
import GuideNumberedStepHeading from '../../components/createAMap/guideNumberedStepHeading.svelte'
import GuideSubstepHeading from '../../components/createAMap/guideSubstepHeading.svelte'
import GuideZedProjectPreparation from '../../components/createAMap/guideZedProjectPreparation.svelte'
import GuideCodeBlock from '../../components/shared/guideCodeBlock.svelte'
import GuideParagraph from '../../components/shared/guideParagraph.svelte'
import GuideScreenshot from '../../components/shared/guideScreenshot.svelte'

import apiKeyCreatedImage from '#lib/assets/guides/openrouter-api-key-created.png'
import apiKeyDialogImage from '#lib/assets/guides/openrouter-api-key-dialog.png'
import openRouterCreditsImage from '#lib/assets/guides/openrouter-credits-page.png'
import openRouterSignUpImage from '#lib/assets/guides/openrouter-sign-up.png'
import agentPanelButtonImage from '#lib/assets/guides/zed-agent-panel-button.png'
import agentPanelFinalImage from '#lib/assets/guides/zed-agent-thread-ready.png'
import agentPanelHiddenImage from '#lib/assets/guides/zed-hide-agent-panel.png'
import agentNewThreadImage from '#lib/assets/guides/zed-agent-new-thread.png'
import agentThreadImage from '#lib/assets/guides/zed-agent-thread-promotion.png'
import agentThreadModelImage from '#lib/assets/guides/zed-agent-thread-model.png'
import menuButtonImage from '#lib/assets/guides/zed-application-menu.png'
import projectReadyImage from '#lib/assets/guides/zed-project-ready.png'
import projectTrustImage from '#lib/assets/guides/zed-trust-project.png'
import zedDownloadImage from '#lib/assets/guides/zed-download-page.png'
import zedOpenRouterProviderImage from '#lib/assets/guides/zed-openrouter-provider-settings.png'
import settingsFileAfterImage from '#lib/assets/guides/zed-settings-file-after.png'
import settingsFileBeforeImage from '#lib/assets/guides/zed-settings-file-before.png'
import settingsFileMenuImage from '#lib/assets/guides/zed-settings-file-menu.png'
import settingsLlmImage from '#lib/assets/guides/zed-llm-settings.png'
import zedOpenProjectImage from '#lib/assets/guides/zed-open-project.png'

type Props = {
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  onComplete?: () => void
  operatingSystem?: 'windows' | 'macos' | 'linux'
  prompt: string
}

let {
  expanded = $bindable(true),
  onComplete,
  onExpandedChange,
  operatingSystem,
  prompt,
}: Props = $props()

const toggleExpanded = () => {
  expanded = !expanded
  onExpandedChange?.(expanded)
}
const saveShortcut = $derived(
  operatingSystem === 'macos' ? 'Command + S' : 'Control + S',
)
const settingsCode = `  "agent": {
    "default_model": {
      "provider": "openrouter",
      "model": "deepseek/deepseek-v4-flash"
    }
  }`
const fullSettingsCode = `// Zed settings
//
// For information on how to configure Zed, see the Zed
// documentation: https://zed.dev/docs/configuring-zed
//
// To see all of Zed's default settings without changing your
// custom settings, run \`zed: open default settings\` from the
// command palette (cmd-shift-p / ctrl-shift-p)
{
  "ui_font_size": 16,
  "buffer_font_size": 15,
  "theme": {
    "mode": "system",
    "light": "One Light",
    "dark": "One Dark",
  },
  "agent": {
    "default_model": {
      "provider": "openrouter",
      "model": "deepseek/deepseek-v4-flash"
    }
  }
}`
const providerNavigationScreenshots = $derived([
  {
    src: menuButtonImage,
    alt: m.guide_zed_setup_image_menu_button_alt(),
    caption: m.guide_zed_setup_image_menu_button_caption(),
  },
  {
    src: settingsLlmImage,
    alt: m.guide_zed_setup_image_llm_settings_alt(),
    caption: m.guide_zed_setup_image_llm_settings_caption(),
  },
])
const agentWorkflowScreenshots = $derived([
  {
    src: agentThreadImage,
    alt: m.guide_zed_setup_image_agent_thread_alt(),
    caption: m.guide_zed_setup_image_agent_thread_caption(),
  },
  {
    src: agentThreadModelImage,
    alt: m.guide_zed_setup_image_agent_thread_model_alt(),
    caption: m.guide_zed_setup_image_agent_thread_model_caption(),
  },
  {
    src: agentPanelHiddenImage,
    alt: m.guide_zed_setup_image_agent_panel_hidden_alt(),
    caption: m.guide_zed_setup_image_agent_panel_hidden_caption(),
  },
  {
    src: agentPanelFinalImage,
    alt: m.guide_zed_setup_image_agent_panel_final_alt(),
    caption: m.guide_zed_setup_image_agent_panel_final_caption(),
  },
  {
    src: agentNewThreadImage,
    alt: m.guide_zed_setup_image_agent_new_thread_alt(),
    caption: m.guide_zed_setup_image_agent_new_thread_caption(),
  },
])
</script>

<div
  id="zed-setup-guide"
  class="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(18rem,1fr)]"
>
  <section
    class="min-w-0 border-l-4 border-[#7dd3fc] bg-[#7dd3fc]/12"
    aria-labelledby="zed-setup-toggle-title"
  >
    <button
      class="relative flex w-full flex-wrap items-center gap-5 border-0 bg-transparent px-5 py-5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7dd3fc]"
      type="button"
      aria-controls="zed-setup-content"
      aria-expanded={expanded}
      onclick={toggleExpanded}
    >
      <div
        class="relative shrink-0 border-2 border-[#7dd3fc] px-4 py-2 font-mono text-sm font-bold text-[#7dd3fc]"
        aria-hidden="true"
      >
        <span
          class="absolute -top-3 left-3 bg-[#25333a] px-2 text-[0.65rem] tracking-[0.12em]"
          >ZED SETUP</span
        >
        <p class="m-0">$ zed init --project_</p>
      </div>
      <h3
        id="zed-setup-toggle-title"
        class="order-3 min-w-0 basis-full pr-10 font-display text-headline-sm font-bold text-primary sm:order-0 sm:flex-1 sm:basis-auto sm:pr-0"
      >
        {@html m.guide_zed_setup_toggle_label()}
      </h3>
      <Icon
        class={`absolute right-5 top-6 size-6 shrink-0 text-[#7dd3fc] transition-transform sm:static ${expanded ? 'rotate-180' : ''}`}
        icon="material-symbols-light:keyboard-arrow-down-rounded"
        aria-hidden="true"
      />
    </button>

    {#if expanded}
      <div
        id="zed-setup-content"
        class="px-5 pb-5"
        transition:slide={{ duration: 180 }}
      >
        <div class="space-y-4 border-b border-[#7dd3fc]/25 pb-8">
          <GuideParagraph> {@html m.guide_zed_setup_intro()} </GuideParagraph>
          <GuideParagraph> {@html m.guide_zed_setup_without_vpn()} </GuideParagraph>
        </div>

        <ol class="mt-8 list-none space-y-8 p-0">
          <li>
            <div
              class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,0.9fr)] lg:items-start"
            >
              <div class="space-y-4">
                <GuideNumberedStepHeading id="zed-setup-heading" number="01">
                  {@html m.guide_zed_setup_step_install()}
                </GuideNumberedStepHeading>
                <GuideParagraph>
                  {@html m.guide_zed_setup_step_install_description()}
                </GuideParagraph>
                <GuideExternalAction
                  href="https://zed.dev/download"
                  icon="proicons:arrow-down-to-bracket"
                >
                  {@html m.guide_zed_setup_download()}
                </GuideExternalAction>
              </div>
              <GuideScreenshot
                src={zedDownloadImage}
                alt={m.guide_zed_setup_image_download_alt()}
                caption={m.guide_zed_setup_image_download_caption()}
              />
            </div>
          </li>

          <li class="border-t border-border-card pt-7">
            <div
              class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,0.9fr)] lg:items-start"
            >
              <div class="space-y-4">
                <GuideNumberedStepHeading number="02">
                  {@html m.guide_zed_setup_step_account()}
                </GuideNumberedStepHeading>
                <GuideParagraph>
                  {@html m.guide_zed_setup_account_description()}
                </GuideParagraph>
                <GuideExternalAction
                  href="https://openrouter.ai/sign-up"
                  icon="proicons:user-add"
                >
                  {@html m.guide_zed_setup_account_button()}
                </GuideExternalAction>
                <GuideParagraph>
                  {@html m.guide_zed_setup_account_confirmation()}
                </GuideParagraph>
              </div>
              <GuideScreenshot
                src={openRouterSignUpImage}
                alt={m.guide_zed_setup_image_account_alt()}
                caption={m.guide_zed_setup_image_account_caption()}
              />
            </div>
          </li>

          <li class="border-t border-border-card pt-7">
            <div
              class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,0.9fr)] lg:items-start"
            >
              <div class="space-y-4">
                <GuideNumberedStepHeading number="03">
                  {@html m.guide_zed_setup_step_credit()}
                </GuideNumberedStepHeading>
                <GuideParagraph>
                  {@html m.guide_zed_setup_credit_description()}
                </GuideParagraph>
                <GuideExternalAction
                  href="https://openrouter.ai/settings/credits"
                  icon="proicons:credit-card"
                >
                  {@html m.guide_zed_setup_open_credits()}
                </GuideExternalAction>
                <GuideParagraph>
                  {@html m.guide_zed_setup_credit_note()}
                </GuideParagraph>
              </div>
              <GuideScreenshot
                src={openRouterCreditsImage}
                alt={m.guide_zed_setup_image_credits_alt()}
              />
            </div>
          </li>

          <li class="border-t border-border-card pt-7">
            <GuideNumberedStepHeading number="04">
              {@html m.guide_zed_setup_step_key()}
            </GuideNumberedStepHeading>
            <ol
              class="mt-5 list-decimal space-y-6 pl-10 marker:font-mono marker:text-[#7dd3fc]"
            >
              <li class="space-y-3 pl-1">
                <div class="flex flex-wrap items-center gap-3">
                  <GuideParagraph>
                    {@html m.guide_zed_setup_key_description()}
                  </GuideParagraph>
                  <GuideExternalAction
                    href="https://openrouter.ai/workspaces/default/keys"
                    icon="proicons:key"
                  >
                    {@html m.guide_zed_setup_open_keys()}
                  </GuideExternalAction>
                </div>
              </li>
              <li class="space-y-3 pl-1">
                <GuideParagraph>
                  {@html m.guide_zed_setup_image_api_key_dialog_caption()}
                </GuideParagraph>
                <GuideScreenshot
                  src={apiKeyDialogImage}
                  alt={m.guide_zed_setup_image_api_key_dialog_alt()}
                />
              </li>
              <li class="space-y-3 pl-1">
                <GuideParagraph> {@html m.guide_zed_setup_key_once()} </GuideParagraph>
                <GuideScreenshot
                  src={apiKeyCreatedImage}
                  alt={m.guide_zed_setup_image_api_key_created_alt()}
                />
              </li>
            </ol>
            <GuideParagraph class="mt-6">
              {@html m.guide_zed_setup_key_manage()}
            </GuideParagraph>
          </li>

          <li class="border-t border-border-card pt-7">
            <GuideNumberedStepHeading number="05">
              {@html m.guide_zed_setup_step_zed()}
            </GuideNumberedStepHeading>

            <ol class="mt-5 list-none space-y-10 p-0">
              <li class="space-y-3">
                <GuideSubstepHeading marker="1.">
                  {@html m.guide_zed_setup_open_zed_title()}
                </GuideSubstepHeading>
                <GuideParagraph>
                  {@html m.guide_zed_setup_open_zed_description()}
                </GuideParagraph>
              </li>

              <li class="space-y-4">
                <GuideSubstepHeading marker="2.">
                  {@html m.guide_zed_setup_project_title()}
                </GuideSubstepHeading>
                <GuideParagraph>
                  {@html m.guide_zed_setup_project_description()}
                </GuideParagraph>
                <GuideScreenshot
                  src={zedOpenProjectImage}
                  alt={m.guide_zed_setup_image_open_project_alt()}
                />
                <GuideZedProjectPreparation
                  {projectTrustImage}
                  {projectReadyImage}
                  projectReadyAlt={m.guide_zed_setup_image_project_ready_alt()}
                  projectReadyCaption={m.guide_zed_setup_image_project_ready_caption()}
                />
              </li>
            </ol>
          </li>

          <li class="border-t border-border-card pt-7">
            <GuideNumberedStepHeading number="06">
              {@html m.guide_zed_setup_provider_title()}
            </GuideNumberedStepHeading>
            <div class="mt-5 space-y-4">
              <GuideParagraph>
                {@html m.guide_zed_setup_provider_description()}
              </GuideParagraph>
              <div class="grid gap-5">
                {#each providerNavigationScreenshots as screenshot (screenshot.src)}
                  <GuideScreenshot {...screenshot} />
                {/each}
              </div>
              <GuideScreenshot
                src={zedOpenRouterProviderImage}
                alt={m.guide_zed_setup_image_provider_alt()}
              />
              <GuideParagraph>
                {@html m.guide_zed_setup_provider_docs()}
              </GuideParagraph>
            </div>
          </li>

          <li class="border-t border-border-card pt-7">
            <GuideNumberedStepHeading number="07">
              {@html m.guide_zed_setup_model_title()}
            </GuideNumberedStepHeading>
            <div class="mt-5 space-y-4">
              <GuideParagraph> {@html m.guide_zed_setup_model_intro()} </GuideParagraph>
              <GuideSubstepHeading marker="Step 1">
                {@html m.guide_zed_setup_model_configuration_title()}
              </GuideSubstepHeading>
              <GuideScreenshot
                src={settingsFileMenuImage}
                alt={m.guide_zed_setup_image_settings_file_menu_alt()}
                caption={m.guide_zed_setup_image_settings_file_menu_caption()}
              />
              <GuideParagraph>
                {@html m.guide_zed_setup_model_description()}
              </GuideParagraph>
              <GuideScreenshot
                src={settingsFileBeforeImage}
                alt={m.guide_zed_setup_image_settings_file_before_alt()}
                caption={m.guide_zed_setup_image_settings_file_before_caption()}
              />
              <GuideCodeBlock
                label={m.guide_zed_setup_settings_label()}
                code={settingsCode}
                copyLabel={m.common_copy()}
                copiedLabel={m.common_copied()}
              />
              <GuideParagraph>
                {@html m.guide_zed_setup_full_settings_description()}
              </GuideParagraph>
              <GuideCodeBlock
                label={m.guide_zed_setup_full_settings_label()}
                code={fullSettingsCode}
                copyLabel={m.common_copy()}
                copiedLabel={m.common_copied()}
              />
              <GuideParagraph>
                {@html m.guide_zed_setup_save({ shortcut: saveShortcut })}
              </GuideParagraph>
              <GuideScreenshot
                src={settingsFileAfterImage}
                alt={m.guide_zed_setup_image_settings_file_after_alt()}
                caption={m.guide_zed_setup_image_settings_file_after_caption()}
              />
              <div class="space-y-4 pt-6">
                <GuideSubstepHeading marker="Step 2">
                  {@html m.guide_zed_setup_ready_title()}
                </GuideSubstepHeading>
                <GuideParagraph>
                  {@html m.guide_zed_setup_ready_intro()}
                </GuideParagraph>
                <GuideScreenshot
                  src={agentPanelButtonImage}
                  alt={m.guide_zed_setup_image_agent_panel_button_alt()}
                  caption={m.guide_zed_setup_image_agent_panel_button_caption()}
                />
                <div class="grid gap-5">
                  {#each agentWorkflowScreenshots as screenshot (screenshot.src)}
                    <GuideScreenshot {...screenshot} />
                  {/each}
                </div>
              </div>
            </div>
          </li>
        </ol>
      </div>
    {/if}
  </section>

  {#if expanded}
    <aside
      class="mt-16 border-l-4 border-[#f2c26d] bg-[#f2c26d]/12 px-5 py-5"
      aria-label={m.guide_zed_setup_alternative_label()}
    >
      <GuideParagraph> {@html m.guide_zed_setup_alternative()} </GuideParagraph>
    </aside>
  {/if}
</div>

{#if expanded}
  <div class="mt-10 max-w-[58rem] space-y-4 border-t border-border-card pt-8">
    <h3 class="font-display text-headline-sm font-bold text-primary">
      {@html m.guide_zed_setup_prompt_title()}
    </h3>
    <GuideParagraph> {@html m.guide_zed_setup_prompt_intro()} </GuideParagraph>
    <GuideCodeBlock
      label={m.guide_llm_modal_prompt_label()}
      code={prompt}
      variant="prompt"
      promptIcon="simple-icons:zedindustries"
      copyLabel={m.common_copy()}
      copiedLabel={m.common_copied()}
    />
    <div class="flex justify-end pt-2">
      <Button
        class="bg-[#6fdec9] text-[#00201b] hover:bg-[#8aecd9]"
        size="compact"
        onclick={() => onComplete?.()}
      >
        <Icon
          icon="material-symbols-light:check-rounded"
          class="size-5"
          aria-hidden="true"
        />
        {@html m.guide_zed_setup_all_good()}
      </Button>
    </div>
  </div>
{/if}
