// Domain errors carry an HTTP status code and a stable machine-readable code so
// the Express error middleware can translate them into clean JSON responses
// without any business logic leaking into the transport layer.

class DomainError extends Error {
  constructor(message, statusCode = 400, code = 'DOMAIN_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
  }
}

class ValidationError extends DomainError {
  constructor(message = 'Invalid request') {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

class NotFoundError extends DomainError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

class ConflictError extends DomainError {
  constructor(message = 'Conflicting request') {
    super(message, 409, 'CONFLICT');
  }
}

class InsufficientBalanceError extends DomainError {
  constructor(message = 'Insufficient withdrawable balance') {
    super(message, 422, 'INSUFFICIENT_BALANCE');
  }
}

class RateLimitError extends DomainError {
  constructor(message = 'Withdrawal not allowed yet') {
    super(message, 429, 'RATE_LIMITED');
  }
}

module.exports = {
  DomainError,
  ValidationError,
  NotFoundError,
  ConflictError,
  InsufficientBalanceError,
  RateLimitError,
};
