import { createError, type H3Error } from 'h3'

/**
 * The only place HTTP errors are constructed.
 *
 * Nitro 3 renames `statusCode` to `status` and `statusMessage` to `statusText`. Funnelling
 * every error through this file keeps that rename a one-file change rather than a sweep
 * across every route.
 */

export interface AppErrorOptions {
  /** Shown to the user, so it must stay free of anything privileged. */
  message?: string
  /** Serialised into the response body under `data`. Same constraint as `message`. */
  data?: Record<string, unknown>
  cause?: unknown
}

function appError(
  statusCode: number,
  statusText: string,
  options: AppErrorOptions = {},
): H3Error {
  return createError({
    statusCode,
    statusMessage: statusText,
    message: options.message ?? statusText,
    data: options.data,
    cause: options.cause,
  })
}

export const badRequest = (options?: AppErrorOptions) =>
  appError(400, 'Bad Request', options)

export const unauthorized = (options?: AppErrorOptions) =>
  appError(401, 'Unauthorized', options)

export const forbidden = (options?: AppErrorOptions) =>
  appError(403, 'Forbidden', options)

export const notFound = (options?: AppErrorOptions) => appError(404, 'Not Found', options)

export const conflict = (options?: AppErrorOptions) => appError(409, 'Conflict', options)

export const unprocessable = (options?: AppErrorOptions) =>
  appError(422, 'Unprocessable Entity', options)

export const tooManyRequests = (options?: AppErrorOptions) =>
  appError(429, 'Too Many Requests', options)

export const internalError = (options?: AppErrorOptions) =>
  appError(500, 'Internal Server Error', options)
