// Same-origin URL of a stored bill/receipt (ATT-02). Pure, so the server
// (metadata endpoint) and the browser (thumbnails, lightbox) build it the same
// way; the browser never sees a storage URL.
export function attachmentFileUrl(id: string, opts: { download?: boolean } = {}): string {
  return `/api/v1/attachments/${encodeURIComponent(id)}/file${opts.download ? "?download=1" : ""}`;
}
