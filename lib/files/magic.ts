// Magic-byte sniffing for uploaded bills (Income & Expenses PRD §8, IE-20):
// the declared MIME type must match the file's real leading bytes.

export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type AllowedMime = (typeof ALLOWED_MIME)[number];

/** Bytes needed to recognise every allowed type. */
export const SNIFF_BYTES = 12;

const startsWith = (b: Uint8Array, sig: readonly number[], at = 0) => sig.every((v, i) => b[at + i] === v);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

export function sniffMime(b: Uint8Array): AllowedMime | null {
  if (b.length < 4) return null;
  if (startsWith(b, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (startsWith(b, ascii("%PDF"))) return "application/pdf";
  if (b.length >= SNIFF_BYTES && startsWith(b, ascii("RIFF")) && startsWith(b, ascii("WEBP"), 8)) return "image/webp";
  return null;
}

export function matchesMime(b: Uint8Array, declared: string): boolean {
  return sniffMime(b) === declared;
}
