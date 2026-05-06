import nodemailer from "nodemailer";
import { google, type gmail_v1 } from "googleapis";
import { createHash } from "crypto";
import { asBoolean, asNumber, env } from "./env";
import {
  resolveGoogleServiceAccountCredentials,
  toReadableGoogleAuthError
} from "./google-service-account";
import { logger } from "./logger";

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  cc?: string[];
  bcc?: string[];
};

const EMAIL_SENDER_NAME = "Herramienta de coordinacion Zoom - FLACSO Uruguay";
const EMAIL_SUBJECT_PREFIX = "FLACSO Zoom";
const DEDUP_WINDOW_MS = 10 * 60 * 1000;

export class EmailClient {
  private transporter: nodemailer.Transporter | null = null;
  private gmailClient: gmail_v1.Gmail | null = null;
  private usingDevEthereal = false;
  private static recentSendByFingerprint = new Map<string, number>();

  private normalizeSubject(subject: string): string {
    const trimmed = subject.trim();
    if (!trimmed) return EMAIL_SUBJECT_PREFIX;
    if (trimmed.toLowerCase().startsWith(EMAIL_SUBJECT_PREFIX.toLowerCase())) {
      return trimmed;
    }
    return `${EMAIL_SUBJECT_PREFIX} | ${trimmed}`;
  }

  private buildFingerprint(params: SendEmailParams): string {
    const normalizedTo = params.to.trim().toLowerCase();
    const normalizedSubject = this.normalizeSubject(params.subject).toLowerCase();
    const normalizedCc = (params.cc ?? []).map((item) => item.trim().toLowerCase()).sort().join(",");
    const normalizedBcc = (params.bcc ?? []).map((item) => item.trim().toLowerCase()).sort().join(",");
    const htmlHash = createHash("sha256").update(params.html).digest("hex");
    const raw = `${normalizedTo}|${normalizedSubject}|${normalizedCc}|${normalizedBcc}|${htmlHash}`;
    return createHash("sha256").update(raw).digest("hex");
  }

  private shouldSkipDuplicate(params: SendEmailParams): boolean {
    const now = Date.now();
    for (const [fingerprint, timestamp] of EmailClient.recentSendByFingerprint.entries()) {
      if (now - timestamp > DEDUP_WINDOW_MS) {
        EmailClient.recentSendByFingerprint.delete(fingerprint);
      }
    }

    const fingerprint = this.buildFingerprint(params);
    const previousTimestamp = EmailClient.recentSendByFingerprint.get(fingerprint);
    if (previousTimestamp && now - previousTimestamp <= DEDUP_WINDOW_MS) {
      return true;
    }

    EmailClient.recentSendByFingerprint.set(fingerprint, now);
    return false;
  }

  private isSmtpConfigured(): boolean {
    return Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS);
  }

  private isGmailServiceAccountConfigured(): boolean {
    return Boolean(env.GOOGLE_PRIVATE_KEY);
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

    const credentials = resolveGoogleServiceAccountCredentials();
    const senderAccount = credentials.subject ?? env.SMTP_FROM ?? "noreply@flacso.edu.uy";

    const auth = new google.auth.JWT({
      email: credentials.email,
      key: credentials.privateKey,
      scopes: ["https://www.googleapis.com/auth/gmail.send"],
      subject: senderAccount
    });

    try {
      await auth.authorize();
    } catch (error) {
      throw new Error(toReadableGoogleAuthError(error));
    }

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
    const normalizedParams: SendEmailParams = {
      ...params,
      subject: this.normalizeSubject(params.subject)
    };

    if (this.shouldSkipDuplicate(normalizedParams)) {
      logger.info("Email omitido por deduplicacion temporal.", {
        to: normalizedParams.to,
        subject: normalizedParams.subject,
        dedupWindowMs: DEDUP_WINDOW_MS
      });
      return;
    }

    if (this.isGmailServiceAccountConfigured()) {
      try {
        const gmailClient = await this.getGmailClient();
        await gmailClient.users.messages.send({
          userId: "me",
          requestBody: {
            raw: this.buildRawMessage(normalizedParams)
          }
        });

        logger.info("Email enviado.", {
          to: normalizedParams.to,
          subject: normalizedParams.subject,
          channel: "gmail_api"
        });
        return;
      } catch (error) {
        const readableError = toReadableGoogleAuthError(error);
        logger.error("Fallo envio por Gmail API.", {
          to: normalizedParams.to,
          subject: normalizedParams.subject,
          error: readableError
        });
        if (!this.isSmtpConfigured()) {
          throw new Error(readableError);
        }
      }
    }

    if (this.isSmtpConfigured()) {
      const transporter = await this.getTransporter();
      const info = await transporter.sendMail({
        from: this.getFromHeader(),
        to: normalizedParams.to,
        subject: normalizedParams.subject,
        html: normalizedParams.html,
        cc: normalizedParams.cc?.length ? normalizedParams.cc.join(",") : undefined,
        bcc: normalizedParams.bcc?.length ? normalizedParams.bcc.join(",") : undefined
      });

      const previewUrl = nodemailer.getTestMessageUrl(info);
      logger.info("Email enviado.", {
        to: normalizedParams.to,
        subject: normalizedParams.subject,
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
      to: normalizedParams.to,
      subject: normalizedParams.subject,
      html: normalizedParams.html,
      cc: normalizedParams.cc?.length ? normalizedParams.cc.join(",") : undefined,
      bcc: normalizedParams.bcc?.length ? normalizedParams.bcc.join(",") : undefined
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    logger.info("Email enviado.", {
      to: normalizedParams.to,
      subject: normalizedParams.subject,
      channel: "ethereal",
      previewUrl: this.usingDevEthereal ? previewUrl : undefined
    });
  }
}
