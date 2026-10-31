// A refused provider sign-in says why (#17).
import { expect, test } from "vitest";
import { logsOf } from "../log";
import { refusedSignIn } from "./refused";

const providers = [{ id: "authentik", label: "authentik" }];

test("a provider's refusal shows its code with the provider's name, in one log line", async () => {
  let shown: ReturnType<typeof refusedSignIn> = null;
  const lines = await logsOf(() => (shown = refusedSignIn({ error: "invalid_request", provider: "authentik" }, providers)));
  expect(shown).toEqual({ provider: "authentik", code: "invalid_request" });
  expect(lines).toEqual([expect.objectContaining({ level: "warn", component: "auth", provider: "authentik", error: "invalid_request" })]);
});

test("no error is no refusal; an unknown provider or a code that isn't one isn't echoed", async () => {
  expect(refusedSignIn({}, providers)).toBeNull();
  expect(await logsOf(() => refusedSignIn({}, providers))).toEqual([]);
  expect(refusedSignIn({ error: "<b>Call 0800</b>", provider: "evil" }, providers)).toEqual({ provider: null, code: "unknown_error" });
});
