import type { FastifyBaseLogger } from 'fastify';
import nodemailer, { type Transporter } from 'nodemailer';

export type Mail = { to: string; subject: string; text: string };
export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Development mailer: prints the message to the API console instead of sending it. */
export function consoleMailer(log: FastifyBaseLogger): Mailer {
  return {
    async send(mail) {
      log.info({ to: mail.to, subject: mail.subject }, `\n--- email ---\n${mail.text}\n-------------`);
    },
  };
}

/** Sends through any SMTP service (Resend, Postmark, Amazon SES, Mailgun, a mailbox provider…).
 *  SMTP_URL looks like smtps://user:password@smtp.example.com:465. A failed send is logged and
 *  thrown, so the sign-in screen can say the email didn't go. */
export function smtpMailer(url: string, from: string, log: FastifyBaseLogger, transport: Transporter = nodemailer.createTransport(url)): Mailer {
  return {
    async send(mail) {
      try {
        await transport.sendMail({ from, to: mail.to, subject: mail.subject, text: mail.text });
      } catch (e) {
        log.error({ err: e, to: mail.to }, 'email not sent');
        throw e;
      }
    },
  };
}
