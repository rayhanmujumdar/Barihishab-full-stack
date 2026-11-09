import type { ResetPayload } from "../outbox";
import { layout, type RenderedEmail } from "./layout";

export function resetEmail(locale: "bn" | "en", p: ResetPayload, appUrl: string): RenderedEmail {
  const url = `${appUrl}/${locale}/reset/${p.token}`;
  if (locale === "bn") {
    const subject = "বাড়ি হিসাব পাসওয়ার্ড রিসেট";
    const lines = [
      `প্রিয় ${p.firstName},`,
      "আপনার পাসওয়ার্ড রিসেট করার অনুরোধ পেয়েছি। নিচের লিংকে গিয়ে নতুন পাসওয়ার্ড দিন।",
      "লিংকটি ১ ঘণ্টা পর্যন্ত কাজ করবে এবং একবারই ব্যবহার করা যাবে।",
    ];
    const footnote = "আপনি অনুরোধ না করে থাকলে এই ইমেইলটি উপেক্ষা করুন — আপনার পাসওয়ার্ড বদলাবে না।";
    return {
      subject,
      html: layout({ lang: "bn", heading: "পাসওয়ার্ড রিসেট", paragraphs: lines, cta: { label: "নতুন পাসওয়ার্ড দিন", url }, footnote }),
      text: `${lines.join("\n\n")}\n\n${url}\n\n${footnote}`,
    };
  }
  const subject = "Reset your BariHisab password";
  const lines = [
    `Hi ${p.firstName},`,
    "We received a request to reset your password. Open the link below to choose a new one.",
    "The link works once and expires in 1 hour.",
  ];
  const footnote = "If you didn't ask for this, ignore this email — your password won't change.";
  return {
    subject,
    html: layout({ lang: "en", heading: "Reset your password", paragraphs: lines, cta: { label: "Choose a new password", url }, footnote }),
    text: `${lines.join("\n\n")}\n\n${url}\n\n${footnote}`,
  };
}
