// Browser-side image re-encoding shared by bill uploads and profile photos.
// Drawing onto a canvas and exporting JPEG also drops EXIF/GPS metadata.
// The planning functions are pure so the geometry is unit-tested in Node.

/** Source rectangle (sx, sy, sw, sh) drawn into a `width × height` canvas. */
export type DrawPlan = { sx: number; sy: number; sw: number; sh: number; width: number; height: number };

/** Whole image, long side capped at `maxSide`, never upscaled (bills). */
export function planScale(w: number, h: number, maxSide: number): DrawPlan {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  return { sx: 0, sy: 0, sw: w, sh: h, width: Math.round(w * scale), height: Math.round(h * scale) };
}

/** Centre square crop, scaled down to at most `side` (profile photos). */
export function planSquare(w: number, h: number, side: number): DrawPlan {
  const crop = Math.min(w, h);
  const out = Math.min(side, crop);
  return { sx: Math.round((w - crop) / 2), sy: Math.round((h - crop) / 2), sw: crop, sh: crop, width: out, height: out };
}

export const canDrawImages = () => typeof createImageBitmap === "function" && typeof document !== "undefined";

/** Decodes `file`, draws it per `plan` on white (transparent PNG → white, not black) and encodes JPEG. */
export async function drawToJpeg(file: Blob, plan: (w: number, h: number) => DrawPlan, quality: number): Promise<Blob | null> {
  const bitmap = await createImageBitmap(file);
  try {
    const p = plan(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = p.width;
    canvas.height = p.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, p.width, p.height);
    ctx.drawImage(bitmap, p.sx, p.sy, p.sw, p.sh, 0, 0, p.width, p.height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  } finally {
    bitmap.close();
  }
}

/** `photo.HEIC.png` → `photo.HEIC.jpg` */
export const jpgName = (name: string) => name.replace(/\.[^.]+$/, "") + ".jpg";
