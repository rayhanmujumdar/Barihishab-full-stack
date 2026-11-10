import { connection } from "next/server";
import { ok } from "@/lib/api/response";
import { withAuth } from "@/lib/auth/guard";
import { outboxStatusJson } from "@/lib/email/status";
import type { OutboxStatusDto } from "./schema";

export const GET = withAuth(
  async () => {
    await connection();
    const body: OutboxStatusDto = await outboxStatusJson();
    return ok(body, { headers: { "Cache-Control": "no-store" } });
  },
  { permission: "user.list" },
);
