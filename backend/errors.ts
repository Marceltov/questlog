// What the backend throws on purpose; the MCP and HTTP layers map `code` to a tool error or a status.
export class QuestlogError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

// Also what a read of another player's row gets: it doesn't exist for this player (values V2).
export class NotFoundError extends QuestlogError {
  constructor(message = "Not found") {
    super("not_found", message);
  }
}

export class InvalidInputError extends QuestlogError {
  constructor(message: string) {
    super("invalid_input", message);
  }
}

export class AmbiguousError extends QuestlogError {
  constructor(message: string) {
    super("ambiguous", message);
  }
}
