/**
 * `Content-Disposition` for a stored bill/receipt: an ASCII-only quoted name
 * (non-ASCII → `_`, quotes/backslashes can't escape the quotes) plus the exact
 * name as RFC 5987 `filename*` so Bangla file names survive.
 */
export function contentDisposition(fileName: string, mode: "inline" | "attachment" = "inline") {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${mode}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
