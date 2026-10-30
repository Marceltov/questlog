// RFC 9728 metadata of /api/v1, at /.well-known/oauth-protected-resource/api/v1: where a script finds the authorization server that issues
// tokens for this API. @better-auth/mcp serves /mcp's; this one is ours, with the same issuer.
import { metadataResponse } from "@better-auth/oauth-provider";
import { apiResource, issuer } from "../urls";

export const apiResourceMetadataRoute = (): Response =>
  metadataResponse({
    resource: apiResource(),
    authorization_servers: [issuer()],
    bearer_methods_supported: ["header"],
    resource_name: "questlog API",
  });
