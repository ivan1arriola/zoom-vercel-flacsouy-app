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
  private usingDevEthereal = false;

  isConfigured(): boolean {
    return Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS);
  }

  private async getTransporter(): Promise<nodemailer.Transporter> {
    if (this.transporter) return this.transporter;

    if (this.isConfigured()) {
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

    if (env.NODE_ENV === "production") {
      throw new Error("SMTP no configurado.");
    }

    const testAccount = await nodemailer.createTestAccount();
    this.usingDevEthereal = true;
    this.transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });

    logger.info("SMTP de desarrollo (Ethereal) habilitado para pruebas.", {
      user: testAccount.user
    });

    return this.transporter;
  }

  async send(params: SendEmailParams): Promise<void> {
    const transporter = await this.getTransporter();
    const info = await transporter.sendMail({
      from: env.SMTP_FROM || "noreply@flacso.edu.uy",
      to: params.to,
      subject: params.subject,
      html: params.html,
      cc: params.cc?.length ? params.cc.join(",") : undefined,
      bcc: params.bcc?.length ? params.bcc.join(",") : undefined
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    logger.info("Email enviado.", {
      to: params.to,
      subject: params.subject,
      previewUrl: this.usingDevEthereal ? previewUrl : undefined
    });
  }
}
