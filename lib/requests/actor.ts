// Request permissions of the caller, resolved once per API call (design D8).
import type { AuthContext } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/request-meta";
import { can } from "@/lib/permissions";
import type { RequestViewer } from "./request-read";
import type { RequestActor } from "./request-service";

export function requestViewer(auth: Pick<AuthContext, "userId" | "permissions">): RequestViewer {
  return { userId: auth.userId, viewAll: can(auth, "request.view.all") };
}

export function requestActor(auth: Pick<AuthContext, "userId" | "permissions">, req: Request): RequestActor {
  return { id: auth.userId, ...requestMeta(req), viewAll: can(auth, "request.view.all"), decide: can(auth, "request.decide"), record: can(auth, "request.record") };
}
