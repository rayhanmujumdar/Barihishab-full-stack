import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton, SkeletonPageHead, SkeletonRegion, SkeletonRows, SkeletonSectionHead, SkeletonStats, SkeletonTable, SkeletonTabs } from "./primitives";

const FOCUSABLE = "a[href], button, input, select, textarea, [tabindex]";

describe("skeleton primitives (loading-skeletons spec)", () => {
  it("Skeleton is a hidden, non-focusable placeholder block", () => {
    const { container } = render(<Skeleton className="h-4 w-20" />);
    const block = container.firstElementChild!;
    expect(block).toHaveClass("skeleton", "h-4", "w-20");
    expect(block).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(FOCUSABLE)).toBeNull();
  });

  it("SkeletonRegion is the one busy, labelled container", () => {
    render(
      <SkeletonRegion label="Loading owners…">
        <Skeleton />
      </SkeletonRegion>,
    );
    const region = screen.getByLabelText("Loading owners…");
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(region).toHaveClass("skeleton-region");
    // A named status: aria-label is not allowed on a role-less (generic) div.
    expect(region).toHaveAttribute("role", "status");
    expect(screen.getByRole("status", { name: "Loading owners…" })).toBe(region);
  });

  it("SkeletonPageHead has a kicker bar, a title bar and an optional action bar", () => {
    const { container, rerender } = render(<SkeletonPageHead />);
    expect(container.querySelectorAll(".skeleton")).toHaveLength(2);
    rerender(<SkeletonPageHead action />);
    expect(container.querySelectorAll(".skeleton")).toHaveLength(3);
    expect(container.querySelector("[data-skeleton='action']")).toHaveClass("h-11");
  });

  it("SkeletonStats renders N ruled stat cells", () => {
    const { container } = render(<SkeletonStats cells={5} />);
    const stats = container.querySelector(".stats")!;
    expect(stats).not.toBeNull();
    expect(stats.querySelectorAll(":scope > .stat")).toHaveLength(5);
  });

  it("SkeletonRows renders N 44px list rows", () => {
    const { container } = render(<SkeletonRows rows={6} />);
    const rows = container.querySelectorAll("li.list-row");
    expect(rows).toHaveLength(6);
    rows.forEach((r) => expect(r).toHaveClass("min-h-11"));
  });

  it("SkeletonTable renders a header row and N body rows in a clipped wrapper", () => {
    const { container } = render(<SkeletonTable cols={4} rows={5} />);
    const wrap = container.querySelector(".st-wrap")!;
    expect(wrap).not.toBeNull();
    expect(wrap.querySelectorAll("thead tr")).toHaveLength(1);
    expect(wrap.querySelectorAll("thead th")).toHaveLength(4);
    expect(wrap.querySelectorAll("tbody tr")).toHaveLength(5);
    expect(wrap.querySelector("table")).toHaveAttribute("aria-hidden", "true");
    // Placeholders never scroll, so there is no unreachable scroll box.
    expect(wrap).toHaveStyle({ overflow: "hidden" });
    // The last two columns are right-aligned money columns, like the real tables.
    expect([...wrap.querySelectorAll("thead th")].map((th) => th.classList.contains("num"))).toEqual([false, false, true, true]);
  });

  it("SkeletonSectionHead keeps the 2px ink section rule", () => {
    const { container } = render(<SkeletonSectionHead />);
    expect(container.querySelector(".section-head")).not.toBeNull();
  });

  it("SkeletonTabs draws N tab bars over the 2px ink rule", () => {
    const { container } = render(<SkeletonTabs tabs={3} />);
    const bar = container.firstElementChild!;
    expect(bar).toHaveClass("border-b-2", "border-foreground");
    expect(bar.querySelectorAll(".skeleton")).toHaveLength(3);
  });
});
