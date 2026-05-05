import { z } from "zod";

const rawEnv = {
  ...process.env,
  ZOOM_CLIENT_SECRET: process.env.ZOOM_CLIENT_SECRET ?? process.env.Zoom_Client_Secret,
  ZOOM_CLIENT_ID: process.env.ZOOM_CLIENT_ID ?? process.env.Zoom_Client_ID,
  ZOOM_ACCOUNT_ID: process.env.ZOOM_ACCOUNT_ID ?? process.env.Zoom_Account_ID
};

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1).optional(),
  AUTH_TRUST_HOST: z.string().default("true"),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  AUTH_BOOTSTRAP_EMAIL: z.string().email().optional(),
  AUTH_BOOTSTRAP_PASSWORD: z.string().min(8).optional(),
  APP_BASE_URL: z.string().url().optional(),
  TIMEZONE: z.string().default("America/Montevideo"),
  CRON_SECRET: z.string().optional(),
  ZOOM_CLIENT_ID: z.string().optional(),
  ZOOM_CLIENT_SECRET: z.string().optional(),
  ZOOM_ACCOUNT_ID: z.string().optional(),
  ZOOM_GROUP_ID: z.string().optional(),
  ZOOM_WEBHOOK_SECRET_TOKEN: z.string().optional(),
  PASSWORD_WEBHOOK_URL: z.string().url().optional(),
  ZOOM_API_BASE: z.string().default("https://api.zoom.us/v2"),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().optional(),
  GOOGLE_PRIVATE_KEY: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_SUBJECT: z.string().email().optional(),
  DRIVE_DESTINATION_ID: z.string().optional(),
  ZOOM_DRIVE_DEFAULT_ENABLED: z.string().default("false"),
  ZOOM_DRIVE_SYNC_API_BASE_URL: z.string().url().optional(),
  ZOOM_DRIVE_SYNC_API_KEY: z.string().optional(),
  ZOOM_DRIVE_AUTO_DOWNLOAD_FROM_WEBHOOK: z.string().default("false"),
  ZOOM_DRIVE_DELETE_FROM_ZOOM: z.string().default("false"),
  ZOOM_DRIVE_DAYS_BACK: z.string().default("30"),
  ZOOM_DRIVE_ALLOWED_FILE_TYPES: z
    .string()
    .default("MP4,M4A,CHAT,TRANSCRIPT,CC"),
  ZOOM_DRIVE_SKIP_ZERO_BYTE_CHAT: z.string().default("true"),
  ZOOM_DRIVE_MAX_MEETINGS_PER_RUN: z.string().default("0"),
  ZOOM_DRIVE_MAX_FILES_PER_MEETING: z.string().default("0"),
  ZOOM_DRIVE_PARALLEL_WORKERS: z.string().default("4"),
  ZOOM_DRIVE_MEDIA_WORKERS: z.string().default("0"),
  ZOOM_ROOMS_DEFAULT_ENABLED: z.string().default("false"),
  ZOOM_ROOMS_GROUP_NAME: z.string().default("Todo FLACSO"),
  ZOOM_ROOMS_GROUP_ALIASES: z.string().default("Todo FLACSO"),
  ZOOM_ROOMS_EXCLUDED_ACCOUNTS: z.string().default("web@flacso.edu.uy"),
  ZOOM_ROOMS_FIND_EXISTING: z.string().default("true"),
  ZOOM_ROOMS_MAX_PER_RUN: z.string().default("25"),
  ZOOM_ROOMS_TIMEZONE: z.string().default("America/Montevideo"),
  ZOOM_ROOMS_REMINDER_OFFSETS_HOURS: z.string().default("24"),
  ZOOM_ROOMS_REMINDER_LOOKBACK_MINUTES: z.string().default("90"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default("noreply@flacso.edu.uy"),
  SMTP_SECURE: z.string().default("false")
});

const parsed = envSchema.safeParse(rawEnv);

if (!parsed.success) {
  const isBuild = process.env.NEXT_PHASE === "phase-production-build" || process.env.VERCEL === "1";
  if (isBuild) {
    console.warn("⚠️ Advertencia: Variables de entorno faltantes o inválidas durante la fase de compilación.");
    console.warn(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  } else {
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error("Variables de entorno inválidas.");
  }
}

// Durante el build permitimos que falten o sean inválidas, pero en runtime fallará si no están
export const env = parsed.success 
  ? parsed.data 
  : (envSchema.partial().parse(rawEnv) as any);

if (env.NODE_ENV === "production" && !env.AUTH_SECRET && process.env.NEXT_PHASE !== "phase-production-build") {
  throw new Error("AUTH_SECRET es obligatorio en producción.");
}

if (env.NODE_ENV === "production" && !env.DATABASE_URL && process.env.NEXT_PHASE !== "phase-production-build") {
  throw new Error("DATABASE_URL es obligatorio en producción.");
}

export const authSecret =
  env.AUTH_SECRET ||
  (env.NODE_ENV === "production"
    ? undefined
    : "dev-only-auth-secret-change-me-before-prod");

export function asBoolean(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined || value === "") return defaultValue;
  return value.toLowerCase() === "true";
}

export function asNumber(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const n = Number(value);
  return Number.isFinite(n) ? n : defaultValue;
}
