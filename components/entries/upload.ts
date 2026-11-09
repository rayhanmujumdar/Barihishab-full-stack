// Browser side of bill uploads (ATT-01): compress images (≤ 2000 px, ~80 %,
// which also drops EXIF/GPS), then PUT straight to the private bucket with a
// presigned URL. PDFs go up unchanged.
import { apiFetch } from "@/lib/api/client";

export const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
export const MAX_BYTES = 5 * 1024 * 1024;
const MAX_SIDE = 2000;

export type UploadResult = { ok: true; id: string } | { ok: false; reason: "bad" | "failed" };

async function compress(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || typeof createImageBitmap !== "function") return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.fillStyle = "#fff"; // transparent PNGs → white, not black, as JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
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
