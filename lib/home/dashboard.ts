// Role-aware Home summary (Home PRD §3, Rule 6; main PRD §9 GET /dashboard).
// The Home page renders the same loaders block by block; the API returns them
// in one call. Keys that don't apply to the viewer are null (design D10).
import { unpaidUnitsIn } from "@/lib/distribution/distribution-service";
import { can, type Permission } from "@/lib/permissions";
import { latestActivity, type ActivityItem } from "./activity";
import { deskFigures, type DeskDto } from "./desk";
import { meFigures, myRequest, viewerOwnerId, type MeDto, type MyRequestDto } from "./me";
import { homeMonth, type HomeMonth, type HomeMonthDto, type HouseStair } from "./month";
import { pinnedNotices, type NoticeDto } from "./notices";
import { homeReminders, type Reminder } from "./reminders";
import { setupChecklist, type SetupDto } from "./setup";

export type HouseDto = HouseStair & { draft: boolean; shortfallPaisa: number };
export type QuickActionsDto = { monthOpen: boolean; generateRent: boolean };

export type DashboardDto = {
  houseName: string;
  month: HomeMonthDto | null;
  house: HouseDto | null;
  activity: ActivityItem[];
  notices: NoticeDto[];
  noticesMore: boolean;
  me: MeDto | null;
  myRequest: MyRequestDto | null;
  desk: DeskDto | null;
  reminders: Reminder[] | null;
  setup: SetupDto | null;
  quickActions: QuickActionsDto | null;
};

export type HomeViewer = { id: string; permissions: readonly Permission[] };

/** The staircase block for the open month (hidden with no open month, F12); how far expenses exceed income so far. */
export async function houseThisMonth(propertyId: string, month?: HomeMonth): Promise<HouseDto | null> {
  const m = month ?? (await homeMonth(propertyId));
  if (!m.month?.open || !m.staircase) return null;
  const s = m.staircase;
  return { ...s, draft: m.month.open, shortfallPaisa: Math.max(0, s.expensePaisa - s.incomePaisa) };
}

/** Header buttons: only with an open month; rent only while some unit lacks it (F1, Rule 7). */
export async function quickActions(propertyId: string, month?: HomeMonth): Promise<QuickActionsDto> {
  const m = month ?? (await homeMonth(propertyId));
  if (!m.month?.open || !m.ctx) return { monthOpen: false, generateRent: false };
  return { monthOpen: true, generateRent: (await unpaidUnitsIn(propertyId, m.ctx.period.id)).length > 0 };
}

export async function dashboard(propertyId: string, viewer: HomeViewer, opts: { hidden?: readonly string[] } = {}): Promise<DashboardDto> {
  const admin = can(viewer, "dashboard.admin");
  // React cache() doesn't memoise outside a render (this runs in a route handler), so the month is computed once and passed down.
  const [m, activity, notices, ownerId] = await Promise.all([homeMonth(propertyId), latestActivity(propertyId), pinnedNotices(propertyId, viewer.id), viewerOwnerId(propertyId, viewer.id)]);
  const [house, me, request, desk, reminders, setup, actions] = await Promise.all([
    houseThisMonth(propertyId, m),
    ownerId ? meFigures(propertyId, viewer.id, m) : null,
    ownerId ? myRequest(propertyId, ownerId) : null,
    admin ? deskFigures(propertyId) : null,
    admin ? homeReminders(propertyId, opts.hidden) : null,
    admin ? setupChecklist(propertyId, viewer.id) : null,
    admin ? quickActions(propertyId, m) : null,
  ]);
  return {
    houseName: m.houseName,
    month: m.month,
    house,
    activity,
    notices: notices.items,
    noticesMore: notices.more,
    me,
    myRequest: request,
    desk,
    reminders,
    setup,
    quickActions: actions,
  };
}
