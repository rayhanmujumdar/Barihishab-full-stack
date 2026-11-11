import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import type { Locale } from "@/lib/i18n";
import {
  AdvancesSkeleton,
  AuthFormSkeleton,
  DistributionSkeleton,
  HomeSkeleton,
  OwnerDetailSkeleton,
  OwnersSkeleton,
  PageSkeleton,
  ReportPrintSkeleton,
  ReportsSkeleton,
  ProfileSkeleton,
  RequestsSkeleton,
  SettingsSkeleton,
  StatementPrintSkeleton,
  UsersSkeleton,
} from "./pages";

const FOCUSABLE = "a[href], button, input, select, textarea, [tabindex]";

// Each page skeleton, with the label it must announce in en and bn.
const PAGES: [string, (locale: Locale) => ReactElement, string, string][] = [
  ["generic", (l) => <PageSkeleton locale={l} />, "Loading…", "লোড হচ্ছে…"],
  ["home", (l) => <HomeSkeleton locale={l} />, "Loading home…", "হোম লোড হচ্ছে…"],
  ["owners", (l) => <OwnersSkeleton locale={l} />, "Loading owners…", "মালিকদের তথ্য আসছে…"],
  ["owner detail", (l) => <OwnerDetailSkeleton locale={l} />, "Loading the owner…", "মালিকের তথ্য আসছে…"],
  ["distribution", (l) => <DistributionSkeleton locale={l} />, "Loading the distribution…", "বণ্টনের হিসাব লোড হচ্ছে…"],
  ["advances", (l) => <AdvancesSkeleton locale={l} />, "Loading advances and loans…", "অগ্রিম ও ঋণ লোড হচ্ছে…"],
  ["requests", (l) => <RequestsSkeleton locale={l} />, "Loading requests…", "অনুরোধগুলো লোড হচ্ছে…"],
  ["users", (l) => <UsersSkeleton locale={l} />, "Loading users…", "ব্যবহারকারীদের তালিকা লোড হচ্ছে…"],
  ["settings", (l) => <SettingsSkeleton locale={l} />, "Loading settings…", "সেটিংস লোড হচ্ছে…"],
  ["profile", (l) => <ProfileSkeleton locale={l} />, "Loading your profile…", "আপনার প্রোফাইল লোড হচ্ছে…"],
  ["auth form", (l) => <AuthFormSkeleton locale={l} />, "Loading the form…", "ফর্ম লোড হচ্ছে…"],
  ["print statement", (l) => <StatementPrintSkeleton locale={l} />, "Loading the statement…", "হিসাব বিবরণী লোড হচ্ছে…"],
  ["reports", (l) => <ReportsSkeleton locale={l} />, "Loading report…", "রিপোর্ট লোড হচ্ছে…"],
];

describe("report print skeleton (Reports F6)", () => {
  it("says Preparing PDF… while staying a busy, inert region", () => {
    const { container } = render(<ReportPrintSkeleton locale="en" />);
    expect(screen.getByRole("status", { name: "Preparing PDF…" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Preparing PDF…")).toBeInTheDocument();
    expect(container.querySelector(FOCUSABLE)).toBeNull();
  });
});

describe("page skeletons are busy, labelled and inert (spec: accessible and bilingual)", () => {
  it.each(PAGES)("%s", (_name, make, enLabel, bnLabel) => {
    const { container, unmount } = render(make("en"));
    const region = screen.getByLabelText(enLabel);
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(container.querySelectorAll("[aria-busy='true']")).toHaveLength(1);
    expect(container.querySelector(FOCUSABLE)).toBeNull();
    // No visible "Loading…" paragraph: the label is only the accessible name.
    expect(screen.queryByText(enLabel)).toBeNull();
    // Every placeholder bar is hidden from assistive tech.
    container.querySelectorAll(".skeleton").forEach((b) => expect(b.closest("[aria-hidden='true']")).not.toBeNull());
    unmount();

    render(make("bn"));
    expect(screen.getByLabelText(bnLabel)).toHaveAttribute("aria-busy", "true");
  });
});

// Structural markers copied from the real pages (spec: skeleton mirrors the real page layout).
describe("page skeletons mirror their page", () => {
  const head = (c: HTMLElement) => c.querySelector(".page-stack, .home");

  it("owners: owner-card grid, then a section head and list rows", () => {
    const { container } = render(<OwnersSkeleton locale="en" />);
    expect(head(container)).not.toBeNull();
    expect(container.querySelectorAll(".owner-grid [data-skeleton='owner-card']").length).toBeGreaterThanOrEqual(3);
    expect(container.querySelector(".section-head")).not.toBeNull();
    expect(container.querySelectorAll("li.list-row").length).toBeGreaterThan(0);
  });

  it("owner detail: 5 stat cells under the ink rule, then a statement table", () => {
    const { container } = render(<OwnerDetailSkeleton locale="en" />);
    expect(container.querySelectorAll(".stats > .stat")).toHaveLength(5);
    expect(container.querySelector(".section-head")).not.toBeNull();
    expect(container.querySelector(".st-wrap table tbody tr")).not.toBeNull();
  });

  it("distribution: head action, month picker, staircase and owner board", () => {
    const { container } = render(<DistributionSkeleton locale="en" />);
    expect(container.querySelector("[data-skeleton='action']")).not.toBeNull();
    expect(container.querySelector(".month-picker")).not.toBeNull();
    expect(container.querySelectorAll(".stair > .stair-cell")).toHaveLength(5);
    // Placeholders never use the yellow total fill.
    expect(container.querySelector(".stair-total")).toBeNull();
    expect(container.querySelector(".st-wrap table tbody tr")).not.toBeNull();
  });

  it("advances: 4 stat cells, tabs, a 2-col filter row and stacked loan cards", () => {
    const { container } = render(<AdvancesSkeleton locale="en" />);
    expect(container.querySelectorAll(".stats > .stat")).toHaveLength(4);
    expect(container.querySelector(".border-b-2.border-foreground")).not.toBeNull();
    expect(container.querySelector(".grid-2")).not.toBeNull();
    expect(container.querySelectorAll("[data-skeleton='card']").length).toBeGreaterThanOrEqual(2);
  });

  it("requests: tab bar on the ink rule above stacked request cards", () => {
    const { container } = render(<RequestsSkeleton locale="en" />);
    const tabs = container.querySelector(".border-b-2.border-foreground")!;
    expect(tabs).not.toBeNull();
    const card = container.querySelector("[data-skeleton='card']")!;
    expect(card).not.toBeNull();
    expect(tabs.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("users: a table with a header and body rows", () => {
    const { container } = render(<UsersSkeleton locale="en" />);
    expect(container.querySelectorAll("table thead th")).toHaveLength(6);
    expect(container.querySelectorAll("table tbody tr").length).toBeGreaterThanOrEqual(5);
  });

  it("settings: section heads with list rows", () => {
    const { container } = render(<SettingsSkeleton locale="en" />);
    expect(container.querySelectorAll(".section-head").length).toBeGreaterThanOrEqual(3);
    expect(container.querySelectorAll("li.list-row").length).toBeGreaterThanOrEqual(6);
  });

  it("profile: a 2-col field grid and session rows", () => {
    const { container } = render(<ProfileSkeleton locale="en" />);
    expect(container.querySelector(".grid-2 .h-11")).not.toBeNull();
    expect(container.querySelectorAll("li.list-row").length).toBeGreaterThanOrEqual(2);
  });

  it("home: head and block placeholders", () => {
    const { container } = render(<HomeSkeleton locale="en" />);
    expect(container.querySelector(".home")).not.toBeNull();
    expect(container.querySelectorAll(".home-block").length).toBeGreaterThanOrEqual(3);
  });

  it("auth form: title, 44px input bars and a full-width 48px button bar", () => {
    const { container } = render(<AuthFormSkeleton locale="en" />);
    expect(container.querySelectorAll(".h-11").length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector(".h-12.w-full")).not.toBeNull();
  });

  it("print statement: header and a table", () => {
    const { container } = render(<StatementPrintSkeleton locale="en" />);
    expect(container.querySelector("table tbody tr")).not.toBeNull();
  });

  it("generic: head and rows", () => {
    const { container } = render(<PageSkeleton locale="en" />);
    expect(head(container)).not.toBeNull();
    expect(container.querySelectorAll("li.list-row").length).toBeGreaterThan(0);
  });
});

describe("EntriesSkeleton (Income & Expenses PRD §6.1, LST-01..05)", () => {
  it("keeps exactly 6 skeleton rows under the head, month picker and the two tab placeholders", async () => {
    const { EntriesSkeleton } = await import("@/components/entries/EntriesSkeleton");
    const { container } = render(<EntriesSkeleton locale="bn" />);
    expect(screen.getByLabelText("এন্ট্রি লোড হচ্ছে…")).toHaveAttribute("aria-busy", "true");
    expect(container.querySelectorAll("li.list-row")).toHaveLength(6);
    expect(container.querySelector(".entry-tabs")).not.toBeNull();
    expect(container.querySelector(".month-picker")).not.toBeNull();
  });
});
