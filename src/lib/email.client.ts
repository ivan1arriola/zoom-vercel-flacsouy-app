import nodemailer from "nodemailer";
import { asBoolean, asNumber, env } from "./env";
import { logger } from "./logger";

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  cc?: string[];
  bcc?: string[];
};

export class EmailClient {
  private transporter: nodemailer.Transporter | null = null;

  isConfigured(): boolean {
    return Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS);
  }

  private getTransporter(): nodemailer.Transporter {
    if (this.transporter) return this.transporter;
    if (!this.isConfigured()) {
      throw new Error("SMTP no configurado.");
    }

    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: asNumber(env.SMTP_PORT, 587),
      secure: asBoolean(env.SMTP_SECURE, false),
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS
      }
    });
    return this.transporter;
  }

  async send(params: SendEmailParams): Promise<void> {
    if (!this.isConfigured()) {
      logger.warn("SMTP no configurado: email omitido.");
      return;
    }

    const transporter = this.getTransporter();
    await transporter.sendMail({
      from: env.SMTP_FROM || "noreply@flacso.edu.uy",
      to: params.to,
      subject: params.subject,
      html: params.html,
      cc: params.cc?.length ? params.cc.join(",") : undefined,
      bcc: params.bcc?.length ? params.bcc.join(",") : undefined
    });
  }
}
