import { describe, expect, it } from "vitest";
import { contentDisposition } from "@/lib/files/disposition";

describe("contentDisposition", () => {
  it("serves inline by default with an ASCII name and an RFC 5987 copy", () => {
    expect(contentDisposition("desco-oct.pdf")).toBe(`inline; filename="desco-oct.pdf"; filename*=UTF-8''desco-oct.pdf`);
  });

  it("switches to attachment for downloads", () => {
    expect(contentDisposition("desco-oct.pdf", "attachment")).toMatch(/^attachment; filename="desco-oct\.pdf"; /);
  });

  it("keeps Bangla names in filename* and an ASCII-safe fallback", () => {
    const h = contentDisposition("বিদ্যুৎ-বিল.jpg");
    expect(h).toMatch(/^inline; filename="[\x20-\x7e]+"; /);
    expect(h).toContain(`filename*=UTF-8''${encodeURIComponent("বিদ্যুৎ-বিল.jpg")}`);
  });

  it("can't break out of the quoted name", () => {
    expect(contentDisposition('a"b\\c.png')).toContain(`filename="a_b_c.png"`);
  });
});
