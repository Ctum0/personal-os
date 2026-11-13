import { NextResponse } from "next/server";
import { FieldError } from "./fields";

export { FieldError };

/**
 * Uniform HTTP contract for every API route.
 *
 * Routes validate with the typed field readers (`@/lib/api/fields`), which throw
 * `FieldError` on bad input, and end with `routeError(err)`. That keeps one
 * place responsible for status-code mapping: validation → 400, missing row →
 * 404, constraint conflicts → 409, anything else → 500 with the real message.
 * A route that hand-rolls its own `catch (error: any)` block loses that mapping.
 */
export function notFound(resource: string): never {
  throw new FieldError(`${resource} not found`, 404);
}

export function conflict(message: string): never {
  throw new FieldError(message, 409);
}

/** Success response. Status defaults to 200; creates use 201 explicitly. */
export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/** Maps any thrown value to the correct HTTP status for the caller. */
export function routeError(err: unknown): NextResponse {
  if (err instanceof FieldError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const message = errorText(err);
  if (/FOREIGN KEY constraint failed/i.test(message)) {
    return NextResponse.json({ error: "Referenced record does not exist" }, { status: 400 });
  }
  if (/UNIQUE constraint failed/i.test(message)) {
    return NextResponse.json({ error: "A record with these values already exists" }, { status: 409 });
  }
  return NextResponse.json({ error: message }, { status: 500 });
}

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Internal error";
}

/**
 * Parses the request body and returns it as a plain object. Malformed JSON and
 * non-object bodies are client errors (400), never 500s.
 */
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw new FieldError("Request body must be valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new FieldError("Request body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}
