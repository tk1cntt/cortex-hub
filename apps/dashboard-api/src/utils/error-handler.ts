import type { Context } from 'hono'
import { createLogger } from '@cortex/shared-utils'

const logger = createLogger('api-errors')

/**
 * Centralized error handler for all API routes.
 * Logs full error details and returns a consistent JSON response.
 * 
 * In development: includes full stack trace
 * In production: returns only the error message
 */
export function handleApiError(c: Context, error: unknown, context?: string) {
  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack : undefined
  const path = c.req.path
  const method = c.req.method
  
  // Log full error details for debugging
  logger.error(`[${method}] ${path}${context ? ` - ${context}` : ''}: ${message}`, {
    stack,
    method,
    path,
    query: c.req.query(),
  })

  const isDev = process.env.NODE_ENV !== 'production'
  return c.json({
    error: message,
    ...(isDev && { stack }),
  }, 500)
}
