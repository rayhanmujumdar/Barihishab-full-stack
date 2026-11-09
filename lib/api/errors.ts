// Error-code catalogue (Auth PRD §7 "Error codes"). Every API error goes
// through apiError() so status, code and wording stay consistent.
import type { ZodError } from "zod";
import { fail } from "./response";

type ErrorDef = { status: number; en: string; bn: string };

export const ERRORS = {
  UNAUTHENTICATED: { status: 401, en: "Please log in to continue.", bn: "চালিয়ে যেতে লগ ইন করুন।" },
  INVALID_CREDENTIALS: {
    status: 401,
    en: "Username/email or password is wrong.",
    bn: "ইউজারনেম/ইমেইল অথবা পাসওয়ার্ড ভুল।",
  },
  ACCOUNT_LOCKED: {
    status: 423,
    en: "Too many attempts. Try again in 15 minutes or reset your password.",
    bn: "অনেকবার ভুল চেষ্টা হয়েছে। ১৫ মিনিট পরে আবার চেষ্টা করুন অথবা পাসওয়ার্ড রিসেট করুন।",
  },
  RATE_LIMITED: {
    status: 429,
    en: "Too many requests. Please wait a moment and try again.",
    bn: "অনেক বেশি অনুরোধ। একটু অপেক্ষা করে আবার চেষ্টা করুন।",
  },
  FORBIDDEN: { status: 403, en: "You don't have access to this.", bn: "এটিতে আপনার প্রবেশাধিকার নেই।" },
  CSRF_INVALID: {
    status: 403,
    en: "Your session check failed. Reload the page and try again.",
    bn: "সেশন যাচাই ব্যর্থ হয়েছে। পেজটি রিলোড করে আবার চেষ্টা করুন।",
  },
  TOKEN_EXPIRED: { status: 410, en: "This link has expired.", bn: "এই লিংকের মেয়াদ শেষ হয়ে গেছে।" },
  TOKEN_USED: { status: 410, en: "This link was already used.", bn: "এই লিংকটি আগেই ব্যবহার করা হয়েছে।" },
  LAST_SUPER_ADMIN: {
    status: 409,
    en: "At least one active Super Admin must remain.",
    bn: "কমপক্ষে একজন সক্রিয় সুপার অ্যাডমিন থাকতে হবে।",
  },
  CANNOT_REMOVE_OWN_ADMIN: {
    status: 409,
    en: "You can't remove your own Super Admin role.",
    bn: "আপনি নিজের সুপার অ্যাডমিন ভূমিকা সরাতে পারবেন না।",
  },
  USERNAME_TAKEN: { status: 409, en: "That username is already taken.", bn: "এই ইউজারনেমটি আগেই নেওয়া হয়েছে।" },
  EMAIL_TAKEN: { status: 409, en: "That email is already in use.", bn: "এই ইমেইলটি আগেই ব্যবহৃত হচ্ছে।" },
  NOT_INVITED: {
    status: 409,
    en: "This user has already accepted their invite.",
    bn: "এই ব্যবহারকারী আগেই আমন্ত্রণ গ্রহণ করেছেন।",
  },
  VALIDATION_FAILED: {
    status: 422,
    en: "Some fields need attention.",
    bn: "কিছু ঘর ঠিক করতে হবে।",
  },
  NOT_FOUND: { status: 404, en: "Not found.", bn: "পাওয়া যায়নি।" },
  // Income & Expenses PRD §10.5
  PERIOD_CLOSED: {
    status: 409,
    en: "That month is closed. Record an Adjustment in the open month instead.",
    bn: "এই মাসটি বন্ধ। চলতি খোলা মাসে একটি সমন্বয় (Adjustment) লিখুন।",
  },
  ALREADY_VOIDED: {
    status: 409,
    en: "This entry is void. Record a new entry instead.",
    bn: "এই এন্ট্রিটি বাতিল করা হয়েছে। নতুন এন্ট্রি লিখুন।",
  },
  ENTRY_CHANGED: {
    status: 409,
    en: "Someone else changed this entry. Reload it and try again.",
    bn: "অন্য কেউ এই এন্ট্রিটি বদলেছেন। রিলোড করে আবার চেষ্টা করুন।",
  },
  IDEMPOTENCY_CONFLICT: {
    status: 409,
    en: "This request was already sent with different details. Reload and try again.",
    bn: "এই অনুরোধটি অন্য তথ্য দিয়ে আগেই পাঠানো হয়েছে। রিলোড করে আবার চেষ্টা করুন।",
  },
  CATEGORY_LOCKED: {
    status: 409,
    en: "System categories can't be renamed or turned off.",
    bn: "সিস্টেম খাতের নাম বদলানো বা বন্ধ করা যায় না।",
  },
  FUND_NOT_EMPTY: {
    status: 409,
    en: "Only an account with a zero balance can be deactivated.",
    bn: "শুধু শূন্য ব্যালেন্সের অ্যাকাউন্ট বন্ধ করা যায়।",
  },
  NAME_TAKEN: { status: 409, en: "That name is already used.", bn: "এই নামটি আগেই ব্যবহৃত হচ্ছে।" },
  FILE_TOO_LARGE: {
    status: 413,
    en: "Only JPG, PNG, WebP or PDF up to 5 MB.",
    bn: "শুধু JPG, PNG, WebP বা PDF, সর্বোচ্চ ৫ MB।",
  },
  TOO_MANY_ATTACHMENTS: {
    status: 422,
    en: "An entry can have at most 5 files.",
    bn: "একটি এন্ট্রিতে সর্বোচ্চ ৫টি ফাইল রাখা যায়।",
  },
  INTERNAL_ERROR: {
    status: 500,
    en: "Something went wrong. Please try again.",
    bn: "কিছু একটা ভুল হয়েছে। আবার চেষ্টা করুন।",
  },
} as const satisfies Record<string, ErrorDef>;

export type ErrorCode = keyof typeof ERRORS;

export function apiError(
  code: ErrorCode,
  opts: { details?: unknown; locale?: "bn" | "en"; headers?: HeadersInit } = {},
): Response {
  const def = ERRORS[code];
  return fail(
    {
      status: def.status,
      code,
      message: opts.locale === "bn" ? def.bn : def.en,
      ...(opts.details === undefined ? {} : { details: opts.details }),
    },
    { headers: opts.headers },
  );
}

/** 422 VALIDATION_FAILED with `details.fields` = { "a.b": "first message" }. */
export function validationError(error: ZodError, locale?: "bn" | "en"): Response {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    fields[key] ??= issue.message;
  }
  return apiError("VALIDATION_FAILED", { details: { fields }, locale });
}

export function fieldError(field: string, message: string, extra: Record<string, unknown> = {}): Response {
  return apiError("VALIDATION_FAILED", { details: { fields: { [field]: message }, ...extra } });
}
