import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Bills live in a private S3-compatible bucket: browsers PUT uploads straight
// to it (ATT-01), so only connect-src needs the storage origin. Viewing goes
// through the same-origin proxy /api/v1/attachments/:id/file (ATT-02), so
// img-src stays 'self' and a storage URL can't load on our pages.
// headers() is resolved at build time, so S3_PUBLIC_ENDPOINT / S3_ENDPOINT
// must be set for `next build` — changing them later needs a rebuild.
const storageEndpoint = process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT;
const storageOrigin = storageEndpoint ? ` ${new URL(storageEndpoint).origin}` : "";
if (!storageEndpoint && !isDev) console.warn("next.config: S3_ENDPOINT is not set — bill uploads will be blocked by the CSP.");

// Auth PRD §8 Transport. Swagger UI (/api/v1/docs) loads pinned CDN assets
// with SRI, so it is excluded from this CSP (dev-only unless API_DOCS_ENABLED).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${storageOrigin}${isDev ? " ws: wss:" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // app/global-not-found.tsx: the app has a /[lang] root layout, not app/layout.tsx.
  experimental: { globalNotFound: true },
  // Native argon2 binding must stay external to the server bundle.
  serverExternalPackages: ["@node-rs/argon2"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The bill/receipt file proxy sets its own, stricter CSP (no scripts at all).
      { source: "/((?!api/v1/docs|api/v1/attachments/[^/]+/file$).*)", headers: [{ key: "Content-Security-Policy", value: csp }] },
    ];
  },
};

export default nextConfig;
