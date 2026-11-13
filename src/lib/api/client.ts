/**
 * Client-side API contract.
 *
 * Every page used to call `fetch()` directly, ignore `res.ok`, and swallow
 * failures in `.catch(() => {})`, so a 400/401/500 left the UI showing stale or
 * empty data with a success banner. `apiFetch` is the single place that turns a
 * non-2xx response into a thrown `ApiError` carrying the server's message, and
 * `ApiError.status === 401` is what routes the operator to /login.
 */

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface ApiErrorBody {
  error?: unknown;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "error" in body) {
      const message = (body as ApiErrorBody).error;
      if (typeof message === "string" && message) return message;
    }
  } catch {
    /* non-JSON error body (proxy 401 page, HTML error) */
  }
  return response.status === 401
    ? "Unlock required — this instance is PIN protected."
    : `Request failed (${response.status})`;
}

/**
 * Fetches JSON and throws `ApiError` on any non-2xx status or transport failure.
 * A 401 also redirects to /login (preserving the requested route) because the
 * gate only guards /api/*, so pages render a shell instead of being redirected
 * by the server.
 */
export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    // API reads are user data, never cacheable: a cached 200 would let a page
    // render a pre-write snapshot after the write already committed.
    response = await fetch(input, { cache: 'no-store', ...init });
  } catch (err) {
    throw new ApiError(err instanceof Error ? err.message : "Network request failed", 0);
  }

  if (!response.ok) {
    const message = await readErrorMessage(response);
    if (response.status === 401 && typeof window !== "undefined" && window.location.pathname !== "/login") {
      // Hard navigation (this module has no React context): `replace` rather than
      // `href` so the rejected request does not linger in the history stack.
      window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    }
    throw new ApiError(message, response.status);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError("Server returned a malformed response", response.status);
  }
}

/** JSON POST/PUT/PATCH/DELETE helper. */
export function apiSend<T>(input: string, method: "POST" | "PUT" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
  return apiFetch<T>(input, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/**
 * Normalizes an unknown thrown value into a message safe to render. Pages keep
 * a `string | null` error field, so this is the boundary that prevents
 * "[object Object]" from reaching the operator.
 */
export function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}
