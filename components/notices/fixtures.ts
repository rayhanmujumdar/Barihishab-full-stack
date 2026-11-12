// PRD §2.2 sample data for component tests.
import type { ComplaintDetailDto, ComplaintDto, NoticeDto, NoticesPageData } from "./types";

export const notice = (over: Partial<NoticeDto> = {}): NoticeDto => ({
  id: "n-water",
  title: "Water tank cleaning — Sunday 26 Oct",
  body: "Supply will be off from **10 am to 2 pm**.\n- Store water the night before\n- Close the roof door\n- Keep the pump off\nCleaners arrive at 9 am.\nSee [schedule](https://example.com/s)",
  priority: "URGENT",
  pinned: true,
  pinUntil: "2026-10-26",
  publishedAt: "2026-10-20T04:00:00.000Z",
  authorName: "Rayhan Ahmed",
  editedAt: null,
  archivedAt: null,
  attachments: [],
  readCount: 2,
  memberCount: 4,
  read: false,
  remindedToday: false,
  ...over,
});

export const complaint = (over: Partial<ComplaintDto> = {}): ComplaintDto => ({
  id: "c-elec",
  title: "September electricity bill looks high",
  status: "IN_REVIEW",
  visibility: "ALL",
  reopened: false,
  aboutAdmin: false,
  authorId: "u-farzana",
  authorName: "Farzana Haque",
  mine: false,
  createdAt: "2026-10-04T06:00:00.000Z",
  closedAt: null,
  link: { type: "ENTRY", id: "t-elec", subject: "Electricity", date: "2026-09-28", amountPaisa: 710000, month: "2026-09", hidden: false },
  commentCount: 2,
  unseen: false,
  ...over,
});

export const detail = (over: Partial<ComplaintDetailDto> = {}): ComplaintDetailDto => ({
  ...complaint(),
  body: "In March it was ৳4,600. Was the reading checked?",
  attachments: [],
  resolution: null,
  thread: [
    { kind: "comment", id: "cm-1", authorId: "u-rayhan", authorName: "Rayhan Ahmed", isAdmin: true, body: "Caretaker AC ran all month.", hiddenReason: null, createdAt: "2026-10-04T06:00:00.000Z", editedAt: null, attachments: [], editableUntil: null },
    { kind: "status", id: "a1", actorName: "Rayhan Ahmed", status: "IN_REVIEW", note: null, at: "2026-10-04T06:05:00.000Z" },
    { kind: "comment", id: "cm-2", authorId: "u-tanvir", authorName: "Tanvir Ahmed", isAdmin: false, body: "Confirmed — the AC was on.", hiddenReason: null, createdAt: "2026-10-05T06:00:00.000Z", editedAt: null, attachments: [], editableUntil: null },
  ],
  actions: { comment: true, withdraw: false, reopen: false, publish: false, decide: false, hide: false },
  ...over,
});

export const page = (over: Partial<NoticesPageData> = {}): NoticesPageData => ({
  houseName: "Ahmed Villa",
  tab: "notices",
  perms: { manage: false, create: true, decide: false },
  notices: { items: [notice(), notice({ id: "n-tax", title: "Holding tax — next instalment due 15 Jan", priority: "NORMAL", pinUntil: null, read: true, body: "Around ৳18,500." })], more: false, activeMembers: 4, unread: 1, reachEmail: null },
  archived: false,
  focusNotice: null,
  complaints: { items: [complaint()], more: false },
  filter: "all",
  month: "",
  months: ["2026-10", "2026-09"],
  detail: null,
  raise: { open: false, link: null },
  newNotice: false,
  ...over,
});

export const adminPage = (over: Partial<NoticesPageData> = {}) =>
  page({ perms: { manage: true, create: true, decide: true }, notices: { ...page().notices, reachEmail: 3 }, ...over });
