// Complaint emails (Notices & Complaints PRD §11; main PRD §11 privacy): title,
// who and — for decisions — the Admin's explanation. Never the complaint text,
// contact or bank details. No link for readers who can't open the complaint.
import type { ComplaintUpdatePayload } from "../outbox";
import { layout, type RenderedEmail } from "./layout";

type L = "bn" | "en";
type Copy = { subject: string; heading: string; lead: string };

function copy(locale: L, p: ComplaintUpdatePayload): Copy {
  const t = p.title;
  if (locale === "bn") {
    switch (p.event) {
      case "NEW":
        return { subject: `নতুন অভিযোগ: ${t}`, heading: "নতুন অভিযোগ", lead: `${p.complainantName} একটি অভিযোগ করেছেন।` };
      case "NEW_PRIVATE":
        return { subject: `গোপন অভিযোগ: ${t}`, heading: "শুধু অ্যাডমিনের জন্য অভিযোগ", lead: `${p.complainantName} শুধু আপনাকে একটি অভিযোগ পাঠিয়েছেন।` };
      case "IN_REVIEW":
        return { subject: `যাচাই চলছে: ${t}`, heading: "অ্যাডমিন বিষয়টি দেখছেন", lead: `${p.actorName} আপনার অভিযোগটি যাচাই করছেন।` };
      case "RESOLVED":
        return { subject: `সমাধান হয়েছে: ${t}`, heading: "অভিযোগের সমাধান", lead: `${p.actorName} অভিযোগটির সমাধান করেছেন।` };
      case "REJECTED":
        return { subject: `গ্রহণ করা হয়নি: ${t}`, heading: "অভিযোগ গ্রহণ করা হয়নি", lead: `${p.actorName} অভিযোগটি গ্রহণ করেননি।` };
      case "WITHDRAWN":
        return { subject: `তুলে নেওয়া হয়েছে: ${t}`, heading: "অভিযোগ তুলে নেওয়া হয়েছে", lead: `${p.complainantName} অভিযোগটি তুলে নিয়েছেন।` };
      case "REOPENED":
        return { subject: `আবার খোলা হয়েছে: ${t}`, heading: "অভিযোগ আবার খোলা হয়েছে", lead: `${p.complainantName} সমাধানে সন্তুষ্ট নন এবং অভিযোগটি আবার খুলেছেন।` };
    }
  }
  switch (p.event) {
    case "NEW":
      return { subject: `New complaint: ${t}`, heading: "New complaint", lead: `${p.complainantName} raised a complaint.` };
    case "NEW_PRIVATE":
      return { subject: `Private complaint: ${t}`, heading: "Admin-only complaint", lead: `${p.complainantName} sent a complaint to you privately.` };
    case "IN_REVIEW":
      return { subject: `In review: ${t}`, heading: "Admin is looking into it", lead: `${p.actorName} is reviewing your complaint.` };
    case "RESOLVED":
      return { subject: `Resolved: ${t}`, heading: "Complaint resolved", lead: `${p.actorName} resolved the complaint.` };
    case "REJECTED":
      return { subject: `Not accepted: ${t}`, heading: "Complaint not accepted", lead: `${p.actorName} did not accept the complaint.` };
    case "WITHDRAWN":
      return { subject: `Withdrawn: ${t}`, heading: "Complaint withdrawn", lead: `${p.complainantName} withdrew the complaint.` };
    case "REOPENED":
      return { subject: `Reopened: ${t}`, heading: "Complaint reopened", lead: `${p.complainantName} isn't satisfied and reopened the complaint.` };
  }
}

export function complaintUpdateEmail(locale: L, p: ComplaintUpdatePayload, appUrl: string): RenderedEmail {
  const c = copy(locale, p);
  const url = `${appUrl}/${locale}/complaints/${p.complaintId}`;
  const lines = [c.lead, `“${p.title}”`, ...(p.explanation ? [`${locale === "bn" ? "ব্যাখ্যা" : "Explanation"}: ${p.explanation}`] : [])];
  const footnote = locale === "bn" ? "বাড়ি হিসাবের অভিযোগ অংশ থেকে স্বয়ংক্রিয় বার্তা।" : "An automatic message from BariHisab Complaints.";
  const cta = p.link ? { label: locale === "bn" ? "অভিযোগ দেখুন" : "View complaint", url } : undefined;
  return {
    subject: c.subject,
    html: layout({ lang: locale, heading: c.heading, paragraphs: lines, cta, footnote }),
    text: `${lines.join("\n\n")}${p.link ? `\n\n${url}` : ""}\n\n${footnote}`,
  };
}
