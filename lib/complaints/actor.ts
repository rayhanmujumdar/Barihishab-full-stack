// Complaint permissions of the caller, resolved once per API call (design D12).
import type { AuthContext } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import type { Locale } from "@/lib/i18n";
import { can } from "@/lib/permissions";
import type { ReadViewer } from "./complaint-read";
import type { ComplaintActor } from "./complaint-service";

type Auth = Pick<AuthContext, "userId" | "permissions">;

/** Labels follow `?locale=bn|en` (default en); user-written text is never translated (Rule 18). */
export const localeOf = (req: Request): Locale => (new URL(req.url).searchParams.get("locale") === "bn" ? "bn" : "en");

export function complaintViewer(auth: Auth, locale: Locale): ReadViewer {
  return { userId: auth.userId, viewAll: can(auth, "complaint.view.all"), requestViewAll: can(auth, "request.view.all"), decide: can(auth, "complaint.decide"), locale };
}

export function complaintActor(auth: Auth, req: Request): ComplaintActor {
  const v = complaintViewer(auth, localeOf(req));
  return { id: auth.userId, ...requestMeta(req), viewAll: v.viewAll, decide: v.decide, requestViewAll: v.requestViewAll, locale: v.locale };
}
