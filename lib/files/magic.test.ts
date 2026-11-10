import { describe, expect, it } from "vitest";
import { IMAGE_MIME, isImageMime, matchesMime, sniffMime } from "./magic";

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
const ascii = (s: string) => new TextEncoder().encode(s.padEnd(16, "\0"));

describe("sniffMime", () => {
  it("recognises the four allowed types", () => {
    expect(sniffMime(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffMime(ascii("RIFF\x10\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(sniffMime(ascii("%PDF-1.7"))).toBe("application/pdf");
  });

  it("rejects anything else and short buffers", () => {
    expect(sniffMime(ascii("MZ\x90\0"))).toBeNull(); // IE-20: .exe renamed .jpg
    expect(sniffMime(ascii("RIFF\0\0\0\0WAVEfmt "))).toBeNull();
    expect(sniffMime(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });
});

describe("matchesMime", () => {
  it("compares the sniffed type with the declared one", () => {
    expect(matchesMime(bytes(0xff, 0xd8, 0xff), "image/jpeg")).toBe(true);
    expect(matchesMime(ascii("MZ"), "image/jpeg")).toBe(false);
    expect(matchesMime(ascii("%PDF-"), "image/png")).toBe(false);
  });
});

describe("IMAGE_MIME / isImageMime (profile photos)", () => {
  it("allows only JPEG, PNG and WebP", () => {
    expect([...IMAGE_MIME]).toEqual(["image/jpeg", "image/png", "image/webp"]);
    expect(isImageMime("image/png")).toBe(true);
    expect(isImageMime("application/pdf")).toBe(false);
    expect(isImageMime("image/gif")).toBe(false);
  });

  it("rejects PDF bytes even when declared as an image", () => {
    expect(matchesMime(ascii("%PDF-1.7"), "image/png")).toBe(false);
  });
});
