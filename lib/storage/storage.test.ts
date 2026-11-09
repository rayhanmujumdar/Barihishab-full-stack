import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setStorageForTests, storage } from "@/lib/storage";

// The real S3 adapter, with the network call stubbed: checks the mapping from
// SDK responses/errors to the Storage contract the file proxy relies on.
beforeAll(() => {
  vi.stubEnv("S3_ENDPOINT", "http://s3.internal:9000");
  vi.stubEnv("S3_BUCKET", "bills");
  vi.stubEnv("S3_ACCESS_KEY_ID", "key");
  vi.stubEnv("S3_SECRET_ACCESS_KEY", "secret");
  setStorageForTests(undefined);
});
afterEach(() => vi.restoreAllMocks());

const notFound = () => Object.assign(new Error("NoSuchKey"), { name: "NoSuchKey", $metadata: { httpStatusCode: 404 } });

describe("s3 storage", () => {
  it("get streams the object with its size and etag", async () => {
    const send = vi.spyOn(S3Client.prototype, "send").mockImplementation(async (cmd: unknown) => {
      expect(cmd).toBeInstanceOf(GetObjectCommand);
      expect((cmd as GetObjectCommand).input).toMatchObject({ Bucket: "bills", Key: "p/1/att/x" });
      return { ContentLength: 3, ETag: '"abc"', Body: { transformToWebStream: () => new Response(new Uint8Array([1, 2, 3])).body } };
    });
    const got = await storage().get("p/1/att/x");
    expect(send).toHaveBeenCalledOnce();
    expect(got).toMatchObject({ size: 3, etag: '"abc"' });
    expect(new Uint8Array(await new Response(got!.body).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("get returns null for a missing object and rethrows other failures", async () => {
    vi.spyOn(S3Client.prototype, "send").mockRejectedValueOnce(notFound());
    expect(await storage().get("gone")).toBeNull();
    vi.spyOn(S3Client.prototype, "send").mockRejectedValueOnce(Object.assign(new Error("boom"), { $metadata: { httpStatusCode: 500 } }));
    await expect(storage().get("x")).rejects.toThrow("boom");
  });

  it("head reports size and etag, or null", async () => {
    vi.spyOn(S3Client.prototype, "send").mockImplementation(async (cmd: unknown) => {
      expect(cmd).toBeInstanceOf(HeadObjectCommand);
      return { ContentLength: 64, ETag: '"e1"' };
    });
    expect(await storage().head("k")).toEqual({ size: 64, etag: '"e1"' });
    vi.restoreAllMocks();
    vi.spyOn(S3Client.prototype, "send").mockRejectedValueOnce(Object.assign(new Error("NotFound"), { name: "NotFound", $metadata: { httpStatusCode: 404 } }));
    expect(await storage().head("k")).toBeNull();
  });
});
