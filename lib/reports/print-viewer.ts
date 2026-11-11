// Who generated a printout (Reports PRD F5 footer).
import type { Viewer } from "@/lib/auth/server";

export const viewerName = (v: Pick<Viewer, "firstName" | "lastName" | "username">) => [v.firstName, v.lastName].filter(Boolean).join(" ") || v.username;
