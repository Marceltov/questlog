import { authServerMetadataRoute } from "@/backend";

// RFC 8414 metadata for the issuer ${PUBLIC_URL}/api/auth, at /.well-known/oauth-authorization-server/api/auth.
export const GET = authServerMetadataRoute;
