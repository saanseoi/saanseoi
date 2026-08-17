import { m } from '#lib/bits/internal/i18n.js'
import type { CreateAMapSelectionQuery } from '#lib/guides/createAMapSelections.js'

type PricingOption = { detail?: string; label: string; price?: string }

export type GuidePricing = { options: PricingOption[]; paymentNote?: string }
export type LlmSetupLink = {
  setupUrl?: string
  signUpUrl?: string
  supportsOpenRouter?: boolean
}

export const llmSetupLinks: Record<string, LlmSetupLink> = {
  'codex-app': { setupUrl: 'https://learn.chatgpt.com/docs/app#getting-started' },
  'codex-cli': { setupUrl: 'https://developers.openai.com/codex/cli/' },
  'claude-code': {
    setupUrl: 'https://docs.anthropic.com/en/docs/claude-code/overview',
  },
  'claude-cowork': { setupUrl: 'https://claude.com/download' },
  'kimi-code': {
    setupUrl: 'https://www.kimi.com/code',
    signUpUrl: 'https://www.kimi.com/',
    supportsOpenRouter: true,
  },
  'qwen-code': {
    setupUrl: 'https://qwenlm.github.io/qwen-code-docs/en/users/overview/',
  },
  cursor: { setupUrl: 'https://cursor.com/docs/get-started/quickstart' },
  opencode: {
    setupUrl: 'https://openrouter.ai/docs/cookbook/coding-agents/opencode-integration',
  },
  pi: {
    setupUrl:
      'https://bertomill.medium.com/pi-coding-agent-setup-free-ai-models-via-openrouter-full-guide-fd40ea5dadb4',
  },
  zed: {},
  other: {},
  chatgpt: { setupUrl: 'https://chatgpt.com/', signUpUrl: 'https://chatgpt.com/' },
  claude: { setupUrl: 'https://claude.ai/', signUpUrl: 'https://claude.ai/' },
  gemini: {
    setupUrl: 'https://gemini.google.com/',
    signUpUrl: 'https://gemini.google.com/',
  },
  deepseek: {
    setupUrl: 'https://chat.deepseek.com/',
    signUpUrl: 'https://chat.deepseek.com/',
  },
  kimi: { setupUrl: 'https://www.kimi.com/', signUpUrl: 'https://www.kimi.com/' },
}

export function getAgentModel(agentTool: CreateAMapSelectionQuery['agentTool']) {
  if (agentTool === 'codex-app' || agentTool === 'codex-cli') {
    return m.guide_agentic_ai_readiness_model_codex()
  }
  if (agentTool === 'claude-cowork' || agentTool === 'claude-code') {
    return m.guide_agentic_ai_readiness_model_claude()
  }
  if (['zed', 'opencode', 'pi'].includes(agentTool ?? '')) {
    return m.guide_agentic_ai_readiness_model_deepseek()
  }
  if (agentTool === 'qwen-code') return m.guide_agentic_ai_readiness_model_qwen()
  if (agentTool === 'cursor') return m.guide_agentic_ai_readiness_model_cursor()
}

export function getAgentModelSelectionInstruction(
  agentTool: CreateAMapSelectionQuery['agentTool'],
) {
  if (agentTool === 'codex-app' || agentTool === 'codex-cli') {
    return m.guide_setup_agent_codex_model_instruction()
  }
  if (agentTool === 'claude-code') {
    return m.guide_setup_agent_claude_code_model_instruction()
  }
  if (agentTool === 'claude-cowork') {
    return m.guide_setup_agent_claude_cowork_model_instruction()
  }
  if (agentTool === 'qwen-code') {
    return m.guide_setup_agent_qwen_code_model_instruction()
  }
}

export function getAgentPricing(
  agentTool: CreateAMapSelectionQuery['agentTool'],
  paymentNoteOverride?: string,
): GuidePricing | undefined {
  const subscriptionDetail = m.guide_agentic_ai_readiness_subscription_detail()
  const paymentNote = paymentNoteOverride ?? m.guide_agentic_ai_readiness_payment_note()

  if (agentTool === 'codex-app' || agentTool === 'codex-cli') {
    return {
      options: [
        {
          label: m.guide_agentic_ai_readiness_codex_prepaid_tokens(),
          price: m.guide_agentic_ai_readiness_codex_prepaid_tokens_price(),
          detail: m.guide_agentic_ai_readiness_codex_prepaid_tokens_detail(),
        },
        {
          label: m.guide_agentic_ai_readiness_codex_subscription(),
          price: m.guide_agentic_ai_readiness_codex_subscription_price(),
          detail: subscriptionDetail,
        },
      ],
      paymentNote,
    }
  }

  if (agentTool === 'claude-cowork' || agentTool === 'claude-code') {
    return {
      options: [
        {
          label: m.guide_agentic_ai_readiness_claude_cowork_prepaid_tokens(),
          price: m.guide_agentic_ai_readiness_claude_cowork_prepaid_tokens_price(),
          detail: m.guide_agentic_ai_readiness_claude_cowork_prepaid_tokens_detail(),
        },
        {
          label: m.guide_agentic_ai_readiness_claude_cowork_subscription(),
          price: m.guide_agentic_ai_readiness_claude_cowork_subscription_price(),
          detail: subscriptionDetail,
        },
      ],
      paymentNote,
    }
  }

  if (agentTool === 'cursor') {
    return {
      options: [
        {
          label: m.guide_agentic_ai_readiness_cursor_free(),
          price: '$0',
          detail: m.guide_agentic_ai_readiness_cursor_free_detail(),
        },
        {
          label: m.guide_agentic_ai_readiness_cursor_subscription(),
          price: m.guide_agentic_ai_readiness_cursor_subscription_price(),
          detail: subscriptionDetail,
        },
      ],
    }
  }

  if (agentTool === 'zed' || agentTool === 'qwen-code') {
    const isZed = agentTool === 'zed'
    return {
      options: [
        {
          label: isZed
            ? m.guide_agentic_ai_readiness_zed_prepaid_tokens()
            : m.guide_agentic_ai_readiness_qwen_code_prepaid_tokens(),
          price: isZed
            ? m.guide_agentic_ai_readiness_zed_prepaid_tokens_price()
            : m.guide_agentic_ai_readiness_qwen_code_prepaid_tokens_price(),
          detail: isZed
            ? m.guide_agentic_ai_readiness_zed_prepaid_tokens_detail()
            : m.guide_agentic_ai_readiness_qwen_code_prepaid_tokens_detail(),
        },
        {
          label: isZed
            ? m.guide_agentic_ai_readiness_zed_subscription()
            : m.guide_agentic_ai_readiness_qwen_code_subscription(),
          price: isZed
            ? m.guide_agentic_ai_readiness_zed_subscription_price()
            : m.guide_agentic_ai_readiness_qwen_code_subscription_price(),
          detail: subscriptionDetail,
        },
      ],
    }
  }

  if (agentTool === 'opencode' || agentTool === 'pi') {
    return {
      options: [
        {
          label: m.guide_agentic_ai_readiness_codex_prepaid_tokens(),
          price: m.guide_agentic_ai_readiness_codex_prepaid_tokens_price(),
          detail: m.guide_agentic_ai_readiness_codex_prepaid_tokens_detail(),
        },
      ],
    }
  }
}

export function getChatPricing({
  aiAccess,
  llm,
}: Pick<CreateAMapSelectionQuery, 'aiAccess' | 'llm'>): GuidePricing | undefined {
  if (aiAccess !== 'web') return undefined
  const free = (detail: string): PricingOption => ({
    label: m.guide_chat_pricing_free(),
    price: '$0',
    detail,
  })
  const subscriptionPrices = {
    chatgpt: () => m.guide_chat_pricing_chatgpt_subscription_price(),
    claude: () => m.guide_chat_pricing_claude_subscription_price(),
    gemini: () => m.guide_chat_pricing_gemini_subscription_price(),
  }

  const subscriptionPrice = llm
    ? subscriptionPrices[llm as keyof typeof subscriptionPrices]
    : undefined
  if (subscriptionPrice) {
    return {
      options: [
        free(m.guide_chat_pricing_limited_messages()),
        {
          label: m.guide_chat_pricing_subscription(),
          price: subscriptionPrice(),
          detail: m.guide_agentic_ai_readiness_subscription_detail(),
        },
      ],
    }
  }
  if (llm === 'deepseek' || llm === 'kimi') {
    return { options: [free(m.guide_chat_pricing_free_web_access())] }
  }
}

export function getAgentProjectCommand(
  agentTool: CreateAMapSelectionQuery['agentTool'],
) {
  const commands = {
    'codex-cli': 'codex',
    'claude-code': 'claude',
    'kimi-code': 'kimi',
    'qwen-code': 'qwen',
    opencode: 'opencode',
    pi: 'pi',
  } as const
  const command = agentTool && commands[agentTool as keyof typeof commands]
  return command
    ? `mkdir saanseoi-project && cd saanseoi-project && ${command}`
    : undefined
}

export function getSelectedLlmChatUrl(llm: CreateAMapSelectionQuery['llm']) {
  const urls: Record<string, string> = {
    chatgpt: 'https://chatgpt.com/',
    claude: 'https://claude.ai/new',
    deepseek: 'https://chat.deepseek.com/',
    gemini: 'https://gemini.google.com/app',
    kimi: 'https://www.kimi.com/',
  }
  return llm ? urls[llm] : undefined
}
