// In-memory stand-in for the S3 bucket (integration tests never hit the network).
import { setStorageForTests, type Storage } from "@/lib/storage";

export function useFakeStorage() {
  const objects = new Map<string, Uint8Array>();
  const fake: Storage = {
    presignPut: async (key, mime, size) => `https://s3.test/put/${key}?type=${encodeURIComponent(mime)}&size=${size}`,
    presignGet: async (key, fileName) => `https://s3.test/get/${key}?name=${encodeURIComponent(fileName)}&expires=300`,
    head: async (key) => (objects.has(key) ? { size: objects.get(key)!.length } : null),
    readHead: async (key, bytes) => (objects.get(key) ?? new Uint8Array()).slice(0, bytes),
    delete: async (key) => {
      objects.delete(key);
    },
  };
  setStorageForTests(fake);
  return {
    put: (key: string, bytes: Uint8Array) => objects.set(key, bytes),
    has: (key: string) => objects.has(key),
    reset: () => {
      objects.clear();
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
