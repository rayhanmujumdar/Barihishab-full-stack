// Browser side of profile photo uploads (add-profile-photo D6): centre-crop to
// a square, scale to ≤ 512 px, re-encode as JPEG (drops EXIF/GPS), then PUT
// straight to the private bucket with a presigned URL. Without canvas support
// we fail instead of uploading the raw file — the size cap and metadata
// stripping depend on re-encoding.
import { apiFetch } from "@/lib/api/client";
import { canDrawImages, drawToJpeg, jpgName, planSquare } from "@/lib/files/image-canvas";

export const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp";
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const SIDE = 512;
const QUALITY = 0.85;

export type AvatarUploadResult = { ok: true; id: string } | { ok: false; reason: "bad" | "failed" };

export const isAvatarType = (file: File) => AVATAR_ACCEPT.split(",").includes(file.type);

export async function uploadAvatar(original: File): Promise<AvatarUploadResult> {
  if (!isAvatarType(original)) return { ok: false, reason: "bad" };
  if (!canDrawImages()) return { ok: false, reason: "failed" };
  let blob: Blob | null;
  try {
    blob = await drawToJpeg(original, (w, h) => planSquare(w, h, SIDE), QUALITY);
  } catch {
    return { ok: false, reason: "bad" }; // not decodable as an image
  }
  if (!blob) return { ok: false, reason: "failed" };
  if (blob.size > AVATAR_MAX_BYTES) return { ok: false, reason: "bad" };
  const file = new File([blob], jpgName(original.name).slice(0, 200), { type: "image/jpeg" });

  const signed = await apiFetch<{ avatarId: string; uploadUrl: string; headers: Record<string, string> }>("/avatars/presign", {
    method: "POST",
    body: { fileName: file.name, mime: file.type, size: file.size },
  });
  if (!signed.ok) return { ok: false, reason: signed.status === 413 || signed.status === 422 ? "bad" : "failed" };
  try {
    const put = await fetch(signed.data.uploadUrl, { method: "PUT", headers: signed.data.headers, body: file });
    return put.ok ? { ok: true, id: signed.data.avatarId } : { ok: false, reason: "failed" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
