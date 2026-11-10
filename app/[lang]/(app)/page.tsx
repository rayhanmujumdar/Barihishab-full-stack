import type { Metadata } from "next";
import { cookies } from "next/headers";
import { cache, Suspense } from "react";
import { BalanceHero, ThisMonth } from "@/components/home/BalanceHero";
import { BlockBoundary } from "@/components/home/BlockBoundary";
import { BlockSkeleton } from "@/components/home/BlockSkeleton";
import { Desk } from "@/components/home/Desk";
import type { HomeBlockName } from "@/components/home/format";
import { HomeHeader } from "@/components/home/HomeHeader";
import { HomeRefresh } from "@/components/home/HomeRefresh";
import { HouseThisMonth } from "@/components/home/HouseThisMonth";
import { LatestActivity } from "@/components/home/LatestActivity";
import { MyRequestStrip } from "@/components/home/MyRequestStrip";
import { PinnedNotices } from "@/components/home/PinnedNotices";
import { Reminders } from "@/components/home/Reminders";
import { SetupChecklist } from "@/components/home/SetupChecklist";
import type { EntryFormData } from "@/components/home/types";
import { requireViewer } from "@/lib/auth/server";
import { todayIsoInDhaka } from "@/lib/clock";
import { latestActivity } from "@/lib/home/activity";
import { houseThisMonth, quickActions } from "@/lib/home/dashboard";
import { deskFigures } from "@/lib/home/desk";
import { HIDDEN_COOKIE, hiddenToday } from "@/lib/home/hidden";
import { meFigures, myRequest, viewerOwnerId } from "@/lib/home/me";
import { homeMonth } from "@/lib/home/month";
import { pinnedNotices } from "@/lib/home/notices";
import { homeReminders } from "@/lib/home/reminders";
import { setupChecklist } from "@/lib/home/setup";
import { t, type Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { listCategories } from "@/lib/master-data/category-service";
import { listFunds } from "@/lib/master-data/fund-service";
import { listUnits } from "@/lib/master-data/unit-service";
import { listPeriods } from "@/lib/periods/period-service";
import { can } from "@/lib/permissions";
import { currentPropertyId } from "@/lib/property";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await getLocale(), "meta.home") };
}

// S2 Home (docs/home_section_PRD.md). Each block streams behind its own
// Suspense + error boundary (F11, design D2); who sees which block is
// decided here on the server (§3, Rule 6). Loaders are the same ones
// GET /api/v1/dashboard uses, memoised per request.
export default function HomePage() {
  return (
    <Suspense fallback={<div className="home" aria-busy="true" />}>
      <Home />
    </Suspense>
  );
}

type Ctx = { locale: Locale; propertyId: string; userId: string; ownerId: string | null };

const getMe = cache(meFigures);

/** What Home's entry drawer and Generate-rent dialog need (Super Admin only). */
const entryForm = cache(async (propertyId: string): Promise<EntryFormData> => {
  const [{ items: periods, latestOpen }, categories, units, funds, m] = await Promise.all([
    listPeriods(propertyId),
    listCategories(propertyId),
    listUnits(propertyId, { active: true }),
    listFunds(propertyId),
    homeMonth(propertyId),
  ]);
  const month = latestOpen ?? m.month?.key ?? periods[0]?.month ?? "";
  return { month, status: periods.find((p) => p.month === month)?.status ?? null, latestOpen, periods, categories, units, funds };
});

function Block({ ctx, name, className = "", rows, children }: { ctx: Ctx; name: HomeBlockName; className?: string; rows?: number; children: React.ReactNode }) {
  return (
    <div className={`home-block ${className}`}>
      <BlockBoundary locale={ctx.locale} block={name}>
        <Suspense fallback={<BlockSkeleton locale={ctx.locale} block={name} rows={rows} />}>{children}</Suspense>
      </BlockBoundary>
    </div>
  );
}

async function Home() {
  const viewer = await requireViewer();
  const locale = await getLocale();
  const propertyId = await currentPropertyId();
  const admin = can(viewer, "dashboard.admin");
  const ownerId = await viewerOwnerId(propertyId, viewer.id);
  const hidden = hiddenToday((await cookies()).get(HIDDEN_COOKIE)?.value, todayIsoInDhaka());
  const ctx: Ctx = { locale, propertyId, userId: viewer.id, ownerId };
  const name = viewer.firstName ?? viewer.username;
  return (
    <div className="home" lang={locale}>
      <div className="flex flex-col gap-1">
        <Block ctx={ctx} name="actions" rows={1}>
          <HeaderBlock ctx={ctx} name={name} admin={admin} />
        </Block>
        <HomeRefresh locale={locale} />
      </div>
      {ownerId ? (
        <>
          <div className="home-pair">
            <Block ctx={ctx} name="me">
              <HeroBlock ctx={ctx} />
            </Block>
            <Block ctx={ctx} name="me" rows={3}>
              <ThisMonthBlock ctx={ctx} />
            </Block>
          </div>
          <Block ctx={ctx} name="request" className="home-o-request" rows={0}>
            <RequestBlock ctx={ctx} ownerId={ownerId} />
          </Block>
        </>
      ) : null}
      {admin ? (
        <>
          <Block ctx={ctx} name="setup" className="home-o-setup" rows={0}>
            <SetupBlock ctx={ctx} />
          </Block>
          <Block ctx={ctx} name="desk" className="home-o-desk" rows={4}>
            <DeskBlock ctx={ctx} />
          </Block>
          <Block ctx={ctx} name="reminders" className="home-o-reminders" rows={0}>
            <RemindersBlock ctx={ctx} hidden={hidden} />
          </Block>
        </>
      ) : null}
      <Block ctx={ctx} name="house" className="home-o-house">
        <HouseBlock ctx={ctx} />
      </Block>
      <div className="home-pair home-feed home-o-feed">
        <Block ctx={ctx} name="activity" className="home-o-activity" rows={6}>
          <ActivityBlock ctx={ctx} />
        </Block>
        <Block ctx={ctx} name="notices" rows={3}>
          <NoticesBlock ctx={ctx} />
        </Block>
      </div>
    </div>
  );
}

async function HeaderBlock({ ctx, name, admin }: { ctx: Ctx; name: string; admin: boolean }) {
  const [m, actions, form] = await Promise.all([homeMonth(ctx.propertyId), admin ? quickActions(ctx.propertyId) : null, admin ? entryForm(ctx.propertyId) : null]);
  return <HomeHeader locale={ctx.locale} houseName={m.houseName} month={m.month} name={name} quick={actions && form ? { actions, form } : null} />;
}

async function HeroBlock({ ctx }: { ctx: Ctx }) {
  const [me, m] = await Promise.all([getMe(ctx.propertyId, ctx.userId), homeMonth(ctx.propertyId)]);
  return me ? <BalanceHero locale={ctx.locale} me={me} month={m.month} /> : null;
}

async function ThisMonthBlock({ ctx }: { ctx: Ctx }) {
  const [me, m] = await Promise.all([getMe(ctx.propertyId, ctx.userId), homeMonth(ctx.propertyId)]);
  return me ? <ThisMonth locale={ctx.locale} me={me} month={m.month} /> : null;
}

async function RequestBlock({ ctx, ownerId }: { ctx: Ctx; ownerId: string }) {
  const request = await myRequest(ctx.propertyId, ownerId);
  return request ? <MyRequestStrip locale={ctx.locale} request={request} /> : null;
}

async function SetupBlock({ ctx }: { ctx: Ctx }) {
  const setup = await setupChecklist(ctx.propertyId, ctx.userId);
  return setup ? <SetupChecklist locale={ctx.locale} setup={setup} /> : null;
}

async function DeskBlock({ ctx }: { ctx: Ctx }) {
  return <Desk locale={ctx.locale} desk={await deskFigures(ctx.propertyId)} />;
}

async function RemindersBlock({ ctx, hidden }: { ctx: Ctx; hidden: string[] }) {
  const [reminders, form] = await Promise.all([homeReminders(ctx.propertyId, hidden), entryForm(ctx.propertyId)]);
  return <Reminders locale={ctx.locale} reminders={reminders} rentForm={form} />;
}

async function HouseBlock({ ctx }: { ctx: Ctx }) {
  const [house, m] = await Promise.all([houseThisMonth(ctx.propertyId), homeMonth(ctx.propertyId)]);
  return house && m.month ? <HouseThisMonth locale={ctx.locale} house={house} month={m.month} /> : null;
}

async function ActivityBlock({ ctx }: { ctx: Ctx }) {
  const [items, m] = await Promise.all([latestActivity(ctx.propertyId), homeMonth(ctx.propertyId)]);
  return <LatestActivity locale={ctx.locale} items={items} month={m.month?.key ?? null} />;
}

async function NoticesBlock({ ctx }: { ctx: Ctx }) {
  const { items, more } = await pinnedNotices(ctx.propertyId, ctx.userId);
  return <PinnedNotices locale={ctx.locale} notices={items} more={more} />;
}
