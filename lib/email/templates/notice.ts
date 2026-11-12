// Notice emails (Notices & Complaints PRD §11, Rule 3, G4): the full notice in
// the reader's language, "[Urgent]" first in the subject when urgent, body
// formatted with only bold, bullets and safe links (everything else escaped).
import { renderNoticeHtml } from "@/lib/notices/markup";
import type { NoticePayload } from "../outbox";
import { layout, type RenderedEmail } from "./layout";

type L = "bn" | "en";

const COPY: Record<L, { urgent: string; reminder: string; edited: string; heading: Record<NoticePayload["event"], string>; by: string; cta: string; footnote: string }> = {
  en: {
    urgent: "[Urgent] ",
    reminder: "Reminder: ",
    edited: "Updated: ",
    heading: { PUBLISHED: "New house notice", EDITED: "A house notice was updated", REMINDER: "Please read this notice" },
    by: "From",
    cta: "Open notice",
    footnote: "An automatic message from BariHisab Notices.",
  },
  bn: {
    urgent: "[জরুরি] ",
    reminder: "মনে করিয়ে দেওয়া: ",
    edited: "হালনাগাদ: ",
    heading: { PUBLISHED: "বাড়ির নতুন নোটিশ", EDITED: "একটি নোটিশ হালনাগাদ হয়েছে", REMINDER: "নোটিশটি পড়ুন" },
    by: "পাঠিয়েছেন",
    cta: "নোটিশ খুলুন",
    footnote: "বাড়ি হিসাবের নোটিশ অংশ থেকে স্বয়ংক্রিয় বার্তা।",
  },
};

export function noticeEmail(locale: L, p: NoticePayload, appUrl: string): RenderedEmail {
  const c = COPY[locale];
  const prefix = p.event === "REMINDER" ? c.reminder : p.event === "EDITED" ? c.edited : "";
  const subject = `${p.urgent ? c.urgent : ""}${prefix}${p.title}`;
  const url = `${appUrl}/${locale}/notices?notice=${p.noticeId}`;
  const lines = [p.title, `${c.by}: ${p.authorName}`];
  return {
    subject,
    html: layout({ lang: locale, heading: c.heading[p.event], paragraphs: lines, bodyHtml: renderNoticeHtml(p.body), cta: { label: c.cta, url }, footnote: c.footnote }),
    text: `${lines.join("\n\n")}\n\n${p.body}\n\n${url}\n\n${c.footnote}`,
  };
}
