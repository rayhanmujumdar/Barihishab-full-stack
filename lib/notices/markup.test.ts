import { describe, expect, it } from "vitest";
import { parseNotice, renderNoticeHtml } from "./markup";

describe("parseNotice", () => {
  it("keeps plain text as one paragraph, line breaks included", () => {
    expect(parseNotice("Supply off\nfrom 10 am")).toEqual([{ type: "p", lines: [[{ t: "text", v: "Supply off" }], [{ t: "text", v: "from 10 am" }]] }]);
  });

  it("splits paragraphs on blank lines and drops empty input", () => {
    expect(parseNotice("One\n\n\nTwo")).toHaveLength(2);
    expect(parseNotice("")).toEqual([]);
    expect(parseNotice("  \n \n")).toEqual([]);
  });

  it("reads **bold**", () => {
    expect(parseNotice("Bring **cash** please")).toEqual([
      { type: "p", lines: [[{ t: "text", v: "Bring " }, { t: "bold", v: "cash" }, { t: "text", v: " please" }]] },
    ]);
  });

  it("leaves an unclosed or empty ** as text", () => {
    expect(parseNotice("a ** b")).toEqual([{ type: "p", lines: [[{ t: "text", v: "a ** b" }]] }]);
    expect(parseNotice("a **** b")).toEqual([{ type: "p", lines: [[{ t: "text", v: "a **** b" }]] }]);
  });

  it("groups '- ' lines into one bullet list between paragraphs", () => {
    expect(parseNotice("Before\n- one\n- **two**\nAfter")).toEqual([
      { type: "p", lines: [[{ t: "text", v: "Before" }]] },
      { type: "ul", items: [[{ t: "text", v: "one" }], [{ t: "bold", v: "two" }]] },
      { type: "p", lines: [[{ t: "text", v: "After" }]] },
    ]);
  });

  it("reads http, https and mailto links", () => {
    expect(parseNotice("See [bill](https://x.test/a?b=1) or [mail](mailto:a@b.test) or [old](http://x.test)")[0]).toEqual({
      type: "p",
      lines: [
        [
          { t: "text", v: "See " },
          { t: "link", v: "bill", href: "https://x.test/a?b=1" },
          { t: "text", v: " or " },
          { t: "link", v: "mail", href: "mailto:a@b.test" },
          { t: "text", v: " or " },
          { t: "link", v: "old", href: "http://x.test" },
        ],
      ],
    });
  });

  it("keeps unsafe link schemes as plain text", () => {
    expect(parseNotice("[x](javascript:alert(1))")).toEqual([{ type: "p", lines: [[{ t: "text", v: "[x](javascript:alert(1))" }]] }]);
    expect(parseNotice("[x](data:text/html,hi)")).toEqual([{ type: "p", lines: [[{ t: "text", v: "[x](data:text/html,hi)" }]] }]);
  });

  it("keeps HTML as literal text", () => {
    expect(parseNotice("<script>alert(1)</script>")).toEqual([{ type: "p", lines: [[{ t: "text", v: "<script>alert(1)</script>" }]] }]);
  });
});

describe("renderNoticeHtml", () => {
  it("escapes everything that is not bold, a list or a safe link", () => {
    const html = renderNoticeHtml(`<img src=x onerror="alert(1)"> & 'q'\n- **a**\n- [b](https://x.test/?a=1&b=2)`);
    expect(html).toBe(
      `<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;q&#39;</p>` +
        `<ul><li><strong>a</strong></li><li><a href="https://x.test/?a=1&amp;b=2">b</a></li></ul>`,
    );
  });

  it("joins lines of a paragraph with <br>", () => {
    expect(renderNoticeHtml("a\nb")).toBe("<p>a<br>b</p>");
  });
});
