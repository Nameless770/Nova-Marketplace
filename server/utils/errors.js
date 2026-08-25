export class AppError extends Error {
  constructor(statusCode, code, message) {
    super(message)
    this.statusCode = statusCode
    this.code = code
  }
}

export function asyncHandler(handler) {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next)
}
