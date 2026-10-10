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

/** The fields of a PostgREST error this file reads. */
export interface DatabaseError {
  code: string
  message: string
  details?: string | null
  hint?: string | null
}

/**
 * Turns an error returned by a serverSupabaseClient query into an HTTP error.
 *
 * Postgres messages name tables, constraints and sometimes values, so they go into
 * `cause` for the server log and never into the response. Zod at the route boundary
 * mirrors the check constraints, so the database codes here are the last line, not the
 * usual path.
 */
export function mapDatabaseError(error: DatabaseError): H3Error {
  switch (error.code) {
    // A row that RLS hides is invisible, not forbidden, so `.single()` finds no row.
    case 'PGRST116':
      return notFound({ cause: error })
    // An insert or update whose new row fails a policy's `with check`.
    case '42501':
      return forbidden({ cause: error })
    case '23505':
      return conflict({ message: 'That already exists', cause: error })
    case '22003':
    case '23502':
    case '23503':
    case '23514':
      return unprocessable({ cause: error })
    // Malformed input such as a bad uuid or number, which Zod should already have caught.
    case '22P02':
      return badRequest({ cause: error })
    default:
      return internalError({ cause: error })
  }
}
