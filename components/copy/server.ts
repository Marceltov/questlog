// The language and strings of the page being rendered, for server components; once per request.
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { copyFor, LOCALE_COOKIE, pickLocale, type Copy, type Locale } from ".";

export const serverLocale = cache(async (): Promise<Locale> =>
  pickLocale((await cookies()).get(LOCALE_COOKIE)?.value, (await headers()).get("accept-language")),
);

export const serverCopy = async (): Promise<Copy> => copyFor(await serverLocale());
