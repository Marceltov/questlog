// What the backend throws on purpose; the MCP and HTTP layers map `code` to a tool error or a status.
export class GamepanionError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

// Also what a read of another player's row gets: it doesn't exist for this player (values V2).
export class NotFoundError extends GamepanionError {
  constructor(message = "Not found") {
    super("not_found", message);
  }
}

export class InvalidInputError extends GamepanionError {
  constructor(message: string) {
    super("invalid_input", message);
  }
}

export class AmbiguousError extends GamepanionError {
  constructor(message: string) {
    super("ambiguous", message);
  }
}

// No valid access token for the surface asked (a missing, expired or foreign one, or one for /mcp on /api/v1).
export class AuthError extends GamepanionError {
  constructor(message = "A valid access token for this API is required") {
    super("unauthorized", message);
  }
}
