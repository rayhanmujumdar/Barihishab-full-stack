## Context

See proposal.md — Why. What already exists and is reused:

- **Home seam**: `lib/home/notices.ts` (`pinnedNotices`, `openComplaintsCount`) is read by `lib/home/dashboard.ts`, `lib/home/desk.ts` and the Home page `NoticesBlock`; `components/home/PinnedNotices.tsx` + `NoticeBody.tsx` already render the block (unread dot, urgent tag, Read more). Only the seam bodies change.
- **Requests** is the closest template: RSC page (`requirePagePermission`, sequential reads) → client view (`apiFetch` + `router.refresh()`), detail sheet driven by a search param, timeline from `audit_logs`, `notify.ts` building one outbox row per recipient inside the caller's transaction, nav badge cleared by an explicit `POST …/seen`, `visibleTo` pure rule + SQL mirror, `404` for invisible rows.
- **Attachments**: presign → `prepareAttachments` → `linkAttachments(tx, …, entityType)`; `mayView` in `attachment-service.ts` already branches on `entity_type` (`money_request`).
- **Email**: `enqueueEmail` (dedupe key), `renderEmail` switch, templates in `lib/email/templates/*`, worker in `lib/email/loop.ts`.
- **Close preview**: pure `closeChecks` in `lib/accounting/distribution.ts` returns `WarningCode[]`; `distribution-service.ts` adds per-warning detail; `CloseMonthDialog` renders `dist.warn.*`.
- **Nav**: `components/app/nav.ts` (`NAV_ITEMS`, `bottomNav`), badges computed in `app/[lang]/(app)/layout.tsx` and passed to `ShellNav`.
- **Entries** list/detail are client-fetched with TanStack Query (`qk.transactions.*`); Owners, Advances, Requests, Distribution and Reports pages are server-rendered.

Constraints: `/api/v1` + Swagger, `ok()/fail()`, `await connection()` in GETs, permission → zod → one transaction (data + audit + outbox), property scoping, never delete, design-system skill, `useDebouncedValue` (250 ms) for every search box, `next/image` for images, destructive actions confirm first.

## Goals / Non-Goals

**Goals:**
- Two small service modules (`lib/notices`, `lib/complaints`) with all rules in pure, 100 %-covered helpers.
- Visibility of Admin-only complaints enforced in exactly one rule, mirrored once in SQL, applied to every read path (list, counts, badges, questioned, links, files).
- No new scheduler, no notification table, no real-time channel.

**Non-Goals:**
- Rich-text editor or Markdown library; generic polymorphic "comments" framework; per-event email preferences; reminders (C9) and month-close notice template (N6).

## Decisions

### D1 — Tables
- `notices(id, property_id, title, body, priority NoticePriority, pinned bool, pin_until date?, published_at, created_by, edited_at?, archived_at?, archived_by?, last_reminded_on date?, updated_at)`; index `(property_id, archived_at, published_at desc)`.
- `notice_reads(notice_id, user_id, read_at)` PK `(notice_id, user_id)`; insert `ON CONFLICT DO NOTHING` keeps the first time.
- `complaints(id, property_id, title, body, visibility ComplaintVisibility(ALL|ADMIN), status ComplaintStatus, link_type ComplaintLinkType?, link_id uuid?, period_id uuid? FK periods, about_admin bool, reopened bool, closed_at?, resolution_note?, resolved_by?, resolved_at?, fix_type?, fix_id?, created_by, created_at, updated_at)`; CHECKs: `link_type` and `link_id` both null or both set (same for fix); indexes `(property_id, status)`, `(property_id, period_id)`, `(link_type, link_id)`. Column names follow main PRD §9.4 (`period_id`, `visibility`, `resolution_note`, `resolved_by`, `resolved_at`); `related_type/related_id` are named `link_type/link_id` to match the UI term.
- `complaint_comments(id, complaint_id, author_id, body, created_at, edited_at?, hidden_at?, hidden_by?, hidden_reason?)`; index `(complaint_id, created_at)`.
- `complaint_views(complaint_id, user_id, seen_at)` PK pair.
- `users.email_notices bool default true`.
- No-delete triggers (same function as the financial tables) on `notices`, `complaints`, `complaint_comments`.
*Alternative*: status-change rows in `complaint_comments` (kind = SYSTEM). Rejected — the audit log already records every status change with actor and reason (D6).

### D2 — Polymorphic link without FKs, label resolved at read time
`link_type + link_id` instead of six nullable FKs. Every linkable table already refuses deletes by trigger (house transactions, ledger, loans, requests, share sets) and the app never deletes periods, so a link can't dangle; the write path validates existence, property and viewer visibility. Labels ("{date} · {category} · ৳X") are computed when read by a per-type batch resolver (`lib/complaints/links.ts`, one query per type present on the page) so a corrected entry shows its current figures. `period_id` is denormalised at write time (MONTH → the period, ENTRY/LEDGER → their `period_id`) so month filters, month notes and the close warning are one indexed count.
*Alternative*: six FKs — more columns, six CHECKs, same validation code anyway.

### D3 — Pure rules (`lib/complaints/rules.ts`, `lib/notices/rules.ts`, `lib/notices/markup.ts`)
- complaints: `canSee(c, viewer)`, `nextStatus(status, action)` / transition table, `canReopen(c, now)` (RESOLVED|REJECTED, not reopened, ≤ 14 days), `canEditComment(comment, viewer, now)` (author, ≤ 15 min, not hidden), `isLive`, `sortRank` (OPEN → IN_REVIEW → closed), `prefillTitle(item, month, locale)`, `isUnseen(lastSeen, ownLastComment, createdAt, otherCommentTimes)`, `resolutionAudience(c)`.
- notices: `isPinnedOn(n, dhakaDate)`, `orderNotices`, `canRemind(n, dhakaDate)`.
- markup: `parseNotice(text)` → tokens (paragraph, bullet list, bold, link with http/https/mailto only); `renderNoticeHtml(tokens)` for email (escapes everything else). The React renderer maps tokens to elements — never `dangerouslySetInnerHTML`.
All three files carry 100 % coverage like `lib/accounting/*`.

### D4 — Pin until computed on read
Effective pin = `pinned AND archived_at IS NULL AND (pin_until IS NULL OR pin_until >= today_dhaka)`. No job flips the flag, so "auto-unpin" is exact at midnight Asia/Dhaka and needs no scheduler. `pinned` stays true in the row (an edit can extend the date).

### D5 — Read counts against current active members
`memberCount` = active members now; `readCount` = reads joined to users still ACTIVE with SUPER_ADMIN/OWNER. One grouped query for the page. A deactivated member drops out of both numbers, so "n of m" never exceeds m. Publishing inserts the author's read (N2). Opening via `?notice=`, **Read more**, **Mark as read** and Home's Read more all call `POST /notices/{id}/read`; GETs never write (same rule as requests' seen flag).

### D6 — Thread = comments + audit status lines
Status lines come from `audit_logs` rows with `entity_type = 'complaint'` and actions `complaint.status_changed | withdrawn | reopened | published` (actor, `after.status`, `reason` = note/explanation), merged with comments by time in the detail service. Resolution block reads `resolution_note/resolved_by/resolved_at` (kept on the row for list/email use; cleared on reopen, history stays in the thread).

### D7 — Visibility in one place
`canSee` (pure) + `visibleComplaintWhere(viewer)` (Prisma `where`: `OR [{visibility: ALL}, {createdById: viewer}]` unless `complaint.view.all`). Every read path (list, detail, comments, actions, counts, questioned, month notes, badge, files) goes through one of them; invisible → `404`. The desk count (`openComplaintsCount`) is admin-only and intentionally counts all.

### D8 — Seen tracking and the nav badge
`complaint_views` upserted by `POST /complaints/{id}/seen` (drawer calls it when `unseen`). Badge = unread notices + complaints where the viewer takes part (author or has a comment) and a non-hidden comment by someone else is newer than `max(seen_at, own last comment, created_at if author)`. Both counts are single SQL queries run in the layout alongside the existing badges.

### D9 — Questioned markers
One service `questionedFor(propertyId, viewer, type, ids)` → `Map<id, complaintId>` (newest live visible complaint). Server pages (Owners statement, loan/request detail, share timeline, Distribution) call it directly; the Entries view (client) calls `GET /complaints/questioned?type=ENTRY&ids=…` with TanStack Query keyed by the visible page's ids. No change to other modules' API contracts.

### D10 — Emails
Two templates (`NOTICE`, `COMPLAINT_UPDATE`) with an `event` field, like `REQUEST_UPDATE`. `lib/complaints/notify.ts` and `lib/notices/notify.ts` share an `activeMembers(tx, propertyId)` helper (moved next to `activeAdmins`). Opt-out applied in the recipient query (`email_notices = true`) only for opt-out-able events. Dedupe keys: `notice:{id}:{event}:{stamp}:{user}` (stamp = edited time or Dhaka date for reminders), `complaint:{id}:{event}:{stamp}:{user}`. Notice publish emails go to every active member including the author: the PRD's reach line counts all active members ("Emails 4 active members" in a 4-member house), and the author's copy confirms delivery.

### D11 — Routes and UI composition
- `app/[lang]/(app)/notices/page.tsx`: RSC; loads notices, complaints list, selected complaint detail (`?complaint=`), raise pre-fill (`?link=`) and member count with sequential reads; renders `NoticesView` (client). Mutations via `apiFetch` → toast → `router.refresh()`. Drawer = `Sheet` driven by the search param (like `?request=` on Requests).
- `app/[lang]/(app)/complaints/[id]/page.tsx`: `redirect()` to `/notices?complaint=id` (main PRD S10 path, email link target).
- Link picker: client, TanStack Query on `GET /complaints/links`, input through `useDebouncedValue`.
- Components in `components/notices/*` (NoticesView, NoticeCard, NoticeDialog, WhoReadSheet, ComplaintCard, ComplaintFormDialog, LinkPicker, ComplaintDrawer, StatusPanel, Thread, `NoticeText` renderer) plus a shared `QuestionedBadge` and `RaiseObjectionButton` in `components/complaints/`.
- `NoticeBody` on Home switches to `NoticeText` and posts the read on expand.

### D12 — Permissions
`notice.view`, `complaint.view`, `complaint.create` (Owner + Super Admin); `notice.manage`, `complaint.view.all`, `complaint.decide` (Super Admin). Author-only actions (withdraw, reopen, publish, edit comment) are ownership checks in the service. Presign anyOf gains `notice.manage`, `complaint.create`.

### D13 — Error codes
New: `NOTICE_ARCHIVED` (409), `REMINDER_ALREADY_SENT` (409), `NOT_URGENT` (409), `INVALID_COMPLAINT_STATUS` (409), `COMPLAINT_CLOSED` (409), `REOPEN_WINDOW_PASSED` (409), `EDIT_WINDOW_PASSED` (409), with PRD §10 texts in en + bn.

### D14 — Concurrency
Status changes, withdraw, reopen, publish and comment writes lock the complaint row (`SELECT … FOR UPDATE`) and re-check the transition inside the transaction, so two decisions can't both win and a comment can't land after a close.

## Deviations from the PRD

- **List order** (C1 vs §12.3): C1 says Open + In review oldest first; §12.3 shows the Open 15 Oct item above the In review 4 Oct one. Implemented as OPEN (oldest first) → IN_REVIEW (oldest first) → closed (newest first), which satisfies both examples and still surfaces the longest-waiting untouched complaint first.
- **"About Admin's own entry"** (G14): in v1 the Super Admin records almost every entry, so "entry they created" would flag nearly everything. Interpreted as "the money concerns the Super Admin personally": the linked ledger entry, loan or request belongs to an owner whose user is a Super Admin, or the linked expense's beneficiary is such an owner.
- **Comment emails** (§11 "New comment"): §14 puts comment-reply emails (with digest) in Later; Core signals new comments in-app only (badge + unread dot).
- **Hidden comments**: the body is withheld from every viewer, the Super Admin included; the original text is kept in the `complaint.comment_hidden` audit row.
- **Resolution of a private complaint about Admin's own entry** (G14, Rule 13) is emailed to all members as the PRD requires, but without a link (they can't open it).
- **Making a complaint public** (G15) sends the `NEW` email to members, since they would otherwise never learn it exists.
- **Notice detail** (G5): no separate notice page; "opening" = `?notice={id}` (email/Home link) or **Read more**, both of which record the read.

## Risks / Trade-offs

- [Polymorphic link has no DB FK] → linkable tables are no-delete; write-time validation + integration tests per type.
- [Badge queries on every page load] → two indexed counts per request; the house has < 10 members; reads are sequential like the existing badges.
- [Admin-only leakage through a new read path added later] → all paths use `visibleComplaintWhere`/`canSee`; an integration test asserts 404/absence for list, detail, counts, questioned, links, month notes and files.
- [Email volume on busy threads] → no comment emails in Core; reminders limited to once per notice per Dhaka day.
- [Owner bottom bar change breaks existing tests] → update `components/app/shell.test.tsx` and any e2e that asserts the Owner bar.

## Migration Plan

One additive Prisma migration (`notices_complaints`): enums, five tables, `users.email_notices`, `EmailTemplate` values, CHECKs, indexes, no-delete triggers. No backfill. Apply to `barihishab_test` during development; the shared dev DB needs `prisma migrate deploy` after the user approves (until then `/notices` and Home error on dev). Rollback: the app tolerates the tables being empty; drop is a manual down migration (no data in other tables depends on them).
