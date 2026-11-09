// Same-origin file proxy (ATT-02): streams a bill/receipt from the private
// bucket so the browser only ever sees this app's domain — never the storage
// host, object key or a signature. Every request is permission-checked.
import { connection } from "next/server";
import { apiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/params";
import { openFile } from "@/lib/attachments/attachment-service";
import { withAuth } from "@/lib/auth/guard";
import { contentDisposition } from "@/lib/files/disposition";
import { currentPropertyId } from "@/lib/property";

/** Lets the browser's own image/PDF viewer render the file; no scripts, no plugins. */
const FILE_CSP = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'";
/** Files are immutable (ATT-02), so a short private cache plus ETag revalidation is safe. */
const CACHE = "private, max-age=300";

export const GET = withAuth<{ id: string }>(
  async (req, { params }) => {
    await connection();
    if (!isUuid(params.id)) return apiError("NOT_FOUND");
    const opened = await openFile(await currentPropertyId(), params.id, { ifNoneMatch: req.headers.get("if-none-match") });
    if (!opened) return apiError("NOT_FOUND");
    if (opened.notModified) return new Response(null, { status: 304, headers: { ETag: opened.etag, "Cache-Control": CACHE } });

    const download = new URL(req.url).searchParams.get("download") === "1";
    const headers = new Headers({
      "Content-Type": opened.mime,
      "Content-Length": String(opened.size),
      "Content-Disposition": contentDisposition(opened.fileName, download ? "attachment" : "inline"),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": FILE_CSP,
      "Cache-Control": CACHE,
    });
    if (opened.etag) headers.set("ETag", opened.etag);
    return new Response(opened.body, { status: 200, headers });
  },
  { permission: "attachment.view" },
);
