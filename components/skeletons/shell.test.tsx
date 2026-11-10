import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShellSkeleton } from "./shell";

const FOCUSABLE = "a[href], button, input, select, textarea, [tabindex]";

describe("ShellSkeleton (spec: app shell skeleton)", () => {
  it("draws sidebar, top bar, a 5-cell bottom nav and a page skeleton in the main area", () => {
    const { container } = render(<ShellSkeleton locale="en" />);
    const region = screen.getByLabelText("Loading BariHisab…");
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(region).toHaveClass("shell");

    const sidebar = container.querySelector(".sidebar")!;
    expect(sidebar).not.toBeNull();
    expect(sidebar.querySelector(".brand-mark")).not.toBeNull();
    expect(sidebar.querySelectorAll("[data-skeleton='nav-item']").length).toBeGreaterThanOrEqual(5);
    expect(sidebar.querySelector("[data-skeleton='avatar']")).not.toBeNull();

    expect(container.querySelector(".topbar")).not.toBeNull();
    expect(container.querySelectorAll(".bottom-nav > [data-skeleton='nav-cell']")).toHaveLength(5);

    // The main area shows the generic page skeleton, without a second busy region.
    const main = container.querySelector(".shell-main")!;
    expect(main.querySelector(".page-stack li.list-row")).not.toBeNull();
    expect(container.querySelectorAll("[aria-busy='true']")).toHaveLength(1);
  });

  it("has nothing to focus and speaks Bangla in bn", () => {
    const { container } = render(<ShellSkeleton locale="bn" />);
    expect(container.querySelector(FOCUSABLE)).toBeNull();
    expect(screen.getByLabelText("বাড়ি হিসাব লোড হচ্ছে…")).toBeInTheDocument();
  });
});
