// Client-safe link vocabulary (G9). Server lookups live in ./links.
export const LINK_TYPES = ["ENTRY", "MONTH", "LEDGER", "LOAN", "REQUEST", "SHARE_SET"] as const;
export type LinkType = (typeof LINK_TYPES)[number];
export type LinkRef = { type: LinkType; id: string };

/** A linked item as a viewer sees it; `hidden` items show only their type. */
export type LinkItem = { type: LinkType; id: string; subject: string | null; date: string | null; amountPaisa: number | null; month: string | null; hidden: boolean };
export type LinkOption = LinkItem & { prefill: string };
