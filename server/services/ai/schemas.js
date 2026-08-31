// Strict tool schemas. `strict: true` with additionalProperties:false means the
// model's output validates exactly — but this is a convenience, not the security
// boundary. grounding.js re-checks everything regardless.

export const EXTRACT_CRITERIA_TOOL = {
  name: 'search_criteria',
  description:
    'Translate a shopper request into product search criteria. Use null for anything the shopper did not specify.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      keywords: {
        type: 'string',
        description:
          'Words describing the product itself, e.g. "wireless headphones". Exclude price and rating words.',
      },
      maxPrice: {
        type: ['number', 'null'],
        description: 'Maximum price in major currency units (e.g. 100 for $100), or null.',
      },
      minPrice: {
        type: ['number', 'null'],
        description: 'Minimum price in major currency units, or null.',
      },
      minRating: {
        type: ['number', 'null'],
        description: 'Minimum star rating from 1 to 5, or null if not requested.',
      },
      inStockOnly: {
        type: 'boolean',
        description: 'True only if the shopper implied they need it available now.',
      },
      qualities: {
        type: 'array',
        description:
          'Non-filterable qualities the shopper asked for, e.g. ["good battery life"]. Used for ranking, not filtering.',
        items: { type: 'string' },
      },
    },
    required: ['keywords', 'maxPrice', 'minPrice', 'minRating', 'inStockOnly', 'qualities'],
    additionalProperties: false,
  },
}

export const RECOMMEND_TOOL = {
  name: 'recommend_products',
  description:
    'Return recommendations chosen only from the supplied candidate products, using their exact ids.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description:
          'A short, friendly reply to the shopper. Must not contain any price, rating, or stock figure.',
      },
      recommendations: {
        type: 'array',
        description: 'Best first, at most 4. Empty when nothing fits.',
        items: {
          type: 'object',
          properties: {
            productId: {
              type: 'string',
              description: 'Must exactly match a candidate product id.',
            },
            reason: {
              type: 'string',
              description:
                'One short sentence on why it fits. No prices, ratings, or stock numbers.',
            },
          },
          required: ['productId', 'reason'],
          additionalProperties: false,
        },
      },
      noMatch: {
        type: 'boolean',
        description: 'True when no candidate genuinely fits the request.',
      },
    },
    required: ['message', 'recommendations', 'noMatch'],
    additionalProperties: false,
  },
}
