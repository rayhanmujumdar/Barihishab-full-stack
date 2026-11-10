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

describe("request email template (Requests PRD §10)", () => {
  const base = {
    requestId: "11111111-1111-4111-8111-111111111111",
    number: "R-2026-015",
    ownerName: "Tanvir Ahmed",
    type: "ADVANCE" as const,
    amountRequestedPaisa: 800000,
    amountApprovedPaisa: 600000,
    shortReason: "Car service before the trip home",
    note: null,
    actorName: "Rayhan Ahmed",
    reminderKind: null,
  };

  it("renders every event in both languages with a link to the request", () => {
    const events = ["SUBMITTED", "RECORDED", "EDITED", "CANCELLED", "APPROVED", "SELF_APPROVED", "REJECTED", "WITHDRAWN", "DISBURSED", "REMINDER"] as const;
    for (const event of events) {
      for (const locale of ["en", "bn"] as const) {
        const m = renderEmail("REQUEST_UPDATE", locale, { ...base, event, reminderKind: event === "REMINDER" ? "PENDING_3_DAYS" : null }, APP);
        expect(m.subject, `${event} ${locale}`).toContain(locale === "bn" ? "R-২০২৬-০১৫" : "R-2026-015");
        expect(m.text).toContain(`${APP}/${locale}/requests?request=${base.requestId}`);
      }
    }
  });

  it("tells every owner about a disbursal without payment details", () => {
    const m = renderEmail("REQUEST_UPDATE", "en", { ...base, event: "DISBURSED" }, APP);
    expect(m.subject).toBe("R-2026-015 paid out · ৳6,000 to Tanvir Ahmed");
    expect(m.text).toContain("Car service before the trip home");
    expect(m.text).toContain("Approved by Rayhan Ahmed");
    expect(m.text).not.toMatch(/bKash|TrxID|DBBL|reference/i);
  });

  it("shows the approved amount and note in Bangla digits", () => {
    const m = renderEmail("REQUEST_UPDATE", "bn", { ...base, event: "APPROVED", note: "ব্যাংকে টাকা কম" }, APP);
    expect(m.text).toContain("৳৬,০০০");
    expect(m.text).toContain("ব্যাংকে টাকা কম");
  });

  it("omits the note line when there is none", () => {
    const m = renderEmail("REQUEST_UPDATE", "en", { ...base, event: "REJECTED", note: null }, APP);
    expect(m.text).not.toContain("Admin:");
    const withNote = renderEmail("REQUEST_UPDATE", "en", { ...base, event: "REJECTED", note: "Existing loan L2" }, APP);
    expect(withNote.text).toContain("Admin: Existing loan L2");
  });

  it("names the reminder reason", () => {
    const pending = renderEmail("REQUEST_UPDATE", "en", { ...base, event: "REMINDER", reminderKind: "PENDING_3_DAYS" }, APP);
    expect(pending.text).toMatch(/waiting for a decision for more than 3 days/);
    const due = renderEmail("REQUEST_UPDATE", "en", { ...base, event: "REMINDER", reminderKind: "APPROVED_PAST_DUE" }, APP);
    expect(due.text).toMatch(/approved but not paid/);
  });
});
