// Server-only environment, validated once. Never import from client components
// (none of these are NEXT_PUBLIC_, so Next would never inline them anyway).
import { z } from "zod";
import { assertSendableSender, EmailEnvFields } from "./email/config";

const EnvSchema = z.object({
  NODE_ENV: EmailEnvFields.NODE_ENV,
  DATABASE_URL: z.string().min(1),
  APP_URL: z.url().default("http://localhost:3000"),
  AUTH_JWT_SECRET: z.string().min(32, "AUTH_JWT_SECRET must be at least 32 characters"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.url().optional(),
  RESEND_API_KEY: EmailEnvFields.RESEND_API_KEY,
  EMAIL_FROM: EmailEnvFields.EMAIL_FROM,
  EMAIL_WORKER: EmailEnvFields.EMAIL_WORKER,
  TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  AUTH_FAILURE_DELAY_MS: z.coerce.number().int().min(0).default(250),
  // File storage (attachments). Optional so auth-only setups still boot;
  // storageEnv() fails loudly the moment attachment code needs them.
  S3_ENDPOINT: z.url().optional(),
  S3_PUBLIC_ENDPOINT: z.union([z.url(), z.literal("")]).optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/** Validates an environment. Production refuses an unsendable EMAIL_FROM; development only warns (instrumentation.ts). */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server environment — ${fields}`);
  }
  assertSendableSender(parsed.data);
  return parsed.data;
}

export function env(): Env {
  if (cached) return cached;
  cached = parseEnv(process.env);
  return cached;
}

export const isProduction = () => env().NODE_ENV === "production";

export type StorageEnv = {
  endpoint: string;
  publicEndpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

/** S3 settings for attachments; throws a clear config error when missing. */
export function storageEnv(): StorageEnv {
  const e = env();
  const missing = (["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const).filter((k) => !e[k]);
  if (missing.length) throw new Error(`File storage is not configured — set ${missing.join(", ")}`);
  return {
    endpoint: e.S3_ENDPOINT!,
    publicEndpoint: e.S3_PUBLIC_ENDPOINT || e.S3_ENDPOINT!,
    region: e.S3_REGION,
    bucket: e.S3_BUCKET!,
    accessKeyId: e.S3_ACCESS_KEY_ID!,
    secretAccessKey: e.S3_SECRET_ACCESS_KEY!,
    forcePathStyle: e.S3_FORCE_PATH_STYLE,
  };
}
