"use client";
// Better Auth's browser client. It holds no token: the session is an HttpOnly cookie. oauthProviderClient carries a login page's signed
// query along with a sign-in, so an MCP client's authorize step continues after it; a passkey sign-in included.
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { passkeyClient } from "@better-auth/passkey/client";
import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({ basePath: "/api/auth", plugins: [emailOTPClient(), passkeyClient(), oauthProviderClient()] });
