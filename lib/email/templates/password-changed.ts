import type { PasswordChangedPayload } from "../outbox";
import { layout, type RenderedEmail } from "./layout";

function dhaka(iso: string, locale: "bn" | "en") {
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dhaka",
  }).format(new Date(iso));
}

export function passwordChangedEmail(locale: "bn" | "en", p: PasswordChangedPayload, appUrl: string): RenderedEmail {
  const url = `${appUrl}/${locale}/forgot`;
  if (locale === "bn") {
    const subject = "আপনার বাড়ি হিসাব পাসওয়ার্ড বদলানো হয়েছে";
    const lines = [
      `প্রিয় ${p.firstName},`,
      `${dhaka(p.changedAt, "bn")}-এ আপনার পাসওয়ার্ড বদলানো হয়েছে এবং অন্য সব ডিভাইস থেকে লগ আউট করা হয়েছে।`,
      "এটি আপনি না করে থাকলে এখনই পাসওয়ার্ড রিসেট করুন এবং অ্যাডমিনকে জানান।",
    ];
    const footnote = "এটি একটি স্বয়ংক্রিয় নিরাপত্তা বার্তা।";
    return {
      subject,
      html: layout({ lang: "bn", heading: "পাসওয়ার্ড বদলানো হয়েছে", paragraphs: lines, cta: { label: "পাসওয়ার্ড রিসেট করুন", url }, footnote }),
      text: `${lines.join("\n\n")}\n\n${url}\n\n${footnote}`,
    };
  }
  const subject = "Your BariHisab password was changed";
  const lines = [
    `Hi ${p.firstName},`,
    `Your password was changed on ${dhaka(p.changedAt, "en")} and every other device was logged out.`,
    "If this wasn't you, reset your password now and tell your admin.",
  ];
  const footnote = "This is an automatic security notice.";
  return {
    subject,
    html: layout({ lang: "en", heading: "Password changed", paragraphs: lines, cta: { label: "Reset password", url }, footnote }),
    text: `${lines.join("\n\n")}\n\n${url}\n\n${footnote}`,
  };
}
