import { AppError } from '../../utils/errors.js'
import { criteriaToSearchQuery, fetchCandidates } from './candidates.js'
import { rehydrate, sanitizeModelProse, validateRecommendations } from './grounding.js'
import {
  EXTRACTION_SYSTEM,
  PROMPT_VERSION,
  RECOMMENDATION_SYSTEM,
  recommendationUserTurn,
} from './prompts.js'
import { callStructuredTool } from './provider.js'
import { EXTRACT_CRITERIA_TOOL, RECOMMEND_TOOL } from './schemas.js'

const MAX_QUERY_LENGTH = 500

const NO_RESULTS_MESSAGE =
  "I couldn't find anything in our catalogue matching that. Try relaxing the budget or describing the product differently."

/**
 * Steps 1-7 of the shopping assistant.
 *
 * The model appears twice and touches the database neither time: once to turn
 * language into a filter, once to choose among the rows that filter returned.
 * Everything a shopper finally sees is rebuilt from those rows.
 */
export async function assist(user, rawQuery) {
  // 1. Receive the query.
  const query = typeof rawQuery === 'string' ? rawQuery.trim() : ''
  if (!query) throw new AppError(400, 'QUERY_REQUIRED', 'A question is required')
  if (query.length > MAX_QUERY_LENGTH)
    throw new AppError(400, 'QUERY_TOO_LONG', `Keep your question under ${MAX_QUERY_LENGTH} characters`)

  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 }
  const accumulate = (turn) => {
    usage.inputTokens += turn.usage.inputTokens
    usage.outputTokens += turn.usage.outputTokens
    usage.cacheReadTokens += turn.usage.cacheReadTokens
  }

  // 2. Extract relevant criteria.
  const extraction = await callStructuredTool({
    system: EXTRACTION_SYSTEM,
    userContent: query,
    tool: EXTRACT_CRITERIA_TOOL,
    maxTokens: 1024,
    effort: 'low',
  })
  accumulate(extraction)
  const criteria = extraction.output ?? { keywords: query }

  // 3 & 4. Search the product database and retrieve candidates.
  const searchQuery = criteriaToSearchQuery(criteria)
  const { candidates, candidatesById } = await fetchCandidates(searchQuery)

  if (candidates.length === 0) {
    return {
      message: NO_RESULTS_MESSAGE,
      recommendations: [],
      noMatch: true,
      criteria: searchQuery,
      grounding: { candidateCount: 0, acceptedCount: 0, rejected: [] },
      promptVersion: PROMPT_VERSION,
      usage,
    }
  }

  // 5 & 6. Give the model verified product data and let it choose among it.
  const recommendation = await callStructuredTool({
    system: RECOMMENDATION_SYSTEM,
    userContent: recommendationUserTurn(query, candidates),
    tool: RECOMMEND_TOOL,
    maxTokens: 2048,
    effort: 'medium',
  })
  accumulate(recommendation)

  // 7. Validate against the candidate set, then rebuild from the database.
  const { accepted, rejected } = validateRecommendations(recommendation.output, candidatesById)
  const recommendations = rehydrate(accepted, candidatesById)

  if (rejected.length) {
    // A rising rate here means a prompt or model change regressed grounding.
    console.warn(
      `[ai:grounding] dropped ${rejected.length} ungrounded recommendation(s)`,
      JSON.stringify({ promptVersion: PROMPT_VERSION, userId: user?._id?.toString(), rejected }),
    )
  }

  const noMatch = recommendations.length === 0
  return {
    message: noMatch
      ? NO_RESULTS_MESSAGE
      : sanitizeModelProse(recommendation.output?.message) || 'Here are some options.',
    recommendations,
    noMatch,
    criteria: searchQuery,
    grounding: {
      candidateCount: candidates.length,
      acceptedCount: recommendations.length,
      rejected,
    },
    promptVersion: PROMPT_VERSION,
    usage,
  }
}
