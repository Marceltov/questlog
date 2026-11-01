// What the sign-in mails say. English; the UI's strings are in components/copy.ts.
export const mailCopy = {
  codeSubject: (code: string) => `${code} is your Gamepanion code`,
  // The link only outside an MCP or script sign-in: one started there can't be finished by clicking a mail (ADR 0004).
  codeText: (code: string, link?: string) =>
    `Your Gamepanion sign-in code is ${code}\n\nType it into the page where you asked for it. It works once and for five minutes.\n` +
    (link ? `Or open this link to sign in on the device you read this on; it also works once and for five minutes:\n${link}\n` : "") +
    `If you didn't ask for it, ignore this mail: nobody gets in without the code${link ? " or the link" : ""}.`,
};
