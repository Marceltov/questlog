// What the sign-in mails say. English; the UI's strings are in components/copy.ts.
export const mailCopy = {
  codeSubject: (code: string) => `${code} is your questlog code`,
  // Only a code, never a link: a sign-in someone else started with your address can't be finished by clicking a mail (ADR 0004).
  codeText: (code: string) =>
    `Your questlog sign-in code is ${code}\n\nType it into the page where you asked for it. It works once and for five minutes.\nIf you didn't ask for it, ignore this mail: nobody gets in without the code.`,
};
