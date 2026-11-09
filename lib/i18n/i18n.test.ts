import { describe, expect, it } from "vitest";
import { bn } from "./bn";
import { en } from "./en";
import { DEFAULT_LOCALE, dictionary, resolveLocale, t, toBanglaDigits } from "./index";

describe("i18n", () => {
  it("defaults to Bangla", () => {
    expect(DEFAULT_LOCALE).toBe("bn");
    expect(resolveLocale(undefined)).toBe("bn");
    expect(resolveLocale("fr")).toBe("bn");
    expect(resolveLocale("en")).toBe("en");
  });

  it("has exactly the same keys in bn and en, none empty", () => {
    expect(Object.keys(bn).sort()).toEqual(Object.keys(en).sort());
    for (const [k, v] of Object.entries(bn)) expect(v, `bn.${k}`).toBeTruthy();
    for (const [k, v] of Object.entries(en)) expect(v, `en.${k}`).toBeTruthy();
  });

  it("keeps the same {placeholders} in both languages", () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const k of Object.keys(en) as (keyof typeof en)[]) expect(vars(bn[k]), k).toEqual(vars(en[k]));
  });

  it("interpolates variables", () => {
    expect(t("en", "login.attemptsLeft", { count: 2 })).toBe("2 attempts left before a 15-minute lock.");
    expect(t("bn", "invite.welcome", { name: "করিম" })).toContain("করিম");
  });

  it("uses Bangla digits for numbers in bn", () => {
    expect(toBanglaDigits("71 h")).toBe("৭১ h");
    expect(t("bn", "login.attemptsLeft", { count: 2 })).toContain("২");
  });

  it("returns the whole dictionary", () => {
    expect(dictionary("en")["login.submit"]).toBe(en["login.submit"]);
  });

  it("uses the PRD wording for the login errors", () => {
    expect(en["login.error.invalid"]).toBe("Username/email or password is wrong.");
    expect(en["login.error.locked"]).toBe("Too many attempts. Try again in 15 minutes or reset your password.");
    expect(en["forgot.sent"]).toBe("If that email has an account, a link is on its way.");
  });
});
