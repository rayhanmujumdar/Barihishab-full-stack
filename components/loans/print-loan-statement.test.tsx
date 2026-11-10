import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { detail } from "./fixtures";
import { PrintLoanStatement } from "./PrintLoanStatement";

describe("PrintLoanStatement (F15)", () => {
  it("prints house, owner, loan no., terms, every movement with running outstanding, status and date", () => {
    render(<PrintLoanStatement locale="en" houseName="Ahmed Villa" detail={detail()} generatedAt="2026-10-20T06:00:00.000Z" />);
    expect(screen.getByText("Ahmed Villa")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Loan statement · L2" })).toBeInTheDocument();
    expect(screen.getByText("Tanvir Ahmed")).toBeInTheDocument();
    expect(screen.getByText("Daughter's school admission")).toBeInTheDocument();
    expect(screen.getByText(/Amount ৳50,000 · Instalment ৳5,000 \/ month · Status Active/)).toBeInTheDocument();
    expect(screen.getByText(/Generated 20 Oct 2026/)).toBeInTheDocument();
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent("10 Jun 2026Disbursed৳50,000৳50,000");
    expect(rows[1]).toHaveTextContent("Void · Recorded on the wrong loan");
    expect(rows[4]).toHaveTextContent("Instalment skipped — no entitlement in September 2026.");
  });

  it("uses Bangla digits in বাংলা", () => {
    render(<PrintLoanStatement locale="bn" houseName="Ahmed Villa" detail={detail()} generatedAt="2026-10-20T06:00:00.000Z" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("ঋণ বিবরণী · L২");
    expect(within(screen.getByRole("table")).getAllByRole("row")[1]).toHaveTextContent("৳৫০,০০০");
  });
});
