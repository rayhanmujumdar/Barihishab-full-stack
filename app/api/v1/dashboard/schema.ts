import { z } from "zod";
import { apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { MonthKeySchema, readErrors } from "@/lib/api/money-schemas";
import { cookieAuthRead } from "@/lib/api/schemas";
import { registry } from "../registry";

const paisa = z.number().int();
const day = z.iso.date();
const unit = z.object({ name: z.string(), tenantName: z.string().nullable() });

const MeSchema = z
  .object({
    ownerId: z.uuid(),
    balancePaisa: paisa,
    balanceLabel: z.enum(["OWED", "ADVANCE", "SETTLED"]),
    sharePercent: z.number().nullable().meta({ description: "Share % in force for the Home month; null without units" }),
    entitlementPreviewPaisa: paisa.nullable().meta({ description: "Preview entitlement for an open month; null when closed or no share" }),
    receivedPaisa: paisa,
    advancesPaisa: paisa,
    loanOutstandingPaisa: paisa,
    loan: z
      .object({ number: z.number().int(), outstandingPaisa: paisa, nextDeductionPaisa: paisa.nullable(), nextDeductionMonth: MonthKeySchema.nullable() })
      .nullable()
      .meta({ description: "Active loan for the hero's loan line (G14)" }),
  })
  .meta({ id: "HomeMe", description: "The viewer's own figures (F2, F3) — only when linked to an owner" });

const MyRequestSchema = z
  .object({
    id: z.uuid(),
    type: z.enum(["ADVANCE", "LOAN", "GRANT"]),
    status: z.enum(["PENDING", "APPROVED", "REJECTED", "DISBURSED"]),
    amountRequestedPaisa: paisa,
    amountApprovedPaisa: paisa.nullable(),
    once: z.boolean().meta({ description: "A decided request shown once until the owner opens Requests" }),
  })
  .meta({ id: "HomeMyRequest", description: "F4 My request strip" });

const ReconciliationSchema = z
  .object({
    status: z.enum(["BALANCED", "CHECK"]),
    expectedPaisa: paisa,
    mismatchPaisa: paisa.meta({ description: "fund − expected" }),
    parts: z.object({
      fundPaisa: paisa,
      ownerBalancesPaisa: paisa,
      reservePaisa: paisa,
      openNetPaisa: paisa,
      deficitCarriedPaisa: paisa,
      loansOutstandingPaisa: paisa,
    }),
  })
  .meta({ id: "HomeReconciliation", description: "Fund = owner balances + reserve + open month net − deficit carried − loans outstanding (main PRD §5.7)" });

const DeskSchema = z
  .object({
    fund: z.object({
      totalPaisa: paisa,
      accounts: z.array(z.object({ id: z.uuid(), name: z.string(), type: z.enum(["CASH", "BANK", "WALLET"]), balancePaisa: paisa })),
    }),
    reconciliation: ReconciliationSchema,
    pending: z.object({ count: z.number().int(), over3Days: z.number().int() }),
    openComplaints: z.number().int(),
    invites: z.object({ waiting: z.number().int(), expired: z.number().int() }),
  })
  .meta({ id: "HomeDesk", description: "Bookkeeper's desk (F5) — `dashboard.admin` only" });

const ReminderSchema = z
  .discriminatedUnion("kind", [
    z.object({ key: z.literal("CLOSE_MONTH"), kind: z.literal("CLOSE_MONTH"), month: MonthKeySchema, units: z.array(unit) }),
    z.object({ key: z.literal("RENT_STATUS"), kind: z.literal("RENT_STATUS"), month: MonthKeySchema, units: z.array(unit) }),
    z.object({
      key: z.string().meta({ description: "APPROVED_UNPAID:{requestId}" }),
      kind: z.literal("APPROVED_UNPAID"),
      request: z.object({ id: z.uuid(), ownerName: z.string(), amountPaisa: paisa, type: z.enum(["ADVANCE", "LOAN", "GRANT"]), neededBy: day }),
    }),
  ])
  .meta({ id: "HomeReminder", description: "F6 — at most two, most urgent first; `key` is what Hide today stores" });

const ActivitySchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(["INCOME", "EXPENSE", "PAYOUT", "ADVANCE", "LOAN", "REPAYMENT"]),
    date: day,
    createdAt: z.iso.datetime(),
    category: z.object({ nameEn: z.string(), nameBn: z.string() }).nullable(),
    owner: z.object({ id: z.uuid(), name: z.string() }).nullable(),
    description: z.string().nullable(),
    method: z.enum(["CASH", "BANK", "BKASH", "NAGAD"]).nullable(),
    reference: z.string().nullable(),
    amountPaisa: paisa.meta({ description: "Signed: + money in, − money out" }),
    month: MonthKeySchema,
    entryId: z.uuid().nullable(),
  })
  .meta({ id: "HomeActivity" });

const NoticeSchema = z
  .object({ id: z.uuid(), title: z.string(), body: z.string(), urgent: z.boolean(), date: day, unread: z.boolean() })
  .meta({ id: "HomeNotice", description: "Pinned notice (empty until the Notices section ships)" });

export const DashboardSchema = z
  .object({
    houseName: z.string(),
    month: z.object({ key: MonthKeySchema, open: z.boolean(), firstMonth: z.boolean() }).nullable().meta({ description: "Latest open month, else latest closed; null with no months" }),
    house: z
      .object({
        incomePaisa: paisa,
        expensePaisa: paisa,
        reservePaisa: paisa,
        previousDeficitPaisa: paisa,
        distributablePaisa: paisa,
        draft: z.boolean(),
        shortfallPaisa: paisa,
      })
      .nullable()
      .meta({ description: "F7 staircase — same figures as Distribution for the month" }),
    activity: z.array(ActivitySchema).max(6),
    notices: z.array(NoticeSchema).max(3),
    noticesMore: z.boolean(),
    me: MeSchema.nullable(),
    myRequest: MyRequestSchema.nullable(),
    desk: DeskSchema.nullable(),
    reminders: z.array(ReminderSchema).max(2).nullable(),
    setup: z
      .object({ steps: z.array(z.object({ key: z.enum(["HOUSE", "FUNDS", "SHARES", "OPENINGS", "FIRST_MONTH", "INVITES"]), done: z.boolean() })) })
      .nullable()
      .meta({ description: "F12 checklist; null once setup is complete or for non-admins" }),
    quickActions: z.object({ monthOpen: z.boolean(), generateRent: z.boolean() }).nullable(),
  })
  .meta({ id: "Dashboard" });

registry.registerPath({
  method: "get",
  path: "/dashboard",
  tags: ["Home"],
  summary: "Role-aware Home summary",
  description:
    "Any logged-in user (Home PRD §3; main PRD S2, §9). `me` and `myRequest` only when the viewer is linked to an owner; `desk`, `reminders`, `setup` and `quickActions` only with `dashboard.admin` — otherwise null. Reminders hidden today via the `bh_home_hidden` cookie are left out.",
  security: cookieAuthRead,
  responses: {
    200: jsonResponse("Home summary", apiSuccessSchema("DashboardResponse", DashboardSchema)),
    401: readErrors[401],
  },
});
