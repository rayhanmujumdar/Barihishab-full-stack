import { describe, expect, it } from "vitest";
import { renderEmail } from "../render";

const APP = "https://app.example";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";

function occurrences(haystack: string, needle: string) {
  return haystack.split(needle).length - 1;
}

describe("auth email templates", () => {
  it("renders the invite in Bangla with the link, inviter and 72 h expiry", () => {
    const m = renderEmail("INVITE", "bn", { token: TOKEN, firstName: "করিম", invitedBy: "রায়হান", expiresAt: "2026-11-12T00:00:00.000Z" }, APP);
    expect(m.subject).toMatch(/আমন্ত্রণ/);
    expect(m.html).toContain(`${APP}/bn/invite/${TOKEN}`);
    expect(m.text).toContain(`${APP}/bn/invite/${TOKEN}`);
    expect(m.text).toMatch(/৭২ ঘণ্টা/);
    expect(m.text).toContain("রায়হান");
  });

  it("renders the invite in English", () => {
    const m = renderEmail("INVITE", "en", { token: TOKEN, firstName: "Karim", invitedBy: "Rayhan", expiresAt: "2026-11-12T00:00:00.000Z" }, APP);
    expect(m.subject).toBe("You're invited to BariHisab");
    expect(m.text).toMatch(/72 hours/);
    expect(m.html).toMatch(/Hi Karim/);
  });

  it("renders the reset email with a /reset link and the 1 hour expiry in both languages", () => {
    const en = renderEmail("RESET", "en", { token: TOKEN, firstName: "Karim", expiresAt: "2026-11-09T01:00:00.000Z" }, APP);
    expect(en.subject).toBe("Reset your BariHisab password");
    expect(en.text).toContain(`${APP}/en/reset/${TOKEN}`);
    expect(en.text).toMatch(/1 hour/);
    const bn = renderEmail("RESET", "bn", { token: TOKEN, firstName: "করিম", expiresAt: "2026-11-09T01:00:00.000Z" }, APP);
    expect(bn.text).toMatch(/১ ঘণ্টা/);
  });

  it("renders the password-changed notice without any link token", () => {
    const en = renderEmail("PASSWORD_CHANGED", "en", { firstName: "Karim", changedAt: "2026-11-09T00:00:00.000Z" }, APP);
    expect(en.subject).toBe("Your BariHisab password was changed");
    expect(en.text).toContain(`${APP}/en/forgot`);
    expect(en.text).toMatch(/wasn't you/);
    expect(renderEmail("PASSWORD_CHANGED", "bn", { firstName: "করিম", changedAt: "2026-11-09T00:00:00.000Z" }, APP).subject).toMatch(/পাসওয়ার্ড/);
  });

  it("puts the token only inside the link", () => {
    const m = renderEmail("RESET", "en", { token: TOKEN, firstName: "Karim", expiresAt: "2026-11-09T01:00:00.000Z" }, APP);
    expect(occurrences(m.text, TOKEN)).toBe(occurrences(m.text, `/reset/${TOKEN}`));
    expect(occurrences(m.html, TOKEN)).toBe(occurrences(m.html, `/reset/${TOKEN}`));
  });

  it("escapes HTML in names", () => {
    const m = renderEmail("INVITE", "en", { token: TOKEN, firstName: "<script>x</script>", invitedBy: "A&B", expiresAt: "2026-11-12T00:00:00.000Z" }, APP);
    expect(m.html).not.toContain("<script>x</script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.html).toContain("A&amp;B");
  });
});
