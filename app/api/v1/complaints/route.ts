import { connection } from "next/server";
import { parse, readJson, searchParams } from "@/lib/api/body";
import { ok } from "@/lib/api/response";
import { failResponse } from "@/lib/api/result";
import { withAuth } from "@/lib/auth/guard";
import { complaintActor, complaintViewer } from "@/lib/complaints/actor";
import { listComplaints } from "@/lib/complaints/complaint-read";
import { raiseComplaint } from "@/lib/complaints/complaint-service";
import { currentPropertyId } from "@/lib/property";
import { ListComplaintsQuerySchema, RaiseComplaintBodySchema } from "./schema";

export const GET = withAuth(
  async (req, { auth }) => {
    await connection();
    const query = parse(ListComplaintsQuerySchema, searchParams(req));
    if (!query.ok) return query.response;
    const { locale, ...q } = query.data;
    return ok(await listComplaints(await currentPropertyId(), complaintViewer(auth, locale ?? "en"), q), { headers: { "Cache-Control": "no-store" } });
  },
  { permission: "complaint.view" },
);

export const POST = withAuth(
  async (req, { auth }) => {
    const body = await readJson(req, RaiseComplaintBodySchema);
    if (!body.ok) return body.response;
    const r = await raiseComplaint(await currentPropertyId(), body.data, complaintActor(auth, req));
    return r.ok ? ok({ complaint: r.complaint }, { status: 201 }) : failResponse(r);
  },
  { permission: "complaint.create" },
);
