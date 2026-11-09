import { render, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ownerPage } from "./fixtures";
import { PrintStatement } from "./PrintStatement";
import { StatementTable } from "./StatementTable";

vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn() }));

/** The money columns of every body row: [amount, running]. */
function figures(container: HTMLElement) {
  return within(container)
    .getAllByRole("row")
    .slice(1)
    .map((r) => [...r.querySelectorAll("td.num")].map((td) => td.textContent?.trim()))
    .filter((cells) => cells.length);
}

describe("PrintStatement (F4)", () => {
  it("matches the on-screen statement figures in both languages", () => {
    const { statement } = ownerPage();
    for (const locale of ["en", "bn"] as const) {
      const screen = render(<StatementTable locale={locale} statement={statement} />);
      const print = render(<PrintStatement locale={locale} houseName="Ahmed Villa" statement={statement} generatedAt="2026-10-20T06:00:00Z" generatedBy="Rayhan Ahmed" />);
      const runningScreen = figures(screen.container).map((c) => c.at(-1));
      const runningPrint = figures(print.container).map((c) => c.at(-1));
      expect(runningPrint).toEqual(runningScreen);
      screen.unmount();
      print.unmount();
    }
  });

  it("prints header, totals per type and the legend", () => {
    const { statement } = ownerPage();
    const { container } = render(<PrintStatement locale="bn" houseName="Ahmed Villa" statement={statement} generatedAt="2026-10-20T06:00:00Z" generatedBy="Rayhan Ahmed" />);
    expect(container).toHaveTextContent("Ahmed Villa");
    expect(container).toHaveTextContent("শেয়ার ১৫%");
    expect(container).toHaveTextContent("ধরন অনুযায়ী মোট");
    expect(container).toHaveTextContent("৳৮,০৫৫.৮৫");
    expect(container).toHaveTextContent("ধনাত্মক = বাড়ি এই মালিকের কাছে ঋণী।");
  });
});
