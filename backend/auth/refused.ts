// A refused provider sign-in says why (#17): Better Auth sends the provider's OAuth error back to the login page as `?error=`, with the
// `provider` the form put in errorCallbackURL. The page shows the code and logs one line. Only a known provider and an OAuth-shaped code
// get through: the query is anyone's to write, so `error_description` is never shown or logged.
import { logger } from "../log";
import { signInMethods } from "./methods";

const log = logger("auth");
const CODE = /^[a-z][a-z0-9_.-]{0,63}$/i;

export type RefusedSignIn = { provider: string | null; code: string };

/** The refusal in a login page's query, logged once; null when there is none. */
export function refusedSignIn(
  query: { error?: string | string[]; provider?: string | string[] },
  providers: { id: string; label: string }[] = signInMethods().providers,
): RefusedSignIn | null {
  const code = typeof query.error === "string" ? query.error : undefined;
  if (!code) return null;
  const known = typeof query.provider === "string" ? providers.find((p) => p.id === query.provider) : undefined;
  const safe = CODE.test(code) ? code : "unknown_error";
  log.warn({ provider: known?.id ?? null, error: safe }, "a sign-in was refused");
  return { provider: known?.label ?? null, code: safe };
}
