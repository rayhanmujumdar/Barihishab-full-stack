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
      // Hands-free auth for "Try it out": run POST /auth/login once and every
      // later request is authorized. The browser already sends the httpOnly
      // bh_at / bh_rt cookies (same origin), and bh_csrf is JS-readable by
      // design (double submit), so we echo it as X-CSRF-Token ourselves and
      // keep the "Available authorizations" modal in sync with the session.
      var SCHEMES = ["cookieAuth", "csrfHeader", "refreshCookie"];
      var HTTP_ONLY = "(httpOnly cookie, sent by the browser)";

      function readCookie(name) {
        var hit = document.cookie.split(";").map(function (c) { return c.trim(); })
          .find(function (c) { return c.indexOf(name + "=") === 0; });
        return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
      }

      function syncAuth() {
        if (!window.ui) return;
        var csrf = readCookie("bh_csrf");
        if (csrf) {
          ui.preauthorizeApiKey("cookieAuth", HTTP_ONLY);
          ui.preauthorizeApiKey("refreshCookie", HTTP_ONLY);
          ui.preauthorizeApiKey("csrfHeader", csrf);
        } else {
          ui.authActions.logout(SCHEMES);
        }
      }

      window.ui = SwaggerUIBundle({
        url: "${API_PREFIX}/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true,
        persistAuthorization: true,
        displayRequestDuration: true,
        tryItOutEnabled: true,
        requestInterceptor: function (req) {
          req.credentials = "same-origin";
          // Placeholder values must never reach the wire; the browser owns cookies.
          if (req.headers) delete req.headers.Cookie;
          var csrf = readCookie("bh_csrf");
          if (csrf && req.method && req.method.toUpperCase() !== "GET") {
            req.headers["X-CSRF-Token"] = csrf;
          }
          return req;
        },
        responseInterceptor: function (res) {
          // Login / refresh / logout rotate or clear cookies; mirror that.
          setTimeout(syncAuth, 0);
          return res;
        },
        onComplete: syncAuth,
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
