import mapFoundationBasemap from '#lib/assets/guides/map-foundation-basemap.png'
import mapFoundationData from '#lib/assets/guides/map-foundation-data.png'
import mapFoundationRender from '#lib/assets/guides/map-foundation-render.png'
import mapFoundationStyle from '#lib/assets/guides/map-foundation-style.png'
import buildItTogether from '#lib/assets/guides/build-it-together-clanker.png'
import buildItYourself from '#lib/assets/guides/build-it-yourself.png'
import mapContextLocal from '#lib/assets/guides/map-context-local.png'
import mapContextMobileEmbed from '#lib/assets/guides/map-context-mobile-embed-simple.png'
import mapContextNotebookEmbed from '#lib/assets/guides/map-context-notebook-embed.png'
import mapContextWeb from '#lib/assets/guides/map-context-web.png'
import mapContextWebEmbed from '#lib/assets/guides/map-context-web-embed.png'
import setItUpForMe from '#lib/assets/guides/set-it-up-for-me-clanker.png'
import { m } from '#lib/bits/internal/i18n.js'
import type { CreateAMapSelectionQuery } from '#lib/guides/createAMapSelections.js'

type Props = CreateAMapSelectionQuery & {
  isVpnRequired: boolean
  locale: string
  visitorRegionLabel?: string
}

/** Shapes route selections into the localised data consumed by the guide UI. */
export function createCreateAMapGuidePresentation({
  aiAccess,
  isVpnRequired,
  llmMode,
  locale,
  objective,
  terminalExperience,
  visitorRegionLabel,
  vpnAccess,
}: Props) {
  // The messages use the active Paraglide locale; this makes it a reactive input.
  void locale

  const showPublishStep =
    objective === 'web' || objective === 'web-embed' || objective === 'mobile-embed'
  const showEmbedStep = objective === 'web-embed'
  const recommendationBadge = (recommended: boolean) =>
    recommended ? m.guide_recommended() : undefined
  const vpnNote = isVpnRequired ? m.guide_agent_tool_vpn_note() : undefined
  const isAdvancedTerminalUser = terminalExperience === 'advanced'

  const agentToolChoices = [
    {
      value: 'codex-app',
      icon: 'simple-icons:openai',
      label: 'Codex app',
      description: m.guide_agent_tool_codex_app_description(),
      note: vpnNote,
      badge: recommendationBadge(!isAdvancedTerminalUser),
    },
    {
      value: 'codex-cli',
      icon: 'simple-icons:openai',
      label: 'Codex CLI',
      description: m.guide_agent_tool_codex_cli_description(),
      note: vpnNote,
      badge: recommendationBadge(isAdvancedTerminalUser),
    },
    {
      value: 'claude-cowork',
      icon: 'simple-icons:anthropic',
      label: 'Claude Cowork',
      description: m.guide_agent_tool_claude_cowork_description(),
      note: vpnNote,
      badge: recommendationBadge(!isAdvancedTerminalUser),
    },
    {
      value: 'claude-code',
      icon: 'simple-icons:anthropic',
      label: 'Claude Code',
      description: m.guide_agent_tool_claude_code_description(),
      note: vpnNote,
      badge: recommendationBadge(isAdvancedTerminalUser),
    },
    {
      value: 'cursor',
      icon: 'simple-icons:cursor',
      label: 'Cursor',
      description: m.guide_agent_tool_cursor_description(),
    },
    {
      value: 'opencode',
      icon: 'material-symbols-light:code-rounded',
      label: 'OpenCode',
      description: m.guide_agent_tool_opencode_description(),
    },
    {
      value: 'pi',
      icon: 'proicons:terminal',
      label: 'Pi',
      description: m.guide_agent_tool_pi_description(),
    },
    {
      value: 'qwen-code',
      icon: 'simple-icons:alibabacloud',
      label: 'Qwen Code',
      description: m.guide_agent_tool_qwen_code_description(),
    },
    {
      value: 'other',
      icon: 'proicons:more',
      label: 'Other',
      description: m.guide_agent_tool_other_description(),
    },
  ]

  if (terminalExperience) {
    agentToolChoices.splice(
      agentToolChoices.findIndex(choice => choice.value === 'cursor'),
      0,
      {
        value: 'zed',
        icon: 'simple-icons:zedindustries',
        label: 'Zed',
        description: m.guide_agent_tool_zed_description(),
        note: undefined,
        badge: m.guide_recommended(),
      },
    )
  }

  const availableAgentToolChoices = agentToolChoices.filter(choice => {
    if (
      isVpnRequired &&
      vpnAccess === 'no' &&
      ['codex-app', 'codex-cli', 'claude-cowork', 'claude-code'].includes(choice.value)
    ) {
      return false
    }

    return !(
      terminalExperience === 'none' &&
      ['codex-cli', 'claude-code', 'qwen-code', 'opencode', 'pi'].includes(choice.value)
    )
  })
  const chatAiServiceChoices = [
    {
      value: 'chatgpt',
      icon: 'simple-icons:openai',
      label: 'ChatGPT',
      description: m.guide_chat_service_chatgpt_description(),
      note: vpnNote,
      badge: m.guide_recommended(),
    },
    {
      value: 'claude',
      icon: 'simple-icons:anthropic',
      label: 'Claude',
      description: m.guide_chat_service_claude_description(),
      note: vpnNote,
      badge: m.guide_recommended(),
    },
    {
      value: 'deepseek',
      icon: 'simple-icons:deepseek',
      label: m.guide_llm_deepseek(),
      description: m.guide_chat_service_deepseek_description(),
      badge: m.guide_recommended(),
    },
    {
      value: 'kimi',
      icon: 'simple-icons:moonshotai',
      label: 'Kimi',
      description: m.guide_chat_service_kimi_description(),
      badge: m.guide_recommended(),
    },
    {
      value: 'gemini',
      icon: 'simple-icons:googlegemini',
      label: 'Gemini',
      description: m.guide_chat_service_gemini_description(),
    },
    {
      value: 'other',
      icon: 'proicons:more',
      label: m.guide_llm_copy_prompt(),
      description: m.guide_chat_service_other_description(),
    },
  ].filter(
    choice =>
      !(
        isVpnRequired &&
        vpnAccess === 'no' &&
        ['chatgpt', 'claude'].includes(choice.value)
      ),
  )

  const vpnHint = (yes: string, no: string) =>
    isVpnRequired && vpnAccess ? (vpnAccess === 'yes' ? yes : no) : undefined

  return {
    guideUnlocked: Boolean(objective && llmMode),
    usesAgenticAssistance: llmMode === 'assisted' && aiAccess === 'agentic',
    showPublishStep,
    outline: [
      { id: 'prerequisites', label: m.guide_step_prerequisites() },
      { id: 'project-setup', label: m.guide_step_project_setup() },
      { id: 'render', label: m.guide_step_render() },
      { id: 'basemap', label: m.guide_step_basemap() },
      { id: 'style', label: m.guide_step_style() },
      { id: 'data', label: m.guide_step_data() },
      { id: 'publish', label: m.guide_step_publish(), hidden: !showPublishStep },
      { id: 'embed', label: m.guide_step_embed(), hidden: !showEmbedStep },
    ],
    foundations: [
      {
        href: '#render',
        image: mapFoundationRender,
        title: m.guide_foundation_render_title(),
        description: m.guide_foundation_render_description(),
      },
      {
        href: '#basemap',
        image: mapFoundationBasemap,
        title: m.guide_foundation_basemap_title(),
        description: m.guide_foundation_basemap_description(),
      },
      {
        href: '#style',
        image: mapFoundationStyle,
        title: m.guide_foundation_style_title(),
        description: m.guide_foundation_style_description(),
      },
      {
        href: '#data',
        image: mapFoundationData,
        title: m.guide_foundation_data_title(),
        description: m.guide_foundation_data_description(),
      },
    ],
    objectiveChoices: [
      {
        value: 'local',
        icon: 'proicons:laptop',
        image: mapContextLocal,
        label: m.guide_objective_local(),
        description: m.guide_objective_local_description(),
        summary: m.guide_objective_local_summary(),
      },
      {
        value: 'web',
        icon: 'proicons:globe',
        image: mapContextWeb,
        label: m.guide_objective_web(),
        description: m.guide_objective_web_description(),
        summary: m.guide_objective_web_summary(),
      },
      {
        value: 'web-embed',
        icon: 'proicons:browser',
        image: mapContextWebEmbed,
        label: m.guide_objective_web_embed(),
        description: m.guide_objective_web_embed_description(),
        summary: m.guide_objective_web_embed_summary(),
      },
      {
        value: 'mobile-embed',
        icon: 'proicons:smartphone',
        image: mapContextMobileEmbed,
        label: m.guide_objective_mobile_embed(),
        description: m.guide_objective_mobile_embed_description(),
        summary: m.guide_objective_mobile_embed_summary(),
        badge: m.guide_coming_soon(),
        disabled: true,
      },
      {
        value: 'notebook-embed',
        icon: 'proicons:book',
        image: mapContextNotebookEmbed,
        label: m.guide_objective_notebook_embed(),
        description: m.guide_objective_notebook_embed_description(),
        summary: m.guide_objective_notebook_embed_summary(),
        badge: m.guide_coming_soon(),
        disabled: true,
      },
    ],
    operatingSystemChoices: [
      {
        value: 'windows',
        icon: 'simple-icons:windows11',
        label: m.guide_operating_system_windows(),
        description: m.guide_operating_system_windows_description(),
      },
      {
        value: 'macos',
        icon: 'simple-icons:apple',
        label: m.guide_operating_system_macos(),
        description: m.guide_operating_system_macos_description(),
      },
      {
        value: 'linux',
        icon: 'simple-icons:linux',
        label: m.guide_operating_system_linux(),
        description: m.guide_operating_system_linux_description(),
      },
    ],
    terminalExperienceChoices: [
      {
        value: 'none',
        icon: 'proicons:question',
        label: m.guide_terminal_experience_none(),
        description: m.guide_terminal_experience_none_description(),
      },
      {
        value: 'basic',
        icon: 'proicons:terminal',
        label: m.guide_terminal_experience_basic(),
        description: m.guide_terminal_experience_basic_description(),
      },
      {
        value: 'advanced',
        icon: 'proicons:brackets',
        label: m.guide_terminal_experience_advanced(),
        description: m.guide_terminal_experience_advanced_description(),
      },
    ],
    vpnAccessChoices: [
      {
        value: 'yes',
        icon: 'proicons:checkmark',
        label: m.guide_vpn_access_yes(),
        description: m.guide_vpn_access_yes_description(),
      },
      {
        value: 'no',
        icon: 'proicons:cancel',
        label: m.guide_vpn_access_no(),
        description: m.guide_vpn_access_no_description(),
      },
    ],
    codeEditorChoices: [
      {
        value: 'zed',
        icon: 'simple-icons:zedindustries',
        label: 'Zed',
        description: m.guide_code_editor_zed_description(),
        badge: m.guide_recommended(),
      },
      {
        value: 'vscode',
        icon: 'simple-icons:visualstudiocode',
        label: 'VS Code',
        description: m.guide_code_editor_vscode_description(),
      },
      {
        value: 'sublime-text',
        icon: 'simple-icons:sublimetext',
        label: 'Sublime Text',
        description: m.guide_code_editor_sublime_text_description(),
      },
      {
        value: 'cursor',
        icon: 'simple-icons:cursor',
        label: 'Cursor',
        description: m.guide_code_editor_cursor_description(),
      },
      {
        value: 'other',
        icon: 'proicons:more',
        label: m.guide_code_editor_other(),
        description: m.guide_code_editor_choice_other_description(),
      },
    ],
    llmChoices: [
      {
        value: 'manual',
        icon: 'proicons:book-open',
        image: buildItYourself,
        label: m.guide_llm_manual(),
        description: m.guide_llm_manual_description(),
      },
      {
        value: 'assisted',
        icon: 'proicons:sparkles',
        image: buildItTogether,
        label: m.guide_llm_assisted(),
        description: m.guide_llm_assisted_description(),
      },
      {
        value: 'handover',
        icon: 'proicons:arrow-right',
        image: setItUpForMe,
        label: m.guide_llm_handover(),
        description: m.guide_llm_handover_description(),
      },
    ],
    aiAccessChoices: [
      {
        value: 'agentic',
        icon: 'material-symbols-light:terminal-rounded',
        label: m.guide_agentic_ai_primer_agent_choice(),
        description: m.guide_agentic_ai_primer_agent_choice_description(),
        badge: m.guide_recommended(),
      },
      {
        value: 'web',
        icon: 'material-symbols-light:forum-outline-rounded',
        label: m.guide_agentic_ai_primer_web_choice(),
        description: m.guide_agentic_ai_primer_web_choice_description(),
      },
    ],
    agentToolChoices: availableAgentToolChoices,
    chatAiServiceChoices,
    chatAiServiceHint: [
      m.guide_agentic_ai_primer_agent_tools_hint(),
      vpnHint(
        m.guide_agentic_ai_primer_chat_tools_vpn_hint_yes({
          region: visitorRegionLabel ?? '',
        }),
        m.guide_agentic_ai_primer_chat_tools_vpn_hint_no({
          region: visitorRegionLabel ?? '',
        }),
      ),
    ].filter((paragraph): paragraph is string => Boolean(paragraph)),
    agentToolHint: [
      m.guide_agentic_ai_primer_agent_tools_hint(),
      terminalExperience === 'none'
        ? m.guide_agentic_ai_primer_agent_tools_terminal_hint()
        : undefined,
      vpnHint(
        m.guide_agentic_ai_primer_agent_tools_vpn_hint_yes({
          region: visitorRegionLabel ?? '',
        }),
        m.guide_agentic_ai_primer_agent_tools_vpn_hint_no({
          region: visitorRegionLabel ?? '',
        }),
      ),
    ].filter((paragraph): paragraph is string => Boolean(paragraph)),
  }
}
