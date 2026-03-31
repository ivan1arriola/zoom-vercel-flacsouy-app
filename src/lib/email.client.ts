import nodemailer from "nodemailer";
import { google, type gmail_v1 } from "googleapis";
import { asBoolean, asNumber, env } from "./env";
import { logger } from "./logger";

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  cc?: string[];
  bcc?: string[];
};

const EMAIL_SENDER_NAME = "Herramienta de coordinacion Zoom - FLACSO Uruguay";

export class EmailClient {
  private transporter: nodemailer.Transporter | null = null;
  private gmailClient: gmail_v1.Gmail | null = null;
  private usingDevEthereal = false;

  private isSmtpConfigured(): boolean {
    return Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS);
  }

  private isGmailServiceAccountConfigured(): boolean {
    return Boolean(env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY);
  }

  private async getTransporter(): Promise<nodemailer.Transporter> {
    if (this.transporter) return this.transporter;

    if (this.isSmtpConfigured()) {
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

  private async getGmailClient(): Promise<gmail_v1.Gmail> {
    if (this.gmailClient) return this.gmailClient;

    if (!this.isGmailServiceAccountConfigured()) {
      throw new Error("Gmail API no configurado.");
    }

    const privateKey = (env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
    const senderAccount = env.GOOGLE_SERVICE_ACCOUNT_SUBJECT ?? env.SMTP_FROM ?? "noreply@flacso.edu.uy";

    const auth = new google.auth.JWT({
      email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/gmail.send"],
      subject: senderAccount
    });

    await auth.authorize();

    this.gmailClient = google.gmail({
      version: "v1",
      auth
    });

    return this.gmailClient;
  }

  private buildRawMessage(params: SendEmailParams): string {
    const from = this.getFromHeader();
    const headers = [
      `From: ${from}`,
      `To: ${params.to}`,
      `Subject: ${this.encodeMimeHeader(params.subject)}`,
      "MIME-Version: 1.0",
      'Content-Type: text/html; charset="UTF-8"'
    ];

    if (params.cc?.length) {
      headers.push(`Cc: ${params.cc.join(",")}`);
    }

    if (params.bcc?.length) {
      headers.push(`Bcc: ${params.bcc.join(",")}`);
    }

    const raw = `${headers.join("\r\n")}\r\n\r\n${params.html}`;
    return Buffer.from(raw, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  private encodeMimeHeader(value: string): string {
    return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
  }

  private getFromAddress(): string {
    return env.SMTP_FROM || "noreply@flacso.edu.uy";
  }

  private getFromHeader(): string {
    return `"${EMAIL_SENDER_NAME}" <${this.getFromAddress()}>`;
  }

  async send(params: SendEmailParams): Promise<void> {
    if (this.isGmailServiceAccountConfigured()) {
      const gmailClient = await this.getGmailClient();
      await gmailClient.users.messages.send({
        userId: "me",
        requestBody: {
          raw: this.buildRawMessage(params)
        }
      });

      logger.info("Email enviado.", {
        to: params.to,
        subject: params.subject,
        channel: "gmail_api"
      });
      return;
    }

    if (this.isSmtpConfigured()) {
      const transporter = await this.getTransporter();
      const info = await transporter.sendMail({
        from: this.getFromHeader(),
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
        channel: this.usingDevEthereal ? "ethereal" : "smtp",
        previewUrl: this.usingDevEthereal ? previewUrl : undefined
      });
      return;
    }

    if (env.NODE_ENV === "production") {
      throw new Error("No hay proveedor de correo configurado (SMTP o Gmail API).");
    }

    const transporter = await this.getTransporter();
    const info = await transporter.sendMail({
      from: this.getFromHeader(),
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
      channel: "ethereal",
      previewUrl: this.usingDevEthereal ? previewUrl : undefined
    });
  }
}
