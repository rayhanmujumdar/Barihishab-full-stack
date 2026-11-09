// Creates the private attachments bucket (and its CORS rule for browser
// uploads) on the S3-compatible store. Idempotent. Run with `pnpm storage:init`.
import "dotenv/config";
import { CreateBucketCommand, HeadBucketCommand, PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";

export async function initStorage(env: Record<string, string | undefined> = process.env) {
  const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = env;
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
    throw new Error("Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY");
  }
  const client = new S3Client({
    endpoint: S3_ENDPOINT,
    region: env.S3_REGION || "auto",
    forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
  });
  try {
    await client.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: S3_BUCKET }));
  }
  const origins = (env.S3_CORS_ORIGINS || env.APP_URL || "http://localhost:3000").split(",").map((o) => o.trim());
  try {
    await client.send(
      new PutBucketCorsCommand({
        Bucket: S3_BUCKET,
        CORSConfiguration: {
          CORSRules: [{ AllowedOrigins: origins, AllowedMethods: ["PUT", "GET"], AllowedHeaders: ["*"], MaxAgeSeconds: 3600 }],
        },
      }),
    );
  } catch (err) {
    // Some local S3 servers allow every origin and don't implement bucket CORS.
    console.warn(`storage:init — bucket CORS not set (${(err as Error).name}); continuing`);
  }
  return S3_BUCKET;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  initStorage()
    .then((bucket) => console.log(`storage:init — bucket "${bucket}" ready`))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
