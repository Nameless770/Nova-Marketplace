import { AppError } from '../../utils/errors.js'
import { ADMIN_TOOL_DEFINITIONS, executeAdminTool } from './adminTools.js'
import { runToolLoop } from './provider.js'

export const ADMIN_PROMPT_VERSION = 'admin-analytics@1.0.0'
const MAX_QUESTION_LENGTH = 500

const SYSTEM = `You are an analytics assistant for the administrators of an online marketplace.

HOW YOU GET DATA
- You have no knowledge of this marketplace. Every figure must come from a tool call.
- If a question cannot be answered with the tools available, say so plainly.
- Never estimate, extrapolate, or fill a gap with a plausible-sounding number.

FACTS VERSUS ANALYSIS
The interface shows administrators a table of verified figures taken directly
from the database, separately from your writing. Your job is the interpretation
that sits beside it. So:
- State what the data shows, then what you think it means, and keep those apart.
- Mark anything that is inference, comparison, or a judgement call with wording
  that makes it obviously an interpretation ("this suggests", "likely because").
- Never present a derived or estimated figure as if it were measured.
- If a number you want does not appear in a tool result, do not write it.

Be concise. Administrators are reading this to make a decision, not to be
impressed. Say when the data is too thin to support a conclusion.`

// Currency amounts the model wrote that do not appear in any verified fact.
// Flagged rather than blocked: derived figures are legitimate analysis, but an
// administrator should know which numbers were measured and which were not.
const CURRENCY_IN_PROSE = /[$£€]\s?\d[\d,]*(?:\.\d+)?/g

function normaliseAmount(text) {
  return text.replace(/[^\d.]/g, '')
}

function findUnverifiedFigures(prose, facts) {
  const verified = new Set()
  for (const item of facts) {
    for (const match of String(item.value).match(CURRENCY_IN_PROSE) ?? [])
      verified.add(normaliseAmount(match))
  }
  const unverified = []
  for (const match of prose.match(CURRENCY_IN_PROSE) ?? []) {
    if (!verified.has(normaliseAmount(match))) unverified.push(match)
  }
  return [...new Set(unverified)]
}

/**
 * Answers an administrator's question from verified data.
 *
 * The model decides which controlled functions to call; the backend executes
 * them and builds the fact table from what they actually returned. The model's
 * prose is returned alongside as analysis, never as the source of a figure.
 */
export async function askAdminAssistant(user, rawQuestion) {
  const question = typeof rawQuestion === 'string' ? rawQuestion.trim() : ''
  if (!question) throw new AppError(400, 'QUESTION_REQUIRED', 'A question is required')
  if (question.length > MAX_QUESTION_LENGTH)
    throw new AppError(400, 'QUESTION_TOO_LONG', 'Keep questions under 500 characters')

  // Today's date goes in the user turn, not the system prompt, so the cached
  // system prefix stays byte-identical between requests.
  const userContent = `Today's date is ${new Date().toISOString().slice(0, 10)}.

Administrator question: ${question}`

  const loop = await runToolLoop({
    system: SYSTEM,
    userContent,
    tools: ADMIN_TOOL_DEFINITIONS,
    executeTool: executeAdminTool,
    maxIterations: 4,
    maxTokens: 4096,
    effort: 'high',
  })

  // Facts are assembled from tool results, not parsed out of the answer.
  const facts = []
  const dataSources = []
  const failures = []
  for (const call of loop.calls) {
    if (!call.ok) {
      failures.push({ tool: call.name, error: call.outcome.error })
      continue
    }
    dataSources.push({ tool: call.name, arguments: call.input })
    for (const item of call.outcome.facts ?? []) facts.push(item)
  }

  const analysis = loop.text?.trim() ?? ''
  const unverifiedFigures = findUnverifiedFigures(analysis, facts)

  const caveats = []
  if (dataSources.length === 0)
    caveats.push('No data functions were called, so nothing here is backed by a query.')
  if (failures.length) caveats.push(`${failures.length} data lookup(s) failed.`)
  if (loop.truncated) caveats.push('The assistant stopped after its maximum number of lookups.')
  if (unverifiedFigures.length)
    caveats.push(
      `These figures appear in the analysis but not in the verified data: ${unverifiedFigures.join(', ')}.`,
    )

  return {
    question,
    // Explicitly separated in the response shape, not merely in wording.
    facts,
    analysis,
    dataSources,
    failures,
    unverifiedFigures,
    caveats,
    grounded: dataSources.length > 0,
    promptVersion: ADMIN_PROMPT_VERSION,
    usage: loop.usage,
  }
}
