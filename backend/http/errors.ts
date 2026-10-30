// The HTTP status for each refusal, and the JSON error body every /api/v1 endpoint answers with.
import { AmbiguousError, AuthError, InvalidInputError, NotFoundError, QuestlogError } from "../errors";
import { logger } from "../log";

const log = logger("http");

export const ERROR_CODES = ["invalid_request", "invalid_input", "unauthorized", "not_found", "ambiguous", "internal"] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

// A request that can't be read at all: not JSON, too large, a query that doesn't parse.
export class InvalidRequestError extends QuestlogError {
  constructor(message: string) {
    super("invalid_request", message);
  }
}

const STATUS: [new (...args: never[]) => QuestlogError, number][] = [
  [InvalidRequestError, 400],
  [InvalidInputError, 400],
  [AuthError, 401],
  [NotFoundError, 404],
  [AmbiguousError, 409],
];

export type ErrorReply = { status: number; body: { error: string; code: ErrorCode } };

// Anything that isn't a QuestlogError is a bug or a disk failure: logged, and a bare 500 that says nothing of it.
export function errorReply(e: unknown): ErrorReply {
  if (!(e instanceof QuestlogError)) {
    log.error({ err: e }, "request failed");
    return { status: 500, body: { error: "internal error", code: "internal" } };
  }
  return { status: STATUS.find(([cls]) => e instanceof cls)?.[1] ?? 500, body: { error: e.message, code: e.code as ErrorCode } };
}
