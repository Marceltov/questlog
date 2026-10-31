// Sends the sign-in codes, with a link when there may be one, through QUESTLOG_SMTP_URL. Logs neither the address nor the code.
import { config } from "../config";
import { logger } from "../log";
import { mailCopy } from "./copy";

const log = logger("mail");

export type Mailer = (to: string, code: string, link?: string) => Promise<void>;

let override: Mailer | undefined;

/** Test only: where codes go instead of SMTP; undefined puts SMTP back. */
export const setMailerForTests = (m: Mailer | undefined): void => {
  override = m;
};

export async function sendCode(to: string, code: string, link?: string): Promise<void> {
  if (override) return override(to, code, link);
  const smtp = config.smtp();
  if (!smtp) throw new Error("email codes need QUESTLOG_SMTP_URL");
  const { createTransport } = await import("nodemailer");
  try {
    await createTransport(smtp.url).sendMail({ from: smtp.from, to, subject: mailCopy.codeSubject(code), text: mailCopy.codeText(code, link) });
  } catch (e) {
    // The error may name the address: only its code is logged.
    log.error({ code: (e as NodeJS.ErrnoException).code ?? "unknown" }, "sending a sign-in code failed");
    throw e;
  }
}
