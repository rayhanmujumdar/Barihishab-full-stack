import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MonthComplaintsNote, QuestionedBadge, RaiseObjectionButton } from "./ComplaintLinks";

describe("Questioned badge and Raise an objection (C8, G10)", () => {
  it("links the badge to the complaint", () => {
    render(<QuestionedBadge locale="en" complaintId="c-1" />);
    expect(screen.getByRole("link", { name: "Questioned" })).toHaveAttribute("href", "/en/notices?complaint=c-1");
  });

  it("renders nothing without a live complaint", () => {
    const { container } = render(<QuestionedBadge locale="en" complaintId={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("opens the pre-filled form for the item, in Bangla too", () => {
    const { unmount } = render(<RaiseObjectionButton locale="en" type="ENTRY" id="t-1" />);
    expect(screen.getByRole("link", { name: "Raise an objection" })).toHaveAttribute("href", "/en/notices?raise=1&link=ENTRY%3At-1");
    unmount();
    render(<RaiseObjectionButton locale="bn" type="MONTH" id="p-1" />);
    expect(screen.getByRole("link", { name: "আপত্তি জানান" })).toHaveAttribute("href", "/bn/notices?raise=1&link=MONTH%3Ap-1");
  });

  it("says how many open complaints a month has, linking to the filtered list", () => {
    const { container, unmount } = render(<MonthComplaintsNote locale="en" month="2026-07" count={0} />);
    expect(container).toBeEmptyDOMElement();
    unmount();
    render(<MonthComplaintsNote locale="en" month="2026-07" count={1} />);
    expect(screen.getByRole("link", { name: "1 open complaint(s) about July 2026." })).toHaveAttribute("href", "/en/notices?month=2026-07");
  });
});
