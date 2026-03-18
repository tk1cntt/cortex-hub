// ============================================================
// Custom Error Classes — Cortex Hub
// ============================================================

export class CortexError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
  ) {
    super(message)
    this.name = 'CortexError'
  }
}

export class AuthError extends CortexError {
  constructor(message: string = 'Unauthorized') {
    super(message, 'AUTH_ERROR', 401)
    this.name = 'AuthError'
  }
}

export class NotFoundError extends CortexError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404)
    this.name = 'NotFoundError'
  }
}

export class PolicyViolationError extends CortexError {
  constructor(
    message: string,
    public policy: string,
  ) {
    super(message, 'POLICY_VIOLATION', 403)
    this.name = 'PolicyViolationError'
  }
}

export class RateLimitError extends CortexError {
  constructor(
    public limit: number,
    public resetAt: string,
  ) {
    super(`Rate limit exceeded (${limit}/hr). Resets at ${resetAt}`, 'RATE_LIMIT', 429)
    this.name = 'RateLimitError'
  }
}

export class ValidationError extends CortexError {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message, 'VALIDATION_ERROR', 400)
    this.name = 'ValidationError'
  }
}
