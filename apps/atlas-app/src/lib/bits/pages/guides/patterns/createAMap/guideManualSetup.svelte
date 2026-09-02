<script lang="ts">
import viteDemoPage from '#lib/assets/guides/vite-demo-page.png'
import { m } from '#lib/bits/internal/i18n.js'

import GuideCodeInstructionStep from '../../components/createAMap/guideCodeInstructionStep.svelte'
import GuideCodeBlock from '../../components/shared/guideCodeBlock.svelte'
import GuideParagraph from '../../components/shared/guideParagraph.svelte'
import GuideReference from '../../components/shared/guideReference.svelte'
import GuideScreenshot from '../../components/shared/guideScreenshot.svelte'
import GuideSubSectionHeader from '../../components/shared/guideSubSectionHeader.svelte'
import GuideTextSubHeader from '../../components/shared/guideTextSubHeader.svelte'
import GuideEditorProjectSetupSection from './guideEditorProjectSetupSection.svelte'
import GuideMacosCurlCertificateWarning from './guideMacosCurlCertificateWarning.svelte'
import GuideTerminalCommandAnatomy from './guideTerminalCommandAnatomy.svelte'

type Props = {
  bunInstallCode: string
  bunInstallExplanation: string
  codeEditor?: 'vscode' | 'zed' | 'cursor' | 'sublime-text' | 'other'
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
const terminalHomePath = $derived(operatingSystem === 'windows' ? '~' : '~/')
const terminalProjectPath = $derived(
  operatingSystem === 'windows' ? '~\\saanseoi-project' : '~/saanseoi-project',
)
const terminalLabel = (path: string, action: string) =>
  m.guide_setup_terminal_label({ action, path })
</script>

<div class="mt-8">
  {#if showGuidance && objective !== 'notebook-embed' && objective !== 'mobile-embed'}
    <section
      class="space-y-5"
      aria-label={m.guide_terminal_anatomy_command_card_title()}
    >
      <h4 class="font-display text-headline-sm font-bold text-primary">
        {@html m.guide_terminal_anatomy_command_card_title()}
      </h4>
      <GuideTerminalCommandAnatomy {operatingSystem} />
    </section>
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
    <div class:mt-8={showGuidance}>
      <GuideSubSectionHeader
        eyebrow={m.guide_setup_eyebrow()}
        title={m.guide_setup_terminal_title()}
      />
    </div>
    {#if showGuidance}
      <GuideParagraph class="mt-3">
        {@html m.guide_setup_terminal_transition()}
      </GuideParagraph>
    {/if}
    <div class="mt-7 space-y-7">
      <GuideCodeInstructionStep
        codeLabel={terminalLabel(terminalHomePath, m.guide_setup_install_bun())}
        code={bunInstallCode}
        language={terminalLanguage}
        copyLabel={m.common_copy()}
        copiedLabel={m.common_copied()}
        instruction={showGuidance ? { description: bunInstallExplanation, stepLabel: m.guide_setup_install_step_label(), stepNumber: 1, title: m.guide_setup_install_bun() } : undefined}
      />
      {#if operatingSystem === 'macos'}
        <GuideMacosCurlCertificateWarning />
      {/if}
      <GuideCodeInstructionStep
        codeLabel={terminalLabel(terminalHomePath, m.guide_setup_project())}
        code={setupCode}
        language={terminalLanguage}
        copyLabel={m.common_copy()}
        copiedLabel={m.common_copied()}
        instruction={showGuidance ? { description: m.guide_setup_project_explanation(), stepLabel: m.guide_setup_create_step_label(), stepNumber: 2, title: m.guide_setup_project() } : undefined}
      />
      <GuideParagraph>
        {@html m.guide_setup_project_directory_note({ path: terminalProjectPath })}
      </GuideParagraph>
      <GuideCodeInstructionStep
        codeLabel={terminalLabel(terminalProjectPath, m.guide_setup_start_server())}
        code="bun dev"
        language={terminalLanguage}
        copyLabel={m.common_copy()}
        copiedLabel={m.common_copied()}
        instruction={showGuidance ? { description: m.guide_setup_start_server_explanation(), stepLabel: m.guide_setup_start_step_label(), stepNumber: setupStartStepNumber, title: m.guide_setup_start_server() } : undefined}
      />
      <div class="space-y-5">
        <GuideParagraph> {@html m.guide_setup_complete()} </GuideParagraph>
        <GuideCodeInstructionStep
          codeLabel={m.guide_setup_complete_output()}
          code={viteReadyOutput}
          copyable={false}
          copyLabel={m.common_copy()}
          copiedLabel={m.common_copied()}
          instruction={showGuidance ? { description: m.guide_setup_server_address_description(), label: m.guide_setup_server_address_label(), title: m.guide_setup_server_address_title() } : undefined}
        />
        <GuideParagraph>
          {@html m.guide_setup_complete_browser_before()}
          <a
            class="font-semibold text-secondary underline underline-offset-4"
            href="http://localhost:5173/"
            >http://localhost:5173/</a
          >{@html m.guide_setup_complete_browser_vite_before()}
        </GuideParagraph>
        <div class="max-w-3xl">
          <GuideScreenshot src={viteDemoPage} alt={m.guide_setup_vite_demo_alt()} />
        </div>
        <GuideParagraph>
          <GuideReference
            href={`saanseoi:${locale.toLowerCase()}:note/vite/v1`}
            label={m.reference_vite()}
          />{@html m.guide_setup_complete_browser_vite_after()}
        </GuideParagraph>
        {#if showGuidance}
          <GuideTextSubHeader
            class="max-w-232 text-title-lg"
            title={m.guide_setup_quit_and_resume_title()}
          />
          <GuideParagraph>
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
          </GuideParagraph>
        {/if}
        <GuideParagraph> {@html m.guide_setup_continue()} </GuideParagraph>
        <GuideCodeInstructionStep
          codeLabel={terminalLabel(terminalHomePath, m.guide_setup_continue_command())}
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
