import { config } from "../config";

export type SignInMethods = { emailCode: boolean; providers: { id: string; label: string }[] };

/** Email codes when SMTP is set up, and every OpenID Connect provider configured. */
export function signInMethods(): SignInMethods {
  return { emailCode: !!config.smtp(), providers: config.oidcProviders().map((p) => ({ id: p.id, label: p.label })) };
}
