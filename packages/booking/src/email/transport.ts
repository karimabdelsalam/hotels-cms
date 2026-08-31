import nodemailer, { type Transporter } from "nodemailer";

/**
 * SMTP, because the server already has it.
 *
 * They run cPanel/WHM, which means mail accounts and an SMTP server are
 * already provisioned and already have the domain's SPF and DKIM. Signing up
 * to a third-party sending API would add a vendor, a bill and another
 * credential for something the box does today.
 *
 * If deliverability turns out to need a dedicated sender later, this file is
 * the only one that changes.
 */

let cached: Transporter | null = null;

export class EmailNotConfigured extends Error {
  constructor() {
    super("SMTP is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASSWORD.");
    this.name = "EmailNotConfigured";
  }
}

export function isConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

export function transport(): Transporter {
  if (!isConfigured()) throw new EmailNotConfigured();
  if (cached) return cached;

  const port = Number(process.env.SMTP_PORT ?? 587);
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 is implicit TLS; 587 starts plain and upgrades with STARTTLS.
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    // A hung SMTP connection must not hold a worker pass open.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return cached;
}

export type Message = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export async function send(message: Message): Promise<void> {
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER;
  await transport().sendMail({
    from,
    to: message.to,
    subject: message.subject,
    // Both parts, always. A text-only client showing raw HTML is a bad
    // confirmation, and an HTML-only message scores worse with spam filters.
    text: message.text,
    html: message.html,
    replyTo: process.env.SMTP_REPLY_TO ?? from,
  });
}
