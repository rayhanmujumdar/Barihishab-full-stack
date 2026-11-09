import type { InvitePayload } from "../outbox";
import { layout, type RenderedEmail } from "./layout";

export function inviteEmail(locale: "bn" | "en", p: InvitePayload, appUrl: string): RenderedEmail {
  const url = `${appUrl}/${locale}/invite/${p.token}`;
  if (locale === "bn") {
    const subject = "বাড়ি হিসাব-এ আপনার আমন্ত্রণ";
    const lines = [
      `প্রিয় ${p.firstName},`,
      `${p.invitedBy} আপনাকে বাড়ি হিসাব-এ যোগ দেওয়ার আমন্ত্রণ জানিয়েছেন। নিচের লিংকে গিয়ে নিজের পাসওয়ার্ড ঠিক করুন।`,
      "এই লিংকটি ৭২ ঘণ্টা পর্যন্ত কাজ করবে এবং একবারই ব্যবহার করা যাবে।",
    ];
    const footnote = "আপনি এই আমন্ত্রণ আশা না করলে ইমেইলটি উপেক্ষা করুন।";
    return {
      subject,
      html: layout({ lang: "bn", heading: "আমন্ত্রণ", paragraphs: lines, cta: { label: "পাসওয়ার্ড ঠিক করুন", url }, footnote }),
      text: `${lines.join("\n\n")}\n\n${url}\n\n${footnote}`,
    };
  }
  const subject = "You're invited to BariHisab";
  const lines = [
    `Hi ${p.firstName},`,
    `${p.invitedBy} has invited you to BariHisab. Open the link below to set your own password.`,
    "The link works once and expires in 72 hours.",
  ];
  const footnote = "If you weren't expecting this invite, you can ignore this email.";
  return {
    subject,
    html: layout({ lang: "en", heading: "You're invited", paragraphs: lines, cta: { label: "Set your password", url }, footnote }),
    text: `${lines.join("\n\n")}\n\n${url}\n\n${footnote}`,
  };
}
