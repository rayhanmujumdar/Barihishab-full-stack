import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { compactMoney, palette, PRINT_GREY, SIGNAL } from "./theme";
import { CategoryBarChart } from "./CategoryBarChart";
import { YearChart } from "./YearChart";
import { year2026 } from "../fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("chart theme", () => {
  it("prints the yellow grey and keeps income ink", () => {
    expect(palette(false).expense).toBe(SIGNAL);
    expect(palette(true).expense).toBe(PRINT_GREY);
    expect(palette(true).income).toBe(palette(false).income);
  });

  it("abbreviates axis money in lakh and crore", () => {
    expect(compactMoney("en", 12500000)).toBe("৳1.3L");
    expect(compactMoney("en", 1_000_000_000)).toBe("৳1Cr");
    expect(compactMoney("en", 1200000)).toBe("৳12K");
    expect(compactMoney("en", 50000)).toBe("৳500");
    expect(compactMoney("en", -300000)).toBe("−৳3K");
    expect(compactMoney("bn", 12500000)).toBe("৳১.৩ লা");
  });
});

describe("print charts render at a fixed A4 width (no container measuring)", () => {
  it("draws category bars with direct amount · % labels", () => {
    const { container } = render(
      <CategoryBarChart locale="en" kind="EXPENSE" print label="Expenses by category" data={[{ key: "e", name: "Electricity", amountPaisa: 630000, shareBp: 4506 }]} />,
    );
    expect(container.querySelector("svg.recharts-surface")).not.toBeNull();
    expect(container.textContent).toContain("৳6,300 · 45%");
    // Screen-reader summary of every value, tied to the figure.
    const figure = container.querySelector("figure")!;
    expect(document.getElementById(figure.getAttribute("aria-describedby")!)).toHaveTextContent("Electricity: ৳6,300 · 45%");
    expect(container.querySelector(`path[fill="${PRINT_GREY}"], rect[fill="${PRINT_GREY}"]`)).not.toBeNull();
  });

  it("draws the year without links in print, drafts hatched", () => {
    const { container } = render(<YearChart locale="en" data={year2026} print />);
    expect(container.querySelector("svg.recharts-surface")).not.toBeNull();
    expect(container.querySelectorAll("pattern")).toHaveLength(2);
    expect(container.querySelector(".rpt-chart-months a")).toBeNull();
    expect(container.querySelectorAll(".rpt-chart-months li")).toHaveLength(12);
    expect(container.querySelector("figcaption")).toHaveTextContent("October 2026: income ৳1,03,000, expenses ৳13,980 (Draft)");
  });
});
