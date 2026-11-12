## 1. Setup

- [x] 1.1 Run the full suite once for a green baseline (`pnpm test`, `pnpm test:int`, `pnpm test:e2e`) and note any pre-existing failures
- [x] 1.2 Read `node_modules/next/dist/docs/` for route handlers (Promise `params`), page `searchParams`, `redirect()`, `connection()` + Cache Components; read `.agents/skills/barihisab-design-system/SKILL.md`, `.agents/skills/tdd`, `.agents/skills/tanstack-query-best-practices`; re-read `docs/notices_and_complaints_PRD.md` §2–§13

## 2. Permissions, error codes, audit actions (`rbac`, design D12, D13)

- [x] 2.1 Write failing tests in `lib/permissions.test.ts`: Super Admin has 51 keys; Owner has exactly 15 (adds `notice.view`, `complaint.view`, `complaint.create`); Owner lacks `notice.manage`, `complaint.view.all`, `complaint.decide`
- [x] 2.2 Add the six keys to `lib/permissions.ts`; make 2.1 pass
- [x] 2.3 Write failing tests in `lib/api/errors.test.ts` for `NOTICE_ARCHIVED`, `REMINDER_ALREADY_SENT`, `NOT_URGENT`, `INVALID_COMPLAINT_STATUS`, `COMPLAINT_CLOSED`, `REOPEN_WINDOW_PASSED`, `EDIT_WINDOW_PASSED` (409, PRD §10 texts, en + bn)
- [x] 2.4 Add the error codes; add non-financial audit actions `notice.published|edited|pinned|unpinned|archived|reminded` and `complaint.raised|status_changed|withdrawn|reopened|published|comment_added|comment_edited|comment_hidden` to `lib/audit.ts`; make 2.3 pass

## 3. Pure modules (design D3) — 100 % coverage

- [x] 3.1 Write failing tests `lib/notices/markup.test.ts`: bold, `- ` bullets, `[t](https://…)`/`mailto:` links, `javascript:`/`data:` links stay text, `<script>` stays text, nested/unclosed `**`, empty lines → paragraphs; `renderNoticeHtml` escapes `<`, `>`, `&`, quotes
- [x] 3.2 Implement `lib/notices/markup.ts` (`parseNotice`, `renderNoticeHtml`)
- [x] 3.3 Write failing tests `lib/notices/rules.test.ts`: `isPinnedOn` (no date, on the date 26 Oct, day after 27 Oct, archived), `orderNotices` (§12.1 order), `canRemind` (urgent, normal, archived, already today, yesterday)
- [x] 3.4 Implement `lib/notices/rules.ts`
- [x] 3.5 Write failing tests `lib/complaints/rules.test.ts`: transition table for every status × action (IN_REVIEW, RESOLVE, REJECT, WITHDRAW, REOPEN, PUBLISH); `canSee` (ALL vs ADMIN × author / other owner / view.all); `canReopen` (day 14 ok, day 15 refused, already reopened, WITHDRAWN); `canEditComment` (14:59 ok, 15:01 refused, other author, hidden); `sortRank`/sort (§12.3 order); `prefillTitle` (en + bn: "Question about Electricity · September 2026"); `isUnseen` (author never opened, own later comment, hidden comment ignored); `resolutionAudience` (ALL, ADMIN, ADMIN + aboutAdmin)
- [x] 3.6 Implement `lib/complaints/rules.ts`; confirm 100 % coverage of the three files with `pnpm test:coverage`

## 4. Data model and migration (design D1)

- [x] 4.1 Write failing tests `tests/integration/db/notices-complaints-schema.test.ts`: DELETE refused on `notices`, `complaints`, `complaint_comments`; `link_type` without `link_id` refused; duplicate `notice_reads (notice_id, user_id)` refused; `users.email_notices` defaults true
- [x] 4.2 Prisma schema: enums `NoticePriority`, `ComplaintStatus`, `ComplaintVisibility`, `ComplaintLinkType`; models `Notice`, `NoticeRead`, `Complaint`, `ComplaintComment`, `ComplaintView` with relations; `User.emailNotices`; `EmailTemplate` += `NOTICE`, `COMPLAINT_UPDATE`
- [x] 4.3 `prisma migrate dev --create-only --name notices_complaints`; hand-add CHECKs, indexes and no-delete triggers (reuse the existing trigger function); apply to `barihishab_test`; `prisma generate`
- [x] 4.4 Add the new tables to the `tests/helpers/db.ts` TRUNCATE list; add `tests/helpers/notices.ts` (PRD sample world on top of `requestsWorld`: Rayhan admin, Farzana, Tanvir, Nasrin logins, Sabrina invited; route wrappers; `createNotice`, `raiseComplaint` factories); make 4.1 pass

## 5. Notices service and API (`notices`)

- [x] 5.1 Write failing tests `tests/integration/api/notices.test.ts`: list order + `read`/`readCount`/`memberCount` for §12.1 on 22 Oct and 27 Oct (clock); archived filter; paging; publish 201 (author read, audit, outbox: urgent ignores opt-out → 4, normal → 3, `[Urgent]` flag); validation 422s ("Add a title.", "Write the message.", >120, >3,000, past pinUntil, 6 files); Owner 403 on create/edit/archive/reads/remind; edit sets `editedAt`, pin-only doesn't; `emailChange` queues EDITED; archived → 409 `NOTICE_ARCHIVED`; read idempotent keeps first time; read-all; who-has-read lists; remind urgent → only unread, second same day 409 `REMINDER_ALREADY_SENT`, normal 409 `NOT_URGENT`; INVITED/INACTIVE never counted or emailed
- [x] 5.2 Implement `lib/notices/notice-service.ts` (create/edit/archive/read/readAll/remind, attachments via `prepareAttachments` + `linkAttachments(…, "notice")`), `lib/notices/notice-read.ts` (list with counts, who-has-read, unread count, `pinnedForHome`), `lib/notices/notify.ts`; move/add `activeMembers` next to `activeAdmins` (opt-out filter param)
- [x] 5.3 Routes + `schema.ts` (zod `.meta({id})`, `registry.registerPath`): `app/api/v1/notices/route.ts` (GET, POST), `[id]/route.ts` (PATCH), `[id]/archive`, `[id]/read`, `read-all`, `[id]/reads`, `[id]/remind`; GETs call `await connection()`; make 5.1 pass

## 6. Complaints service and API — raise, list, detail (`complaints`)

- [x] 6.1 Write failing tests `tests/integration/api/complaints.test.ts`: raise 201 for each link type (ENTRY, MONTH, LEDGER, LOAN, REQUEST, SHARE_SET) with correct `period_id`; invalid/foreign/invisible link → 422; body < 10 → 422 PRD text; 6 files → 422; ALL → `NEW` emails to other members without body, opt-out honoured; ADMIN → `NEW_PRIVATE` to admins only; aboutAdmin flag (Rayhan's loan, ledger entry, request, grant beneficiary; plain expense not flagged); list filters all/open/in_review/closed/mine/month, §12.3 order, paging, counts exclude hidden comments; detail thread merges comments + status lines; link the viewer can't open → type only
- [x] 6.2 Write failing tests `tests/integration/api/complaints-visibility.test.ts`: Farzana gets 404 for Tanvir's ADMIN complaint on detail, comments, status, withdraw, reopen, publish, seen and its files; absent from her list, `mine`, month count, questioned, badge; Rayhan sees it
- [x] 6.3 Implement `lib/complaints/visibility.ts` (`visibleComplaintWhere`), `lib/complaints/links.ts` (validate + batch label resolver + `period_id` + aboutAdmin + link options search per type honouring each section's visibility), `lib/complaints/complaint-service.ts` (raise), `lib/complaints/complaint-read.ts` (list, detail, thread from comments + `audit_logs`), `lib/complaints/notify.ts`
- [x] 6.4 Routes + schemas: `app/api/v1/complaints/route.ts` (GET, POST), `[id]/route.ts` (GET), `links/route.ts` (GET), `links/[type]/[id]/route.ts` (GET); make 6.1 and the raise/list/detail parts of 6.2 pass

## 7. Complaints — status, withdraw, reopen, publish, comments, seen, questioned

- [x] 7.1 Write failing tests `tests/integration/api/complaints-actions.test.ts`: IN_REVIEW with/without note (complainant emailed, opt-out honoured); RESOLVE/REJECT without explanation → 422 PRD text; resolve with fix link; RESOLVED emails complainant + all members for ALL, complainant only for plain ADMIN, all members without link for ADMIN + aboutAdmin; actor never emailed; Owner 403; invalid transitions 409; concurrent resolves → one 200 one 409; withdraw by author only (other owner 403), closed → 409, admins emailed; reopen day 3 ok with comment, blank comment 422 "Say why it isn't resolved.", day 15 → 409 `REOPEN_WINDOW_PASSED`, second reopen 409; publish ADMIN→ALL by author only, `NEW` emails, no way back; comment add (live only, closed → 409 `COMPLAINT_CLOSED`, 4 files 422), edit by author ≤ 15 min, 16 min → 409 `EDIT_WINDOW_PASSED`, edit by other 403; hide by admin with reason (body withheld for all, audit keeps original, file 404), Owner hide 403; seen clears `unseen`; questioned endpoint (max 200 ids, live only, visibility); month count; every action writes its audit row
- [x] 7.2 Implement the actions in `lib/complaints/complaint-service.ts` (row lock `FOR UPDATE`, transition via rules, audit + outbox in one transaction), `lib/complaints/comment-service.ts`, `lib/complaints/seen.ts` (`markSeen`, `unseenCount`), `lib/complaints/questioned.ts` (`questionedFor`, `openCountForMonth`)
- [x] 7.3 Routes + schemas: `[id]/status` (PATCH), `[id]/withdraw`, `[id]/reopen`, `[id]/publish`, `[id]/seen`, `[id]/comments` (POST), `[id]/comments/[commentId]` (PATCH), `[id]/comments/[commentId]/hide`, `questioned` (GET); make 7.1 and the rest of 6.2 pass

## 8. Attachments, email templates, opt-out, close warning, Home seam

- [x] 8.1 Write failing tests in `tests/integration/api/attachments.test.ts` (or a new `notice-complaint-attachments.test.ts`): Owner presign allowed via `complaint.create`; non-admin can't link someone else's upload; notice file visible to members; ADMIN complaint file 404 for others; hidden comment file 404
- [x] 8.2 Extend `presign` anyOf, `AttachmentEntity`, and `mayView` in `lib/attachments/attachment-service.ts`; make 8.1 pass
- [x] 8.3 Write failing tests in `lib/email/templates/templates.test.ts`: NOTICE (en/bn, `[Urgent]` subject, escaped HTML, link `/{locale}/notices?notice={id}`), COMPLAINT_UPDATE (each event, no body text, no link when flag off, explanation on RESOLVED/REJECTED, Bangla digits)
- [x] 8.4 Add payload types to `lib/email/outbox.ts`, `lib/email/templates/{notice,complaint-update}.ts`, cases in `lib/email/render.ts`; make 8.3 pass
- [x] 8.5 Write failing tests in `tests/integration/api/me.test.ts`: `PATCH /me { emailNotices:false }` 200 and reflected in `GET /me`; non-boolean 422
- [x] 8.6 Add `emailNotices` to the me schema/DTO/service; make 8.5 pass
- [x] 8.7 Write failing tests: `lib/accounting/distribution.test.ts` (`OPEN_COMPLAINTS` warning when count > 0, never affects `canClose`) and `tests/integration/api/period-close.test.ts` (close-preview carries `{ code: "OPEN_COMPLAINTS", count }`, close still succeeds)
- [x] 8.8 Add `openComplaints` input + `OPEN_COMPLAINTS` code to `closeChecks`, wire the count in `lib/distribution/distribution-service.ts`, update the close-preview schema; make 8.7 pass
- [x] 8.9 Update `tests/integration/home/*` / `dashboard.test.ts`: pinned notices (max 3, pin-until expiry, archived gone, unread per viewer) and `desk.openComplaints` = OPEN + IN_REVIEW (incl. ADMIN); replace the bodies of `lib/home/notices.ts` with calls into `lib/notices/notice-read.ts` and `lib/complaints`; make them pass

## 9. Swagger

- [x] 9.1 Import every new `schema.ts` (notices, complaints and sub-routes) in `app/api/v1/openapi.ts`; extend `tests/integration/api/openapi.test.ts` to assert all new paths; verify `GET /api/v1/openapi.json` lists `/notices…` and `/complaints…` on the running dev server

## 10. Navigation and badge (`app-shell`)

- [x] 10.1 Write failing tests in `components/app/shell.test.tsx`: Notices item (MegaphoneIcon, after Requests) for `notice.view`; badge = unread notices + unseen complaints, hidden at 0; Owner bottom bar Home · Accounts · Requests · Notices · More with Income & expenses and Owners in More; Super Admin bar unchanged
- [x] 10.2 Add the item, `BadgeKey` `notices`, update `bottomNav` owner list; compute the badge in `app/[lang]/(app)/layout.tsx` (`unreadNoticeCount` + `unseenCount`) and pass to `ShellNav`; i18n `nav.notices`; make 10.1 pass

## 11. Notices screen UI (`notices-complaints-ui`)

- [x] 11.1 Add all PRD §10 messages and UI labels to `lib/i18n/en.ts` and `lib/i18n/bn.ts` (notices.*, complaints.*, status tags, toasts, empty states)
- [x] 11.2 Write failing component tests `components/notices/notices.test.tsx`: NoticeText renders bold/bullets/safe links and escapes the rest; NoticeCard tags (Urgent/Pinned/New/Edited), "{n} of {m} read", Read more posts the read, Mark as read; ⋯ menu only for managers; Mark all as read only when unread; empty states; NoticeDialog reach line (+ urgent suffix), Preview, inline errors, Email the change default on for urgent; WhoReadSheet lists + Remind unread toast/disabled after today
- [x] 11.3 Implement `components/notices/{NoticesView,NoticeCard,NoticeText,NoticeDialog,WhoReadSheet}.tsx` with shadcn primitives and the design-system tokens; Archive behind the confirmation dialog
- [x] 11.4 Write failing component tests `components/notices/complaints.test.tsx`: ComplaintCard tags/chip/count/unread dot; filter chips + month filter + filtered empty text; ComplaintFormDialog validation texts, visibility help line, LinkPicker tabs + debounced search + pre-fill title, success toasts; ComplaintDrawer: link card, "Admin is looking into it", resolution block, thread with Admin tag/edited/hidden/status lines, comment box only when live, Edit within 15 min, Hide (admin), Withdraw/Make visible/Reopen with confirmations and errors, StatusPanel explanation error and toast; seen called when `unseen`
- [x] 11.5 Implement `components/notices/{ComplaintsColumn,ComplaintCard,ComplaintFormDialog,LinkPicker,ComplaintDrawer,Thread,StatusPanel}.tsx` (Sheet drawer full screen < 860px; picker via TanStack Query + `useDebouncedValue`)
- [x] 11.6 Pages: `app/[lang]/(app)/notices/page.tsx` (RSC, `requirePagePermission("notice.view")`, Suspense + skeleton from `components/skeletons`, search params `notice|archived|new|complaint|raise|link|filter|month`), `generateMetadata` (`meta.notices`), `app/[lang]/(app)/complaints/[id]/page.tsx` redirect; add a `NoticesSkeleton` to `components/skeletons/pages`
- [x] 11.7 Home: `NoticeBody` uses `NoticeText`, posts the read on Read more and refreshes; **All notices →** always shown; update `components/home/home.test.tsx`

## 12. Questioned badges and Raise an objection (`notices-complaints-ui`, design D9)

- [x] 12.1 Write failing tests for shared `components/complaints/{QuestionedBadge,RaiseObjectionButton}.tsx` (link targets `/notices?complaint=` and `/notices?raise=1&link=TYPE:id`, hidden without `complaint.create`)
- [x] 12.2 Entries: questioned query (`qk.complaints.questioned`) for the visible page in `EntriesView`; badge on rows; badge + Raise an objection in `DetailDrawer`; update `components/entries/*.test.tsx`
- [x] 12.3 Owners: badge + action on payment/advance rows of the statement (`StatementTable`) and on share-timeline entries (`OwnersView`); server page passes the questioned map; update owners tests
- [x] 12.4 Advances & Loans: badge + action in `LoanDetailSheet`; Requests: badge + action in `RequestDetailSheet`; update their tests
- [x] 12.5 Distribution: Raise an objection (MONTH) in the month header, note "{n} open complaint(s) about {Month}." linking to `/notices?filter=open&month=`; `CloseMonthDialog` renders the `OPEN_COMPLAINTS` warning; Monthly report shows the same note; update distribution/reports tests

## 13. Profile toggle (`self-profile`)

- [x] 13.1 Write a failing test in the `/me` screen tests for the "Notices & complaints emails" switch (reflects `emailNotices`, PATCHes on change, toast)
- [x] 13.2 Add the switch to `components/me/MeScreen.tsx`; make 13.1 pass

## 14. End-to-end (Playwright)

- [x] 14.1 Write `e2e/notices-complaints.spec.ts` (sorts after `income-expenses`, before `owners`; calls `resetRateLimits()`; ends state-neutral — its notices are unpinned and archived, its complaints resolved or withdrawn): (a) Super Admin publishes an urgent pinned notice → toast with count; Owner sees it on Home with unread dot and the nav badge, Read more clears both; Super Admin opens Who has read and reminds; edit shows Edited; archive removes it from list and Home and it appears under Archived notices. (b) Owner opens an Electricity entry → Raise an objection → pre-filled title → Post → Questioned badge on the entry → Super Admin sets In review, comments, tries Resolve with no explanation (error), resolves → badge gone, Owner sees resolution; Owner reopens with a comment. (c) Owner posts an Admin-only complaint → a second Owner can't see it in the list nor open `/complaints/{id}` (not found); complainant makes it public → visible. (d) Withdraw with confirmation. (e) 360px: columns stack, drawer full screen, no horizontal scroll; `/bn/notices` shows Bangla labels
- [x] 14.2 Update existing e2e expectations touched by the change (Owner bottom bar in `summary-home.spec.ts` if asserted; desk Open complaints tile); add `["notices", "/notices"]` to `e2e/visual.spec.ts` and refresh its snapshots

## 15. Verification

- [x] 15.1 `pnpm lint`, `pnpm typecheck` (tsc), `pnpm test`, `pnpm test:int`, `pnpm build`, `pnpm test:e2e` all green; pure modules at 100 %
- [x] 15.2 Manual check on the running dev server (after dev DB migration approval): en + bn, 1280px and 360px, Swagger shows the new endpoints, outbox rows look right (`pnpm email:test` not needed); screenshots saved under `.context/`
- [x] 15.3 `openspec validate add-notices-complaints --strict`; tick tasks; ask the user before migrating the shared dev DB, committing or merging
