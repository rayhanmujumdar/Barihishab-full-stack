// Providers only send from domains the account has verified, and nobody can
// verify a public mailbox domain. Catch that at startup instead of after five
// silent retries (fix-email-delivery D3).
const FREE_MAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
]);

export const SANDBOX_SENDER = "BariHisab <onboarding@resend.dev>";

/** The bare address inside `Name <address>` or a plain address. */
export function senderAddress(from: string): string {
  const angled = /<([^>]+)>/.exec(from);
  return (angled ? angled[1] : from).trim();
}

/** A human-readable problem with EMAIL_FROM, or null when it can be sent from. */
export function senderProblem(from: string, hasProviderKey: boolean): string | null {
  if (!hasProviderKey) return null;
  const domain = senderAddress(from).split("@").pop()?.toLowerCase() ?? "";
  if (!FREE_MAIL_DOMAINS.has(domain)) return null;
  return (
    `EMAIL_FROM uses ${domain}, which the email provider will refuse (the sender domain must be verified). ` +
    `Use an address on a domain verified in Resend, or "${SANDBOX_SENDER}" for local testing ` +
    `(the sandbox only delivers to the Resend account's own address).`
  );
}
