import { authRoute } from "@/backend";

// RFC 9728 metadata of /mcp (/.well-known/oauth-protected-resource/mcp), served by @better-auth/mcp.
export const GET = authRoute;
