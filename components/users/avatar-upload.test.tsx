import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api/client";
import { AVATAR_MAX_BYTES, uploadAvatar } from "./avatar-upload";

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, apiFetch: vi.fn() };
});
const api = vi.mocked(apiFetch);

let drawn: { canvas: { width: number; height: number }; args: unknown[] } | null;
let blobSize = 40_000;

function stubCanvas(bitmap = { width: 4000, height: 3000 }) {
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ ...bitmap, close: vi.fn() })));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    return { fillStyle: "", fillRect: vi.fn(), drawImage: (...args: unknown[]) => (drawn = { canvas: { width: this.width, height: this.height }, args }) } as never;
  });
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb: BlobCallback, type?: string) => cb(new Blob([new Uint8Array(blobSize)], { type })));
}

const fetchMock = vi.fn();
beforeEach(() => {
  drawn = null;
  blobSize = 40_000;
  api.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const jpeg = (name = "IMG_0001.JPG", size = 6_000_000) => new File([new Uint8Array(size)], name, { type: "image/jpeg" });

describe("uploadAvatar", () => {
  it("rejects a PDF without calling the API", async () => {
    stubCanvas();
    const r = await uploadAvatar(new File(["%PDF"], "cv.pdf", { type: "application/pdf" }));
    expect(r).toEqual({ ok: false, reason: "bad" });
    expect(api).not.toHaveBeenCalled();
  });

  it("crops a big phone photo to a 512×512 JPEG, presigns and PUTs it", async () => {
    stubCanvas();
    api.mockResolvedValue({ ok: true, status: 201, data: { avatarId: "a1", uploadUrl: "https://s3/put", headers: { "Content-Type": "image/jpeg" } } } as never);
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    const r = await uploadAvatar(jpeg());
    expect(r).toEqual({ ok: true, id: "a1" });
    expect(drawn?.canvas).toEqual({ width: 512, height: 512 });
    expect(drawn?.args.slice(1)).toEqual([500, 0, 3000, 3000, 0, 0, 512, 512]);
    expect(api).toHaveBeenCalledWith("/avatars/presign", { method: "POST", body: { fileName: "IMG_0001.jpg", mime: "image/jpeg", size: 40_000 } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://s3/put");
    expect((init.body as File).type).toBe("image/jpeg");
    expect((init.body as File).size).toBe(40_000);
  });

  it("rejects a result still over 2 MB", async () => {
    stubCanvas();
    blobSize = AVATAR_MAX_BYTES + 1;
    expect(await uploadAvatar(jpeg())).toEqual({ ok: false, reason: "bad" });
    expect(api).not.toHaveBeenCalled();
  });

  it("fails rather than uploading the raw file when canvas is unavailable", async () => {
    // no createImageBitmap stub
    expect(await uploadAvatar(jpeg("me.png", 100))).toEqual({ ok: false, reason: "failed" });
    expect(api).not.toHaveBeenCalled();
  });

  it("reports a failed PUT", async () => {
    stubCanvas();
    api.mockResolvedValue({ ok: true, status: 201, data: { avatarId: "a1", uploadUrl: "https://s3/put", headers: {} } } as never);
    fetchMock.mockResolvedValue(new Response(null, { status: 403 }));
    expect(await uploadAvatar(jpeg())).toEqual({ ok: false, reason: "failed" });
  });
});
