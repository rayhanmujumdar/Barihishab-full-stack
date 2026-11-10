// One template for every request event (Requests PRD §10, design D9). Money
// as ৳ with lakh grouping; no fund account, reference or method, ever.
import { toBanglaDigits } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import type { RequestUpdatePayload } from "../outbox";
import { layout, type RenderedEmail } from "./layout";

type Copy = { subject: string; heading: string; lead: string };
type L = "bn" | "en";

const TYPE: Record<L, Record<RequestUpdatePayload["type"], string>> = {
  en: { ADVANCE: "advance", LOAN: "loan", GRANT: "special grant" },
  bn: { ADVANCE: "অগ্রিম", LOAN: "ঋণ", GRANT: "বিশেষ অনুদান" },
};

function copy(locale: L, p: RequestUpdatePayload, n: string, amount: string): Copy {
  const type = TYPE[locale][p.type];
  const requested = formatMoney(locale, p.amountRequestedPaisa);
  if (locale === "bn") {
    switch (p.event) {
      case "SUBMITTED":
        return { subject: `নতুন অনুরোধ ${n} · ${p.ownerName}-এর ${requested} ${type}`, heading: "নতুন টাকার অনুরোধ", lead: `${p.ownerName} ${requested} ${type} চেয়েছেন। সিদ্ধান্তের জন্য অপেক্ষা করছে।` };
      case "RECORDED":
        return { subject: `${n} আপনার নামে লেখা হয়েছে · ${requested} ${type}`, heading: "আপনার পক্ষে অনুরোধ লেখা হয়েছে", lead: `${p.actorName} আপনার পক্ষে ${requested} ${type}-এর অনুরোধ লিখেছেন।` };
      case "EDITED":
        return { subject: `${n} সম্পাদনা করা হয়েছে`, heading: "অনুরোধ সম্পাদিত", lead: `${p.actorName} ${p.ownerName}-এর অনুরোধ বদলেছেন। এখন: ${requested} ${type}।` };
      case "CANCELLED":
        return { subject: `${n} বাতিল করা হয়েছে`, heading: "অনুরোধ বাতিল", lead: `${p.ownerName}-এর ${requested} ${type}-এর অনুরোধ বাতিল হয়েছে।` };
      case "APPROVED":
        return { subject: `${n} অনুমোদিত · ${amount}`, heading: "অনুরোধ অনুমোদিত", lead: `আপনার ${type}-এর অনুরোধ ${amount}-তে অনুমোদিত হয়েছে। টাকা দেওয়ার সময় আবার জানানো হবে।` };
      case "SELF_APPROVED":
        return { subject: `${n} নিজে অনুমোদিত · ${p.ownerName} · ${amount}`, heading: "নিজের অনুরোধ নিজে অনুমোদিত", lead: `${p.actorName} নিজের ${amount} ${type}-এর অনুরোধ অনুমোদন করেছেন।` };
      case "REJECTED":
        return { subject: `${n} অনুমোদিত হয়নি`, heading: "অনুরোধ অনুমোদিত হয়নি", lead: `আপনার ${requested} ${type}-এর অনুরোধ অনুমোদিত হয়নি। চাইলে নতুন অনুরোধ পাঠাতে পারেন।` };
      case "WITHDRAWN":
        return { subject: `${n}-এর অনুমোদন তুলে নেওয়া হয়েছে`, heading: "অনুমোদন তুলে নেওয়া হয়েছে", lead: `আপনার ${type}-এর অনুরোধের অনুমোদন টাকা দেওয়ার আগে তুলে নেওয়া হয়েছে।` };
      case "DISBURSED":
        return { subject: `${n} পরিশোধ · ${p.ownerName}-কে ${amount}`, heading: "অনুরোধের টাকা দেওয়া হয়েছে", lead: `${p.ownerName}-কে ${amount} ${type} দেওয়া হয়েছে।` };
      case "REMINDER":
        return {
          subject: `মনে করিয়ে দেওয়া: ${n}`,
          heading: "অনুরোধটি দেখুন",
          lead: p.reminderKind === "APPROVED_PAST_DUE" ? `${p.ownerName}-এর ${amount} ${type} অনুমোদিত কিন্তু দরকারের তারিখ পার হলেও দেওয়া হয়নি।` : `${p.ownerName}-এর ${requested} ${type}-এর অনুরোধ ৩ দিনের বেশি সিদ্ধান্তের অপেক্ষায়।`,
        };
    }
  }
  switch (p.event) {
    case "SUBMITTED":
      return { subject: `New request ${n} · ${requested} ${type} from ${p.ownerName}`, heading: "New money request", lead: `${p.ownerName} asked for a ${requested} ${type}. It is waiting for your decision.` };
    case "RECORDED":
      return { subject: `${n} recorded for you · ${requested} ${type}`, heading: "A request was recorded for you", lead: `${p.actorName} recorded a ${requested} ${type} request on your behalf.` };
    case "EDITED":
      return { subject: `${n} was edited`, heading: "Request edited", lead: `${p.actorName} changed ${p.ownerName}'s request. It is now ${requested} (${type}).` };
    case "CANCELLED":
      return { subject: `${n} was cancelled`, heading: "Request cancelled", lead: `${p.ownerName}'s ${requested} ${type} request was cancelled.` };
    case "APPROVED":
      return { subject: `${n} approved · ${amount}`, heading: "Request approved", lead: `Your ${type} request was approved for ${amount}. You'll hear again when it is paid out.` };
    case "SELF_APPROVED":
      return { subject: `${n} self-approved · ${amount} to ${p.ownerName}`, heading: "Self-approved request", lead: `${p.actorName} approved their own ${amount} ${type} request.` };
    case "REJECTED":
      return { subject: `${n} was not approved`, heading: "Request not approved", lead: `Your ${requested} ${type} request was not approved. You can send a new request.` };
    case "WITHDRAWN":
      return { subject: `Approval withdrawn for ${n}`, heading: "Approval withdrawn", lead: `The approval of your ${type} request was taken back before it was paid out.` };
    case "DISBURSED":
      return { subject: `${n} paid out · ${amount} to ${p.ownerName}`, heading: "Request paid out", lead: `${p.ownerName} received a ${amount} ${type}.` };
    case "REMINDER":
      return {
        subject: `Reminder: ${n} needs your attention`,
        heading: "Request needs attention",
        lead:
          p.reminderKind === "APPROVED_PAST_DUE"
            ? `${p.ownerName}'s ${amount} ${type} was approved but not paid by the needed-by date.`
            : `${p.ownerName}'s ${requested} ${type} request has been waiting for a decision for more than 3 days.`,
      };
  }
}

export function requestUpdateEmail(locale: L, p: RequestUpdatePayload, appUrl: string): RenderedEmail {
  const n = locale === "bn" ? toBanglaDigits(p.number) : p.number;
  const amount = formatMoney(locale, p.amountApprovedPaisa ?? p.amountRequestedPaisa);
  const c = copy(locale, p, n, amount);
  const url = `${appUrl}/${locale}/requests?request=${p.requestId}`;
  const lines = [
    c.lead,
    `${locale === "bn" ? "কারণ" : "For"}: “${p.shortReason}”`,
    ...(p.note ? [`${locale === "bn" ? "অ্যাডমিন" : "Admin"}: ${p.note}`] : []),
    ...(p.event === "DISBURSED" ? [`${locale === "bn" ? "অনুমোদন করেছেন" : "Approved by"} ${p.actorName}`] : []),
  ];
  const footnote = locale === "bn" ? "বাড়ি হিসাবের অনুরোধ অংশ থেকে স্বয়ংক্রিয় বার্তা।" : "An automatic message from BariHisab Requests.";
  const cta = { label: locale === "bn" ? "অনুরোধ দেখুন" : "View request", url };
  return {
    subject: c.subject,
    html: layout({ lang: locale, heading: c.heading, paragraphs: lines, cta, footnote }),
    text: `${lines.join("\n\n")}\n\n${url}\n\n${footnote}`,
  };
}
