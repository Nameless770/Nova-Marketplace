import Anthropic from '@anthropic-ai/sdk'
import { AppError } from '../../utils/errors.js'

// The only place this process talks to the model provider. Everything else goes
// through callStructuredTool, so there is exactly one egress point to audit.
const DEFAULT_MODEL = 'claude-opus-5'

// `output_config.effort` is only accepted by the larger/newer models — Haiku 4.5
// and Sonnet 4.5 reject it with a 400. Gating it here lets AI_MODEL point at a
// cheap model without every call failing.
const MODELS_WITHOUT_EFFORT = /haiku|sonnet-4-5|claude-3/i

function effortConfig(effort) {
  return MODELS_WITHOUT_EFFORT.test(aiModel()) ? {} : { output_config: { effort } }
}

let client = null

function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY)
    throw new AppError(503, 'AI_NOT_CONFIGURED', 'The AI assistant is not configured')
  // Constructed lazily so importing this module never requires a key.
  if (!client) {
    // An identity-linked API key must name the workspace it acts in; a
    // workspace-scoped key does not and simply ignores the header's absence.
    const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim()
    client = new Anthropic(
      workspaceId ? { defaultHeaders: { 'anthropic-workspace-id': workspaceId } } : {},
    )
  }
  return client
}

export function aiModel() {
  return process.env.AI_MODEL || DEFAULT_MODEL
}

export function isAiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

function mapProviderError(error) {
  if (error instanceof Anthropic.RateLimitError)
    return new AppError(429, 'AI_RATE_LIMITED', 'The assistant is busy. Try again shortly.')
  if (error instanceof Anthropic.AuthenticationError)
    return new AppError(503, 'AI_NOT_CONFIGURED', 'The AI assistant is not configured')
  // A billing or workspace problem arrives as a generic 400. Surfacing it as
  // "could not process that request" sends whoever is debugging down the wrong
  // path entirely, so these two get their own message.
  if (error instanceof Anthropic.BadRequestError) {
    const detail = String(error.message ?? '')
    if (/credit balance/i.test(detail))
      return new AppError(
        503,
        'AI_NOT_CONFIGURED',
        'The assistant is unavailable: the API account is out of credit.',
      )
    if (/workspace/i.test(detail))
      return new AppError(
        503,
        'AI_NOT_CONFIGURED',
        'The assistant is unavailable: the API key needs a workspace id.',
      )
    return new AppError(502, 'AI_REQUEST_REJECTED', 'The assistant could not process that request')
  }
  if (error instanceof Anthropic.APIError)
    return new AppError(502, 'AI_UNAVAILABLE', 'The assistant is temporarily unavailable')
  return error
}

/**
 * Runs a bounded tool-calling loop.
 *
 * Written out rather than delegated to a framework because the tool boundary is
 * the security boundary here and needs to stay legible: every call is dispatched
 * through `executeTool`, unknown names are refused, and the iteration count is
 * capped so a confused model cannot spin.
 *
 * Returns the final prose plus a record of every call actually executed.
 */
export async function runToolLoop({
  system,
  userContent,
  tools,
  executeTool,
  maxIterations = 4,
  maxTokens = 4096,
  effort = 'high',
}) {
  const messages = [{ role: 'user', content: userContent }]
  const calls = []
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 }
  let finalText = ''
  let truncated = false

  try {
    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const response = await anthropic().messages.create({
        model: aiModel(),
        max_tokens: maxTokens,
        ...effortConfig(effort),
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        tools,
        messages,
      })

      usage.inputTokens += response.usage?.input_tokens ?? 0
      usage.outputTokens += response.usage?.output_tokens ?? 0
      usage.cacheReadTokens += response.usage?.cache_read_input_tokens ?? 0

      const toolUses = response.content.filter((block) => block.type === 'tool_use')
      const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim()
      if (text) finalText = text

      if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
        return { text: finalText, calls, usage, truncated: false }
      }

      messages.push({ role: 'assistant', content: response.content })

      // All tool results for a turn go back in a single user message; splitting
      // them trains the model out of making parallel calls.
      const results = []
      for (const toolUse of toolUses) {
        const outcome = await executeTool(toolUse.name, toolUse.input)
        calls.push({ name: toolUse.name, input: toolUse.input, ok: outcome.ok, outcome })
        results.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          is_error: !outcome.ok,
          content: outcome.ok ? JSON.stringify(outcome.result) : String(outcome.error),
        })
      }
      messages.push({ role: 'user', content: results })

      if (iteration === maxIterations - 1) truncated = true
    }

    return { text: finalText, calls, usage, truncated }
  } catch (error) {
    throw mapProviderError(error)
  }
}

/**
 * Runs one turn that is forced to answer through a single strict tool, so the
 * result is schema-valid by construction rather than parsed out of prose.
 *
 * Returns the tool input object, or null when the model declined to call it.
 */
export async function callStructuredTool({
  system,
  userContent,
  tool,
  maxTokens = 2048,
  effort = 'medium',
}) {
  try {
    const response = await anthropic().messages.create({
      model: aiModel(),
      max_tokens: maxTokens,
      ...effortConfig(effort),
      // Static system prompt first so the cached prefix stays stable across
      // requests; only the user turn varies.
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
      messages: [{ role: 'user', content: userContent }],
    })

    const block = response.content.find((item) => item.type === 'tool_use')
    return {
      output: block?.input ?? null,
      usage: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        cacheReadTokens: response.usage?.cache_read_input_tokens ?? 0,
      },
      stopReason: response.stop_reason,
    }
  } catch (error) {
    throw mapProviderError(error)
  }
}
