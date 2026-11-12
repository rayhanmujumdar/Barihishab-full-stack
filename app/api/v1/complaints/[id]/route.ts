import { connection } from "next/server";
import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/auth/guard";
import { complaintViewer, localeOf } from "@/lib/complaints/actor";
import { complaintDetail } from "@/lib/complaints/complaint-read";
import { prisma } from "@/lib/prisma";
import { currentPropertyId } from "@/lib/property";

export const GET = withAuth<{ id: string }>(
  async (req, { auth, params }) => {
    await connection();
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const d = await complaintDetail(prisma, await currentPropertyId(), params.id, complaintViewer(auth, localeOf(req)));
    return d ? ok({ complaint: d }, { headers: { "Cache-Control": "no-store" } }) : apiError("NOT_FOUND");
  },
  { permission: "complaint.view" },
);
