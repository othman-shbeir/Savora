import type { FastifyBaseLogger } from 'fastify';

export type Mail = { to: string; subject: string; text: string };
export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Development mailer: prints the message to the API console instead of sending it.
 *  A real provider (Resend, Postmark, SES…) plugs in behind the same interface before launch. */
export function consoleMailer(log: FastifyBaseLogger): Mailer {
  return {
    async send(mail) {
      log.info({ to: mail.to, subject: mail.subject }, `\n--- email ---\n${mail.text}\n-------------`);
    },
  };
}
