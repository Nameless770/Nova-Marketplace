import {
  askQuestion,
  answerQuestion,
  listAnswersForModeration,
  listProductQuestions,
  listQuestionsForModeration,
  listSellerQuestions,
  moderateAnswer as moderateAnswerRecord,
  moderateQuestionRecord,
} from '../services/qaService.js'

export async function productQuestions(request, response) {
  response.json({
    success: true,
    data: await listProductQuestions(request.params.productId, request.query),
  })
}
export async function ask(request, response) {
  response.status(201).json({
    success: true,
    data: {
      question: await askQuestion(request.user._id, request.params.productId, request.body.text),
    },
  })
}
export async function answer(request, response) {
  response.status(201).json({
    success: true,
    data: {
      answer: await answerQuestion(request.user._id, request.params.questionId, request.body.text),
    },
  })
}
export async function sellerQuestions(request, response) {
  response.json({ success: true, data: await listSellerQuestions(request.user._id, request.query) })
}
export async function adminQuestions(request, response) {
  response.json({
    success: true,
    data: { questions: await listQuestionsForModeration(request.query) },
  })
}
export async function adminAnswers(request, response) {
  response.json({ success: true, data: { answers: await listAnswersForModeration(request.query) } })
}
export async function moderateQuestion(request, response) {
  response.json({
    success: true,
    data: {
      question: await moderateQuestionRecord(
        request.params.questionId,
        request.body.status,
        request.body.reason,
      ),
    },
  })
}
export async function moderateAnswer(request, response) {
  response.json({
    success: true,
    data: {
      answer: await moderateAnswerRecord(
        request.params.answerId,
        request.body.status,
        request.body.reason,
      ),
    },
  })
}
