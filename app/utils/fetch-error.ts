// The message to show for a failed $fetch. Errors built by server/utils/errors.ts carry a
// user-safe `message` in the JSON body, which ofetch exposes as `error.data`. Anything
// else, such as a network failure, gets the fallback.
export function fetchErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== 'object' || error === null || !('data' in error)) return fallback
  const { data } = error
  if (typeof data === 'object' && data !== null && 'message' in data) {
    if (typeof data.message === 'string' && data.message !== '') return data.message
  }
  return fallback
}
