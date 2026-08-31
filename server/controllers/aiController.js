import { askAdminAssistant } from '../services/ai/adminAssistant.js'
import { naturalLanguageSearch } from '../services/ai/nlSearchService.js'

export async function adminAssistant(request, response) {
  response.json({
    success: true,
    data: await askAdminAssistant(request.user, request.body?.question),
  })
}
import { assist } from '../services/ai/shoppingAssistant.js'

export async function search(request, response) {
  response.json({
    success: true,
    data: await naturalLanguageSearch(request.body?.query, {
      cursor: typeof request.body?.cursor === 'string' ? request.body.cursor : undefined,
      limit: Number(request.body?.limit) || undefined,
    }),
  })
}

export async function shoppingAssistant(request, response) {
  response.json({
    success: true,
    data: await assist(request.user, request.body?.query),
  })
}
