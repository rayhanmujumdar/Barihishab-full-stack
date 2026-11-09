// In-memory stand-in for the S3 bucket (integration tests never hit the network).
import { createHash } from "node:crypto";
import { setStorageForTests, type Storage } from "@/lib/storage";

const etagOf = (bytes: Uint8Array) => `"${createHash("sha1").update(bytes).digest("hex")}"`;

export function useFakeStorage() {
  const objects = new Map<string, Uint8Array>();
  let failing: Error | null = null;
  const fake: Storage = {
    presignPut: async (key, mime, size) => `https://s3.test/put/${key}?type=${encodeURIComponent(mime)}&size=${size}`,
    head: async (key) => {
      if (failing) throw failing;
      const bytes = objects.get(key);
      return bytes ? { size: bytes.length, etag: etagOf(bytes) } : null;
    },
    get: async (key) => {
      if (failing) throw failing;
      const bytes = objects.get(key);
      return bytes ? { body: new Response(bytes.slice()).body!, size: bytes.length, etag: etagOf(bytes) } : null;
    },
    readHead: async (key, bytes) => (objects.get(key) ?? new Uint8Array()).slice(0, bytes),
    delete: async (key) => {
      objects.delete(key);
    },
  };
  setStorageForTests(fake);
  return {
    put: (key: string, bytes: Uint8Array) => objects.set(key, bytes),
    has: (key: string) => objects.has(key),
    /** Make every head/get throw (storage outage) until called with null. */
    fail: (err: Error | null) => {
      failing = err;
    },
    reset: () => {
      objects.clear();
      failing = null;
      setStorageForTests(undefined);
    },
  };
}

/** A minimal file body starting with the right magic bytes, padded to `size`. */
export function fileBytes(kind: "png" | "pdf" | "exe", size = 64): Uint8Array {
  const head = { png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], pdf: [...Buffer.from("%PDF-1.7")], exe: [0x4d, 0x5a, 0x90, 0x00] }[kind];
  const out = new Uint8Array(size);
  out.set(head);
  return out;
}
