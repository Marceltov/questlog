import { apiResourceMetadataRoute, authRoute } from "@/backend";

// RFC 9728 metadata: of /api/v1 (/.well-known/oauth-protected-resource/api/v1) from questlog, of /mcp from @better-auth/mcp.
export async function GET(req: Request, { params }: RouteContext<"/.well-known/oauth-protected-resource/[...path]">) {
  return (await params).path.join("/") === "api/v1" ? apiResourceMetadataRoute() : authRoute(req);
}
