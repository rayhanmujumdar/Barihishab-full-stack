import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorView } from "./ErrorView";
import { NotFoundView } from "./NotFoundView";

let pathname = "/en/owners";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

describe("NotFoundView", () => {
  it("renders the 404 in the given locale with a Home link", () => {
    render(<NotFoundView locale="en" />);
    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Home" })).toHaveAttribute("href", "/en");
  });

  it("uses Bangla digits and copy for bn", () => {
    render(<NotFoundView locale="bn" />);
    expect(screen.getByText("৪০৪")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "পেজটি পাওয়া যায়নি" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "হোমে যান" })).toHaveAttribute("href", "/bn");
  });

  it("adds the brand bar only when standalone", () => {
    const { rerender } = render(<NotFoundView locale="en" />);
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    rerender(<NotFoundView locale="en" standalone />);
    expect(screen.getByRole("banner")).toHaveTextContent("BariHisab");
  });
});

describe("ErrorView", () => {
  beforeEach(() => {
    pathname = "/en/owners";
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("reads the locale from the URL and retries on click", async () => {
    const retry = vi.fn();
    render(<ErrorView error={new Error("boom")} retry={retry} />);
    expect(screen.getByRole("heading", { level: 1, name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Home" })).toHaveAttribute("href", "/en");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("shows the server digest as a reference but never the message", () => {
    const error = Object.assign(new Error("secret db detail"), { digest: "abc123" });
    render(<ErrorView error={error} retry={vi.fn()} />);
    expect(screen.getByText("Reference: abc123")).toBeInTheDocument();
    expect(screen.queryByText(/secret db detail/)).not.toBeInTheDocument();
  });

  it("falls back to Bangla when the URL has no locale, and tolerates non-Error throws", () => {
    pathname = "/";
    render(<ErrorView error="oops" retry={vi.fn()} />);
    expect(screen.getByText("৫০০")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "আবার চেষ্টা করুন" })).toBeInTheDocument();
    expect(screen.queryByText(/রেফারেন্স/)).not.toBeInTheDocument();
  });
});
