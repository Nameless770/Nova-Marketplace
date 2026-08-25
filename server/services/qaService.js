import mongoose from 'mongoose'
import { Answer } from '../models/Answer.js'
import { Product } from '../models/Product.js'
import { Question } from '../models/Question.js'
import { Seller } from '../models/Seller.js'
import { AppError } from '../utils/errors.js'

function validId(value, code, message) {
  if (!mongoose.isValidObjectId(value)) throw new AppError(404, code, message)
}

function cursor(document) {
  return Buffer.from(JSON.stringify({ createdAt: document.createdAt, id: document._id })).toString(
    'base64url',
  )
}

function decode(raw) {
  if (!raw) return null
  try {
    const value = JSON.parse(Buffer.from(raw, 'base64url').toString())
    if (!value.createdAt || !mongoose.isValidObjectId(value.id)) throw new Error()
    return value
  } catch {
    throw new AppError(400, 'INVALID_CURSOR', 'Invalid pagination cursor')
  }
}

export async function listProductQuestions(productId, query) {
  validId(productId, 'PRODUCT_NOT_FOUND', 'Product not found')
  const filter = { productId, status: 'published' }
  const decoded = decode(query.cursor)
  if (decoded)
    filter.$or = [
      { createdAt: { $lt: new Date(decoded.createdAt) } },
      { createdAt: decoded.createdAt, _id: { $lt: decoded.id } },
    ]
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100)
  const questions = await Question.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean()
  const hasMore = questions.length > limit
  const items = questions.slice(0, limit)
  const result = await Promise.all(
    items.map(async (question) => ({
      ...question,
      answers: await Answer.find({ questionId: question._id, status: 'published' })
        .sort({ createdAt: 1, _id: 1 })
        .lean(),
    })),
  )
  return { items: result, meta: { nextCursor: hasMore ? cursor(items.at(-1)) : null, hasMore } }
}

export async function askQuestion(customerId, productId, text) {
  validId(productId, 'PRODUCT_NOT_FOUND', 'Product not found')
  const product = await Product.findOne({ _id: productId, status: 'active' }).lean()
  if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found')
  return Question.create({
    productId,
    sellerId: product.sellerId,
    customerId,
    text,
    status: 'pending',
  })
}

export async function answerQuestion(sellerUserId, questionId, text) {
  validId(questionId, 'QUESTION_NOT_FOUND', 'Question not found')
  const seller = await Seller.findOne({ ownerUserId: sellerUserId, status: 'approved' }).lean()
  if (!seller) throw new AppError(403, 'SELLER_NOT_APPROVED', 'Seller is not approved')
  const question = await Question.findOne({
    _id: questionId,
    sellerId: seller._id,
    status: { $in: ['pending', 'published'] },
  }).lean()
  if (!question) throw new AppError(404, 'QUESTION_NOT_FOUND', 'Question not found')
  return Answer.create({
    questionId,
    productId: question.productId,
    sellerId: seller._id,
    authorId: sellerUserId,
    text,
    isSellerAnswer: true,
    status: 'pending',
  })
}

export async function listSellerQuestions(sellerUserId, query) {
  const seller = await Seller.findOne({ ownerUserId: sellerUserId, status: 'approved' }).lean()
  if (!seller) throw new AppError(403, 'SELLER_NOT_APPROVED', 'Seller is not approved')
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100)
  const filter = { sellerId: seller._id }
  if (query.status) filter.status = query.status
  return {
    items: await Question.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit).lean(),
    meta: { nextCursor: null, hasMore: false },
  }
}

export async function listQuestionsForModeration(query) {
  const filter = query.status ? { status: query.status } : {}
  return Question.find(filter)
    .sort({ createdAt: 1, _id: 1 })
    .limit(Math.min(Number(query.limit) || 50, 100))
    .lean()
}

export async function listAnswersForModeration(query) {
  const filter = query.status ? { status: query.status } : {}
  return Answer.find(filter)
    .sort({ createdAt: 1, _id: 1 })
    .limit(Math.min(Number(query.limit) || 50, 100))
    .lean()
}

async function moderateQuestion(questionId, status, reason) {
  validId(questionId, 'QUESTION_NOT_FOUND', 'Question not found')
  const question = await Question.findByIdAndUpdate(
    questionId,
    {
      $set: {
        status,
        moderationReason: ['rejected', 'removed'].includes(status) ? reason : undefined,
      },
    },
    { new: true },
  ).lean()
  if (!question) throw new AppError(404, 'QUESTION_NOT_FOUND', 'Question not found')
  return question
}

export async function moderateQuestionRecord(questionId, status, reason) {
  return moderateQuestion(questionId, status, reason)
}

export async function moderateAnswer(answerId, status, reason) {
  validId(answerId, 'ANSWER_NOT_FOUND', 'Answer not found')
  const session = await mongoose.startSession()
  try {
    let answer
    await session.withTransaction(async () => {
      answer = await Answer.findById(answerId).session(session)
      if (!answer) throw new AppError(404, 'ANSWER_NOT_FOUND', 'Answer not found')
      const wasPublished = answer.status === 'published'
      answer.status = status
      answer.moderationReason = ['rejected', 'removed'].includes(status) ? reason : undefined
      await answer.save({ session })
      if (wasPublished !== (status === 'published'))
        await Question.updateOne(
          { _id: answer.questionId },
          { $inc: { answerCount: status === 'published' ? 1 : -1 } },
          { session },
        )
    })
    return answer
  } finally {
    await session.endSession()
  }
}
