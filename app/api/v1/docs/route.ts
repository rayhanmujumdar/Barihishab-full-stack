import { connection } from "next/server";
import { API_PREFIX, isApiDocsEnabled } from "@/lib/api/constants";
import { fail } from "@/lib/api/response";

// Swagger UI shell. Assets come from a pinned CDN build with SRI hashes,
// which avoids bundling swagger-ui-react (large, React-19 peer friction).
const SWAGGER_UI_VERSION = "5.34.0";
const CDN = `https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}`;
// Regenerate when bumping the version:
//   curl -sL $CDN/<file> | openssl dgst -sha384 -binary | openssl base64 -A
const CSS_SRI = "sha384-4c3vsE5f+trhFyHrFrLM1fFGUn531NIaC7dcqEWIJdoRQJ5CkJbSuSCwXLpaS1KF";
const JS_SRI = "sha384-9Td7MKiIr2S83E1kZyyVi8KdJw/S8CpAvu0llLyMeg0xq/hDGiZJfVn0fV4llCmK";

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Barihishab API Docs</title>
    <link rel="stylesheet" href="${CDN}/swagger-ui.css" integrity="${CSS_SRI}" crossorigin="anonymous" />
    <style>body { margin: 0; } .swagger-ui .topbar { display: none; }</style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="${CDN}/swagger-ui-bundle.js" integrity="${JS_SRI}" crossorigin="anonymous"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "${API_PREFIX}/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true,
        persistAuthorization: true,
        displayRequestDuration: true,
        tryItOutEnabled: true,
      });
    </script>
  </body>
</html>`;

export async function GET() {
  // Read the env flag per request, not at build time.
  await connection();
  if (!isApiDocsEnabled()) {
    return fail({ status: 404, code: "NOT_FOUND", message: "Not found" });
  }

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
