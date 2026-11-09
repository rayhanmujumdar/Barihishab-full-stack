// Private S3-compatible bucket for bills & receipts (design D7). Browsers
// upload/download directly with short-lived presigned URLs; the server only
// signs, HEADs and sniffs the first bytes. Tests swap in a fake.
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { storageEnv } from "@/lib/env";

export const URL_TTL_SECONDS = 300;

export type ObjectInfo = { size: number };

export interface Storage {
  /** Presigned PUT bound to content type + length. */
  presignPut(key: string, mime: string, size: number): Promise<string>;
  /** Presigned GET, served inline with the original file name. */
  presignGet(key: string, fileName: string, mime: string): Promise<string>;
  /** Object size, or null when it doesn't exist. */
  head(key: string): Promise<ObjectInfo | null>;
  /** First `bytes` bytes of the object. */
  readHead(key: string, bytes: number): Promise<Uint8Array>;
  /** Removes the object; a missing object is not an error. */
  delete(key: string): Promise<void>;
}

function contentDisposition(fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function s3Storage(): Storage {
  const cfg = storageEnv();
  const make = (endpoint: string) =>
    new S3Client({
      endpoint,
      region: cfg.region,
      forcePathStyle: cfg.forcePathStyle,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      // Presigned PUTs must not require a checksum header the browser won't send.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  const server = make(cfg.endpoint);
  const browser = cfg.publicEndpoint === cfg.endpoint ? server : make(cfg.publicEndpoint);
  const Bucket = cfg.bucket;

  return {
    presignPut: (Key, ContentType, ContentLength) =>
      getSignedUrl(browser, new PutObjectCommand({ Bucket, Key, ContentType, ContentLength }), {
        expiresIn: URL_TTL_SECONDS,
        signableHeaders: new Set(["content-type", "content-length"]),
      }),
    presignGet: (Key, fileName, mime) =>
      getSignedUrl(
        browser,
        new GetObjectCommand({ Bucket, Key, ResponseContentType: mime, ResponseContentDisposition: contentDisposition(fileName) }),
        { expiresIn: URL_TTL_SECONDS },
      ),
    async head(Key) {
      try {
        const res = await server.send(new HeadObjectCommand({ Bucket, Key }));
        return { size: Number(res.ContentLength ?? 0) };
      } catch (err) {
        const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (status === 404 || (err as Error).name === "NotFound") return null;
        throw err;
      }
    },
    async readHead(Key, bytes) {
      const res = await server.send(new GetObjectCommand({ Bucket, Key, Range: `bytes=0-${bytes - 1}` }));
      return res.Body ? await res.Body.transformToByteArray() : new Uint8Array();
    },
    async delete(Key) {
      await server.send(new DeleteObjectCommand({ Bucket, Key }));
    },
  };
}

let current: Storage | undefined;

export function storage(): Storage {
  current ??= s3Storage();
  return current;
}

/** Integration tests only: replace the S3 client with an in-memory fake. */
export function setStorageForTests(fake: Storage | undefined) {
  current = fake;
}
