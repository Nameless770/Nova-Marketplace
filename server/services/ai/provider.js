import Anthropic from '@anthropic-ai/sdk'
import { AppError } from '../../utils/errors.js'
import { redactMessages, redactPii } from './redact.js'

// The only place this process talks to the model provider. Everything else goes
// through callStructuredTool/runToolLoop, so there is exactly one egress point
// to audit.
//
// Two wire formats are supported, chosen by the shape of the API key:
//   sk-ant-…  -> Anthropic Messages API, via the official SDK
//   anything else (sk-or-…) -> an OpenAI-compatible endpoint (OpenRouter)
// The grounding layer downstream is identical either way — a provider swap
// changes transport only, never what the model is allowed to influence.
const DEFAULT_MODEL = 'claude-opus-5'
const DEFAULT_OPENAI_BASE_URL = 'https://openrouter.ai/api/v1'

// `output_config.effort` is only accepted by the larger/newer Anthropic models —
// Haiku 4.5 and Sonnet 4.5 reject it with a 400.
const MODELS_WITHOUT_EFFORT = /haiku|sonnet-4-5|claude-3/i

let client = null

function apiKey() {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) throw new AppError(503, 'AI_NOT_CONFIGURED', 'The AI assistant is not configured')
  return key
}

// An OpenAI-compatible provider is anything that is not an Anthropic key.
function usesOpenAiFormat() {
  return !(process.env.ANTHROPIC_API_KEY?.trim() ?? '').startsWith('sk-ant-')
}

export function aiModel() {
  return process.env.AI_MODEL || DEFAULT_MODEL
}

export function isAiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim())
}

function effortConfig(effort) {
  return MODELS_WITHOUT_EFFORT.test(aiModel()) ? {} : { output_config: { effort } }
}

function anthropic() {
  apiKey()
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

function mapProviderError(error) {
  if (error instanceof AppError) return error
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

/* -------------------------------------------------------------------------- */
/* OpenAI-compatible transport                                                 */
/* -------------------------------------------------------------------------- */

// Anthropic tool -> OpenAI function. Both carry the same JSON Schema; only the
// envelope differs.
function toOpenAiTool(tool) {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  }
}

async function openAiRequest(body) {
  const baseUrl = (process.env.AI_BASE_URL || DEFAULT_OPENAI_BASE_URL).replace(/\/$/, '')
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'content-type': 'application/json',
    },
    // Redacted here rather than at each call site: this is the only place the
    // OpenAI-compatible transport puts bytes on the wire.
    body: JSON.stringify({
      model: aiModel(),
      ...body,
      ...(body.messages ? { messages: redactMessages(body.messages) } : {}),
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    if (response.status === 429)
      throw new AppError(429, 'AI_RATE_LIMITED', 'The assistant is busy. Try again shortly.')
    if (response.status === 401 || response.status === 403)
      throw new AppError(503, 'AI_NOT_CONFIGURED', 'The AI assistant is not configured')
    if (/credit|quota|billing/i.test(detail))
      return Promise.reject(
        new AppError(
          503,
          'AI_NOT_CONFIGURED',
          'The assistant is unavailable: the API account is out of credit.',
        ),
      )
    throw new AppError(502, 'AI_UNAVAILABLE', 'The assistant is temporarily unavailable')
  }

  const payload = await response.json()
  // OpenRouter reports upstream provider failures inside a 200 body.
  if (payload.error)
    throw new AppError(502, 'AI_UNAVAILABLE', 'The assistant is temporarily unavailable')
  return payload
}

// Tool arguments arrive as a JSON *string*; always parse rather than string-match.
function parseToolArguments(rawArguments) {
  try {
    return JSON.parse(rawArguments || '{}')
  } catch {
    return null
  }
}

function usageFrom(payload) {
  return {
    inputTokens: payload?.usage?.prompt_tokens ?? 0,
    outputTokens: payload?.usage?.completion_tokens ?? 0,
    cacheReadTokens: 0,
  }
}

/* -------------------------------------------------------------------------- */
/* Public surface                                                              */
/* -------------------------------------------------------------------------- */

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
  const openAi = usesOpenAiFormat()
  const messages = openAi
    ? [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ]
    : [{ role: 'user', content: userContent }]
  const calls = []
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 }
  let finalText = ''
  let truncated = false

  try {
    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      // Each branch produces the same three things: the assistant's prose, the
      // tool calls it asked for, and how to append them back to the history.
      let text = ''
      let toolCalls = []

      if (openAi) {
        const payload = await openAiRequest({
          max_tokens: maxTokens,
          messages,
          tools: tools.map(toOpenAiTool),
        })
        const turnUsage = usageFrom(payload)
        usage.inputTokens += turnUsage.inputTokens
        usage.outputTokens += turnUsage.outputTokens

        const message = payload.choices?.[0]?.message ?? {}
        text = (message.content ?? '').trim()
        toolCalls = (message.tool_calls ?? []).map((call) => ({
          id: call.id,
          name: call.function?.name,
          input: parseToolArguments(call.function?.arguments),
        }))
        if (text) finalText = text
        if (toolCalls.length === 0) return { text: finalText, calls, usage, truncated: false }
        messages.push(message)
      } else {
        const response = await anthropic().messages.create({
          model: aiModel(),
          max_tokens: maxTokens,
          ...effortConfig(effort),
          system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
          tools,
          // Single egress point: strip identifiers before they leave the process.
          messages: redactMessages(messages),
        })
        usage.inputTokens += response.usage?.input_tokens ?? 0
        usage.outputTokens += response.usage?.output_tokens ?? 0
        usage.cacheReadTokens += response.usage?.cache_read_input_tokens ?? 0

        text = response.content
          .filter((block) => block.type === 'text')
          .map((block) => block.text)
          .join('\n')
          .trim()
        toolCalls = response.content
          .filter((block) => block.type === 'tool_use')
          .map((block) => ({ id: block.id, name: block.name, input: block.input }))
        if (text) finalText = text
        if (response.stop_reason !== 'tool_use' || toolCalls.length === 0)
          return { text: finalText, calls, usage, truncated: false }
        messages.push({ role: 'assistant', content: response.content })
      }

      // All tool results for a turn go back together; splitting them trains the
      // model out of making parallel calls.
      const anthropicResults = []
      for (const toolCall of toolCalls) {
        const outcome = await executeTool(toolCall.name, toolCall.input)
        calls.push({ name: toolCall.name, input: toolCall.input, ok: outcome.ok, outcome })
        const content = outcome.ok ? JSON.stringify(outcome.result) : String(outcome.error)
        if (openAi) {
          messages.push({ role: 'tool', tool_call_id: toolCall.id, content })
        } else {
          anthropicResults.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            is_error: !outcome.ok,
            content,
          })
        }
      }
      if (!openAi) messages.push({ role: 'user', content: anthropicResults })

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
    if (usesOpenAiFormat()) {
      const payload = await openAiRequest({
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
        ],
        tools: [toOpenAiTool(tool)],
        tool_choice: { type: 'function', function: { name: tool.name } },
      })
      const message = payload.choices?.[0]?.message ?? {}
      const call = (message.tool_calls ?? [])[0]
      return {
        output: call ? parseToolArguments(call.function?.arguments) : null,
        usage: usageFrom(payload),
        stopReason: payload.choices?.[0]?.finish_reason ?? null,
      }
    }

    const response = await anthropic().messages.create({
      model: aiModel(),
      max_tokens: maxTokens,
      ...effortConfig(effort),
      // Static system prompt first so the cached prefix stays stable across
      // requests; only the user turn varies.
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
      messages: [{ role: 'user', content: redactPii(userContent) }],
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
