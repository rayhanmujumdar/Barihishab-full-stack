// Browser side of bill uploads (ATT-01): compress images (≤ 2000 px, ~80 %,
// which also drops EXIF/GPS), then PUT straight to the private bucket with a
// presigned URL. PDFs go up unchanged.
import { apiFetch } from "@/lib/api/client";
import { drawToJpeg, jpgName, planScale } from "@/lib/files/image-canvas";

export const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
export const MAX_BYTES = 5 * 1024 * 1024;
const MAX_SIDE = 2000;

export type UploadResult = { ok: true; id: string } | { ok: false; reason: "bad" | "failed" };

async function compress(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || typeof createImageBitmap !== "function") return file;
  const blob = await drawToJpeg(file, (w, h) => planScale(w, h, MAX_SIDE), 0.8);
  if (!blob) return file;
  return new File([blob], jpgName(file.name), { type: "image/jpeg" });
}

export async function uploadBill(original: File): Promise<UploadResult> {
  if (!ACCEPT.split(",").includes(original.type)) return { ok: false, reason: "bad" };
  let file: File;
  try {
    file = await compress(original);
  } catch {
    file = original;
  }
  if (file.size > MAX_BYTES) return { ok: false, reason: "bad" };
  const signed = await apiFetch<{ attachmentId: string; uploadUrl: string; headers: Record<string, string> }>("/attachments/presign", {
    method: "POST",
    body: { fileName: file.name.slice(0, 200), mime: file.type, size: file.size },
  });
  if (!signed.ok) return { ok: false, reason: signed.status === 413 || signed.status === 422 ? "bad" : "failed" };
  try {
    const put = await fetch(signed.data.uploadUrl, { method: "PUT", headers: signed.data.headers, body: file });
    return put.ok ? { ok: true, id: signed.data.attachmentId } : { ok: false, reason: "failed" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/** One Idempotency-Key per open form (DUP-01). */
export const newIdempotencyKey = (): string => crypto.randomUUID();
