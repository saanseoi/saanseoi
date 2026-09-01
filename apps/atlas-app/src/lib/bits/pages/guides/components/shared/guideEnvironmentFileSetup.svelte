<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'

import { m } from '#lib/bits/internal/i18n.js'
import macosEnvFile from '#lib/assets/guides/macos_sublimetext_env.jpg'

import GuideCallout from './guideCallout.svelte'
import GuideCodeBlock from './guideCodeBlock.svelte'
import GuideParagraph from './guideParagraph.svelte'
import GuideScreenshot from './guideScreenshot.svelte'
import GuideTextHeader from './guideTextHeader.svelte'
import GuideTextSubHeader from './guideTextSubHeader.svelte'

type Props = {
  class?: string
  description: string
  editorIcon?: string
  editorLabel?: string
  environmentFileCode: string
  environmentFileExists?: boolean
  newFileShortcut?: string
  operatingSystem?: string
  terminalProjectPath?: string
  title: string
}

let {
  class: className = '',
  description,
  editorIcon,
  editorLabel,
  environmentFileCode,
  environmentFileExists = false,
  newFileShortcut,
  operatingSystem,
  terminalProjectPath,
  title,
}: Props = $props()

const environmentFileStructureCommand = $derived(
  operatingSystem === 'windows' ? 'Get-ChildItem -Force' : 'ls -la',
)
const environmentFileStructureLabel = $derived(
  m.guide_setup_terminal_label({
    action: m.guide_basemap_env_file_structure_title(),
    path:
      terminalProjectPath ??
      (operatingSystem === 'windows' ? '~\\saanseoi-project' : '~/saanseoi-project'),
  }),
)
const environmentFileStructureCode = $derived(
  operatingSystem === 'windows'
    ? [
        'PS> Get-ChildItem -Force',
        '',
        'Mode  LastWriteTime  Length  Name',
        'd----                 node_modules',
        'd----                 src',
        '-a---                .env',
        '-a---                index.html',
        '-a---                package.json',
        '-a---                tsconfig.json',
        '-a---                vite.config.ts',
      ].join('\n')
    : [
        'total 72',
        'drwxr-xr-x@ 11 saan seoi    352 Aug 26 21:28 .',
        'drwxr-x---@ 66 saan seoi   2112 Aug 26 21:33 ..',
        '-rw-r--r--   1 saan seoi     68 Aug 26 21:30 .env',
        '-rw-r--r--@  1 saan seoi    253 Aug 26 20:52 .gitignore',
        '-rw-r--r--@  1 saan seoi  15617 Aug 26 21:03 bun.lock',
        '-rw-r--r--@  1 saan seoi    366 Aug 26 20:52 index.html',
        'drwxr-xr-x@ 36 saan seoi   1152 Aug 26 21:03 node_modules',
        '-rw-r--r--@  1 saan seoi    327 Aug 26 21:03 package.json',
        'drwxr-xr-x@  4 saan seoi    128 Aug 26 20:52 public',
        'drwxr-xr-x@  6 saan seoi    192 Aug 26 20:52 src',
        '-rw-r--r--@  1 saan seoi    560 Aug 26 20:52 tsconfig.json',
      ].join('\n'),
)
</script>

<div class={`border-t border-border-card pt-8 ${className}`}>
  <GuideTextHeader as="h4" {title} class="text-headline-sm" />
  <GuideParagraph
    class="mt-3 [&_code]:rounded-sm [&_code]:border [&_code]:border-border-card [&_code]:bg-surface-container-low [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em] [&_kbd]:rounded-sm [&_kbd]:border [&_kbd]:border-border-card [&_kbd]:bg-surface-container-low [&_kbd]:px-1 [&_kbd]:font-mono [&_kbd]:text-[0.85em]"
  >
    {@html editorLabel && newFileShortcut
      ? (environmentFileExists
          ? m.guide_basemap_env_file_editor_existing_instruction({ editor: editorLabel })
          : m.guide_basemap_env_file_editor_instruction({
              editor: editorLabel,
              shortcut: newFileShortcut,
            }))
      : (environmentFileExists
          ? m.guide_basemap_env_file_other_existing_instruction()
          : m.guide_basemap_env_file_other_instruction())}
  </GuideParagraph>
  {#if editorLabel === 'Sublime Text'}
    <GuideCallout class="mt-4">
      <div class="flex items-start gap-3">
        <Icon
          icon="material-symbols-light:warning-rounded"
          class="mt-0.5 size-5 shrink-0 text-[#f2c26d]"
          aria-hidden="true"
        />
        <p>{@html m.guide_basemap_env_file_sublime_location_note()}</p>
      </div>
    </GuideCallout>
    <div class="mt-5 max-w-2xl">
      <GuideScreenshot
        src={macosEnvFile}
        alt={m.guide_basemap_env_file_sublime_location_image_alt()}
      />
    </div>
    <GuideParagraph class="mt-3">
      {m.guide_basemap_env_file_sublime_hidden_file_note()}
    </GuideParagraph>
  {/if}
  {#if editorLabel === 'Zed'}
    <div class="mt-5 max-w-2xl">
      <GuideScreenshot
        src={macosEnvFile}
        alt={m.guide_basemap_env_file_zed_location_image_alt()}
      />
    </div>
  {/if}
  <GuideParagraph
    class="mt-3 [&_code]:rounded-sm [&_code]:border [&_code]:border-border-card [&_code]:bg-surface-container-low [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em]"
  >
    {@html description}
  </GuideParagraph>
  <div class="mt-5">
    <GuideCodeBlock
      label=".env"
      pathSeparator={operatingSystem === 'windows' ? '\\' : undefined}
      code={environmentFileCode}
      {editorIcon}
      copyLabel={m.common_copy()}
      copiedLabel={m.common_copied()}
      language="text"
      variant="editor"
    />
  </div>
  <div class="mt-8">
    <GuideTextSubHeader title={m.guide_basemap_env_file_structure_title()} />
    <GuideParagraph
      class="mt-3 [&_code]:rounded-sm [&_code]:border [&_code]:border-border-card [&_code]:bg-surface-container-low [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em]"
    >
      {@html operatingSystem === 'windows'
        ? m.guide_basemap_env_file_structure_description_windows()
        : m.guide_basemap_env_file_structure_description()}
    </GuideParagraph>
    <div class="mt-5">
      <GuideCodeBlock
        label={environmentFileStructureLabel}
        code={environmentFileStructureCommand}
        copyLabel={m.common_copy()}
        copiedLabel={m.common_copied()}
        language={operatingSystem === 'windows' ? 'powershell' : 'bash'}
      />
    </div>
    <div class="mt-5">
      <GuideCodeBlock
        label={m.guide_setup_complete_output()}
        code={environmentFileStructureCode}
        copyable={false}
        copyLabel={m.common_copy()}
        copiedLabel={m.common_copied()}
        language="text"
      />
    </div>
  </div>
</div>
