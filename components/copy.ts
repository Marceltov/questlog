// Every string the web app shows. English first (values V8); a second language would be a second object of the same shape.
export const copy = {
  appName: "questlog",
  tagline: "A spoiler-free quest log for the games you play.",

  // Sign-in
  signInTitle: "Sign in to questlog",
  signInLead: "Your quest log, build and items, as you told them to Claude.",
  emailLabel: "Email",
  sendCode: "Send me a code",
  codeSent: (email: string) => `A code is on its way to ${email}. It works once, for five minutes.`,
  codeLabel: "Code",
  signIn: "Sign in",
  otherAddress: "Use another address",
  withProvider: (label: string) => `Continue with ${label}`,
  or: "or",
  noMethods: "This instance has no way to sign in yet: set QUESTLOG_SMTP_URL or an OpenID Connect provider (see the configuration docs).",
  signInFailed: "That didn't work. Check the code, or ask for a new one.",
  sendFailed: "No code could be sent. Try again in a minute.",
  signOut: "Sign out",

  // Consent
  consentTitle: "Connect questlog",
  consentLead: (client: string) => `${client} wants to read and write your quest log: your games, sessions, quests, builds and items.`,
  consentWho: (name: string) => `Signed in as ${name}.`,
  allow: "Allow",
  deny: "Deny",
  unknownClient: "An app",
  consentFailed: "That didn't work. Start the connection again from the app.",

  // Home
  homeTitle: "Your games",
  nothingYet: "Nothing recorded yet.",
  connectHint: (url: string) => `Add ${url} to Claude as a custom connector, then tell Claude what you are playing.`,
  lastPlayed: (day: string) => `Last played ${day}`,
  notPlayedYet: "Not played yet",
  status: { playing: "Playing", finished: "Finished", dropped: "Dropped" } as Record<string, string>,

  // A playthrough
  lastSession: "Last session",
  openQuests: "Open quests",
  noOpenQuests: "No open quests.",
  waitingOnGame: "Waits on the game",
  nextStep: "Next",
  build: "Build",
  noBuild: "No stats recorded yet.",
  level: (n: number) => `Level ${n}`,
  mainStat: (stat: string) => `Built around ${stat}`,
  target: (n: number) => `target ${n}`,
  items: "Items",
  noItems: "No items recorded yet.",
  equipped: "Equipped",
  closedQuests: "Closed quests",
  sessions: "Sessions",
  questStatus: { open: "Open", blocked: "Blocked", done: "Done", failed: "Failed", dropped: "Dropped" } as Record<string, string>,
  entryKind: { log: "", next: "Next: ", decision: "Chose: " } as Record<string, string>,
  showHints: "Show hints",
  hideHints: "Hide hints",
  hintWarning: "Hints name places, people and items you may not have reached yet. Full spoilers stay hidden.",
  spoilerTag: { none: "", hint: "Hint", full: "Spoiler" } as Record<string, string>,

  // A session
  transcript: "What you said",
  back: "Back",
  notFound: "Not here. It may belong to someone else, or it was deleted.",
};
