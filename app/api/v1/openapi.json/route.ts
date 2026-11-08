import { connection } from "next/server";
import { isApiDocsEnabled } from "@/lib/api/constants";
import { fail } from "@/lib/api/response";
import { getOpenApiDocument } from "../openapi";

export async function GET() {
  // Read the env flag per request, not at build time.
  await connection();
  if (!isApiDocsEnabled()) {
    return fail({ status: 404, code: "NOT_FOUND", message: "Not found" });
  }
  return Response.json(getOpenApiDocument());
}
