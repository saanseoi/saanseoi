<script lang="ts">
import viteDemoPage from '$lib/assets/guides/vite-demo-page.png'
import { m } from '$lib/bits/internal/i18n'

import GuideCodeInstructionStep from '../../components/createAMap/guideCodeInstructionStep.svelte'
import GuideCodeBlock from '../../components/shared/guideCodeBlock.svelte'
import GuideReference from '../../components/shared/guideReference.svelte'
import GuideScreenshot from '../../components/shared/guideScreenshot.svelte'
import GuideSubSectionHeader from '../../components/shared/guideSubSectionHeader.svelte'
import GuideEditorProjectSetupSection from './guideEditorProjectSetupSection.svelte'

type Props = {
  bunInstallCode: string
  bunInstallExplanation: string
  codeEditor?: 'vscode' | 'zed' | 'cursor' | 'sublime-text' | 'other'
  hostingInstallCode?: string
  hostingInstallExplanation: string
  locale: string
  notebookCode: string
  notebookLibrary?: string
  notebookRuntime?: string
  notebookSetupCode: string
  objective: 'local' | 'web' | 'web-embed' | 'mobile-embed' | 'notebook-embed'
  operatingSystem?: 'windows' | 'macos' | 'linux'
  restartProjectCode: string
  setupCode: string
  setupContinueStepNumber: number
  setupStartStepNumber: number
  stopServerModifier: string
  terminalExperience?: 'none' | 'basic' | 'advanced'
  viteReadyOutput: string
}

let {
  bunInstallCode,
  bunInstallExplanation,
  codeEditor,
  hostingInstallCode,
  hostingInstallExplanation,
  locale,
  notebookCode,
  notebookLibrary,
  notebookRuntime,
  notebookSetupCode,
  objective,
  operatingSystem,
  restartProjectCode,
  setupCode,
  setupContinueStepNumber,
  setupStartStepNumber,
  stopServerModifier,
  terminalExperience,
  viteReadyOutput,
}: Props = $props()

const terminalLanguage = $derived(operatingSystem === 'windows' ? 'powershell' : 'bash')
const showGuidance = $derived(terminalExperience !== 'advanced')
</script>

<div class="mt-14 border-t border-border-card pt-10">
  <GuideSubSectionHeader
    eyebrow={m.guide_setup_eyebrow()}
    title={m.guide_setup_title()}
  />
  {#if objective === 'notebook-embed' || objective === 'mobile-embed'}
    <p class="mt-1 max-w-3xl font-body text-body-md leading-7 text-foreground-alt">
      {@html objective === 'notebook-embed' ? m.guide_setup_notebook_manual() : m.guide_setup_mobile_manual()}
    </p>
  {:else}
    <p
      class="mt-1 max-w-3xl font-body text-body-md leading-7 text-foreground-alt [&_code]:inline-flex [&_code]:min-h-[1.55em] [&_code]:items-center [&_code]:justify-center [&_code]:rounded-[0.2rem] [&_code]:border [&_code]:border-secondary/65 [&_code]:border-b-2 [&_code]:bg-secondary-container/12 [&_code]:px-[0.35em] [&_code]:align-[0.06em] [&_code]:font-mono [&_code]:text-[0.78em] [&_code]:font-bold [&_code]:leading-none [&_code]:text-secondary"
    >
      {@html terminalExperience === 'none' || terminalExperience === 'basic'
        ? operatingSystem === 'windows'
          ? m.guide_setup_terminal_instructions_windows()
          : m.guide_setup_terminal_instructions_unix()
        : m.guide_setup_commands_before_bun()}
      <GuideReference
        href={`saanseoi:${locale.toLowerCase()}:definition/bun/v1`}
        label={m.reference_bun()}
      />
      {@html m.guide_setup_commands_after_bun()}
      <GuideReference
        href={`saanseoi:${locale.toLowerCase()}:definition/typescript/v1`}
        label={m.reference_typescript()}
      />
      {@html m.guide_setup_commands_after_typescript()}
      <GuideReference
        href={`saanseoi:${locale.toLowerCase()}:definition/packages/v1`}
        label={m.reference_packages()}
      />
      {@html m.guide_setup_commands_after_packages()}
    </p>
  {/if}
  {#if objective === 'notebook-embed'}
    {#if notebookRuntime === 'local'}
      <div class="mt-6 grid gap-5 lg:grid-cols-2">
        <GuideCodeBlock
          label={m.guide_setup_notebook_environment()}
          code={notebookSetupCode}
          copyLabel={m.common_copy()}
          copiedLabel={m.common_copied()}
        />
        <GuideCodeBlock
          label={m.guide_setup_notebook_cell()}
          code={notebookCode}
          copyLabel={m.common_copy()}
          copiedLabel={m.common_copied()}
        />
      </div>
    {:else}
      <GuideCodeBlock
        label={m.guide_setup_notebook_environment()}
        code={`%pip install ${notebookLibrary === 'maplibre-jupyter' ? 'maplibre' : 'folium'}`}
        copyLabel={m.common_copy()}
        copiedLabel={m.common_copied()}
      />
      <div class="mt-5">
        <GuideCodeBlock
          label={m.guide_setup_notebook_cell()}
          code={notebookCode}
          copyLabel={m.common_copy()}
          copiedLabel={m.common_copied()}
        />
      </div>
    {/if}
  {:else if objective !== 'mobile-embed'}
    <div class="mt-7 space-y-7">
      <GuideCodeInstructionStep
        codeLabel={m.guide_setup_install_bun()}
        code={bunInstallCode}
        language={terminalLanguage}
        copyLabel={m.common_copy()}
        copiedLabel={m.common_copied()}
        instruction={showGuidance ? { description: bunInstallExplanation, stepLabel: m.guide_setup_install_step_label(), stepNumber: 1, title: m.guide_setup_install_bun() } : undefined}
      />
      <GuideCodeInstructionStep
        codeLabel={m.guide_setup_project()}
        code={setupCode}
        language={terminalLanguage}
        copyLabel={m.common_copy()}
        copiedLabel={m.common_copied()}
        instruction={showGuidance ? { description: m.guide_setup_project_explanation(), stepLabel: m.guide_setup_create_step_label(), stepNumber: 2, title: m.guide_setup_project() } : undefined}
      />
      {#if hostingInstallCode}
        <GuideCodeInstructionStep
          codeLabel={m.guide_setup_install_hosting_tool()}
          code={hostingInstallCode}
          language={terminalLanguage}
          copyLabel={m.common_copy()}
          copiedLabel={m.common_copied()}
          instruction={showGuidance ? { description: hostingInstallExplanation, stepLabel: m.guide_setup_install_step_label(), stepNumber: 3, title: m.guide_setup_install_hosting_tool() } : undefined}
        />
      {/if}
      <GuideCodeInstructionStep
        codeLabel={m.guide_setup_start_server()}
        code="bun dev"
        language={terminalLanguage}
        copyLabel={m.common_copy()}
        copiedLabel={m.common_copied()}
        instruction={showGuidance ? { description: m.guide_setup_start_server_explanation(), stepLabel: m.guide_setup_start_step_label(), stepNumber: setupStartStepNumber, title: m.guide_setup_start_server() } : undefined}
      />
      <div class="space-y-5">
        <p class="max-w-3xl font-body text-body-md leading-7 text-foreground-alt">
          {@html m.guide_setup_complete()}
        </p>
        <GuideCodeInstructionStep
          codeLabel={m.guide_setup_complete_output()}
          code={viteReadyOutput}
          copyable={false}
          copyLabel={m.common_copy()}
          copiedLabel={m.common_copied()}
          instruction={showGuidance ? { description: m.guide_setup_server_address_description(), label: m.guide_setup_server_address_label(), title: m.guide_setup_server_address_title() } : undefined}
        />
        <p class="max-w-3xl font-body text-body-md leading-7 text-foreground-alt">
          {@html m.guide_setup_complete_browser_before()}
          <a
            class="font-semibold text-secondary underline underline-offset-4"
            href="http://localhost:5173/"
            >http://localhost:5173/</a
          >{@html m.guide_setup_complete_browser_vite_before()}
        </p>
        <div class="max-w-3xl">
          <GuideScreenshot src={viteDemoPage} alt={m.guide_setup_vite_demo_alt()} />
        </div>
        <p class="max-w-3xl font-body text-body-md leading-7 text-foreground-alt">
          <GuideReference
            href={`saanseoi:${locale.toLowerCase()}:note/vite/v1`}
            label={m.reference_vite()}
          />{@html m.guide_setup_complete_browser_vite_after()}
        </p>
        {#if showGuidance}
          <p class="max-w-3xl font-body text-body-md leading-7 text-foreground-alt">
            {@html m.guide_setup_complete_stop_before()}
            <kbd
              class="inline-flex min-h-[1.55em] items-center justify-center rounded-sm border border-secondary/65 border-b-2 bg-secondary-container px-[0.35em] align-[0.06em] font-mono text-[0.78em] font-bold leading-none text-white shadow-kbd"
              >{stopServerModifier}</kbd
            ><span class="px-0.5 font-mono text-foreground-alt" aria-hidden="true"
              >+</span
            ><kbd
              class="inline-flex min-h-[1.55em] items-center justify-center rounded-sm border border-secondary/65 border-b-2 bg-secondary-container px-[0.35em] align-[0.06em] font-mono text-[0.78em] font-bold leading-none text-white shadow-kbd"
              >C</kbd
            >{@html m.guide_setup_complete_stop_after()}
          </p>
        {/if}
        <p class="max-w-3xl font-body text-body-md leading-7 text-foreground-alt">
          {@html m.guide_setup_continue()}
        </p>
        <GuideCodeInstructionStep
          codeLabel={m.guide_setup_continue_command()}
          code={restartProjectCode}
          language={terminalLanguage}
          copyLabel={m.common_copy()}
          copiedLabel={m.common_copied()}
          instruction={showGuidance ? { description: m.guide_setup_continue_explanation(), stepLabel: m.guide_setup_resume_step_label(), stepNumber: setupContinueStepNumber, title: m.guide_setup_continue_command() } : undefined}
        />
      </div>
    </div>
  {/if}
  {#if objective !== 'notebook-embed' && objective !== 'mobile-embed'}
    <GuideEditorProjectSetupSection editor={codeEditor} />
  {/if}
</div>
