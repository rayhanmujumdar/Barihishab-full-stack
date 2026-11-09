import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api/client";
import { expectRequiredMarkersMatch } from "@/tests/helpers/required";
import { AcceptInviteForm } from "./AcceptInviteForm";
import { ForgotForm } from "./ForgotForm";
import { InviteState } from "./InviteState";
import { LoginForm } from "./LoginForm";
import { ResetForm } from "./ResetForm";

vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn(), fieldErrors: () => ({}) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));
const api = vi.mocked(apiFetch);
const fail = (status: number, code: string, details?: Record<string, unknown>) => ({ ok: false as const, status, error: { code, message: code, details } });

beforeEach(() => api.mockReset());

describe("LoginForm (A1)", () => {
  it("keeps submit disabled until both fields have text", async () => {
    render(<LoginForm locale="en" next="/" navigate={vi.fn()} />);
    const submit = screen.getByRole("button", { name: "Log in" });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Username or email"), "rahim");
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Password"), "x");
    expect(submit).toBeEnabled();
  });

  it("shows the generic error and moves focus to the error strip", async () => {
    api.mockResolvedValue(fail(401, "INVALID_CREDENTIALS"));
    render(<LoginForm locale="en" next="/" navigate={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Username or email"), "rahim");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Username/email or password is wrong.");
    expect(alert).toHaveFocus();
  });

  it("adds the attempts-left hint after the 3rd failure", async () => {
    api.mockResolvedValue(fail(401, "INVALID_CREDENTIALS", { attemptsLeft: 2 }));
    render(<LoginForm locale="en" next="/" navigate={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Username or email"), "rahim");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("2 attempts left before a 15-minute lock.");
  });

  it("shows the locked message on 423", async () => {
    api.mockResolvedValue(fail(423, "ACCOUNT_LOCKED", { retryAfter: 900 }));
    render(<LoginForm locale="en" next="/" navigate={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Username or email"), "rahim");
    await userEvent.type(screen.getByLabelText("Password"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts. Try again in 15 minutes or reset your password.");
  });

  it("posts remember me and navigates to the safe next path on success", async () => {
    api.mockResolvedValue({ ok: true, status: 200, data: {} });
    const navigate = vi.fn();
    render(<LoginForm locale="en" next="/admin/users" navigate={navigate} />);
    await userEvent.type(screen.getByLabelText("Username or email"), "rahim");
    await userEvent.type(screen.getByLabelText("Password"), "Gh7!tree-river");
    await userEvent.click(screen.getByLabelText("Remember me for 30 days"));
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/admin/users"));
    expect(api).toHaveBeenCalledWith("/auth/login", { method: "POST", body: { identifier: "rahim", password: "Gh7!tree-river", remember: true } });
  });

  it("renders in Bangla", () => {
    render(<LoginForm locale="bn" next="/" navigate={vi.fn()} />);
    expect(screen.getByLabelText("ইউজারনেম বা ইমেইল")).toBeInTheDocument();
  });
});

describe("ForgotForm (A2)", () => {
  it("shows the same message whatever the API says", async () => {
    for (const result of [{ ok: true as const, status: 202, data: {} }, fail(422, "VALIDATION_FAILED"), fail(500, "INTERNAL_ERROR")]) {
      api.mockResolvedValueOnce(result);
      const { unmount } = render(<ForgotForm locale="en" />);
      await userEvent.type(screen.getByLabelText("Email"), "someone@example.com");
      await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));
      expect(await screen.findByText("If that email has an account, a link is on its way.")).toBeInTheDocument();
      unmount();
    }
  });

  it("shows a retry message when rate limited", async () => {
    api.mockResolvedValueOnce(fail(429, "RATE_LIMITED"));
    render(<ForgotForm locale="en" />);
    await userEvent.type(screen.getByLabelText("Email"), "someone@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests");
  });
});

describe("ResetForm (A3)", () => {
  it("gates submit on live length and match checks", async () => {
    render(<ResetForm locale="en" token="t" navigate={vi.fn()} />);
    const submit = screen.getByRole("button", { name: "Save new password" });
    await userEvent.type(screen.getByLabelText("New password"), "short");
    expect(screen.getByText("At least 8 characters").closest("li")).toHaveAttribute("data-ok", "false");
    await userEvent.clear(screen.getByLabelText("New password"));
    await userEvent.type(screen.getByLabelText("New password"), "Gh7!tree-river");
    await userEvent.type(screen.getByLabelText("Repeat new password"), "Gh7!tree-rivex");
    expect(screen.getByText("Passwords don't match")).toBeInTheDocument();
    expect(submit).toBeDisabled();
    await userEvent.clear(screen.getByLabelText("Repeat new password"));
    await userEvent.type(screen.getByLabelText("Repeat new password"), "Gh7!tree-river");
    expect(screen.getByText("Both passwords match").closest("li")).toHaveAttribute("data-ok", "true");
    expect(submit).toBeEnabled();
  });

  it("switches to the expired state when the token died meanwhile, without a form", async () => {
    api.mockResolvedValue(fail(410, "TOKEN_EXPIRED"));
    render(<ResetForm locale="en" token="t" navigate={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("New password"), "Gh7!tree-river");
    await userEvent.type(screen.getByLabelText("Repeat new password"), "Gh7!tree-river");
    await userEvent.click(screen.getByRole("button", { name: "Save new password" }));
    expect(await screen.findByText("This link has expired")).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).toBeNull();
    expect(screen.getByRole("link", { name: /Request a new link/ })).toHaveAttribute("href", "/en/forgot");
  });

  it("shows the localized policy error from the API", async () => {
    api.mockResolvedValue(fail(422, "VALIDATION_FAILED", { reason: "TOO_COMMON", fields: { password: "x" } }));
    render(<ResetForm locale="en" token="t" navigate={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("New password"), "password123");
    await userEvent.type(screen.getByLabelText("Repeat new password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Save new password" }));
    expect(await screen.findByText("This password is too common. Choose another.")).toBeInTheDocument();
  });
});

describe("AcceptInviteForm (A4)", () => {
  const info = { firstName: "Karim", username: "karim", invitedBy: "Rayhan", expiresAt: new Date(Date.now() + 71 * 3600_000 - 60_000).toISOString(), locale: "bn" as const };

  it("welcomes the user, shows the username read-only and the expiry kicker", () => {
    render(<AcceptInviteForm locale="en" token="t" info={info} navigate={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Welcome, Karim" })).toBeInTheDocument();
    expect(screen.getByLabelText("Your username")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Your username")).toHaveValue("karim");
    expect(screen.getByText("Expires in 71 h")).toBeInTheDocument();
  });

  it("submits password and chosen language, then goes home", async () => {
    api.mockResolvedValue({ ok: true, status: 200, data: {} });
    const navigate = vi.fn();
    render(<AcceptInviteForm locale="en" token="tok" info={info} navigate={navigate} />);
    await userEvent.type(screen.getByLabelText("New password"), "Gh7!tree-river");
    await userEvent.type(screen.getByLabelText("Repeat new password"), "Gh7!tree-river");
    await userEvent.click(screen.getByLabelText("English"));
    await userEvent.click(screen.getByRole("button", { name: "Create my account" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/en"));
    expect(api).toHaveBeenCalledWith("/auth/accept-invite", { method: "POST", body: { token: "tok", password: "Gh7!tree-river", locale: "en" } });
  });
});

describe("InviteState (A4 edge states)", () => {
  it("names the admin when expired and renders no form", () => {
    render(<InviteState locale="en" state={{ kind: "expired", invitedBy: "Rayhan" }} />);
    expect(screen.getByText("This invite has expired. Ask Rayhan to send a new one.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("offers Log in when already used", () => {
    render(<InviteState locale="en" state={{ kind: "used" }} />);
    expect(screen.getByText("This invite was already used.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Log in/ })).toHaveAttribute("href", "/en/login");
  });

  it("asks a different logged-in user to log out first", () => {
    render(<InviteState locale="en" state={{ kind: "otherUser", name: "Salma" }} />);
    expect(screen.getByText("You're logged in as Salma. Log out first to accept this invite.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Log out and continue/ })).toBeInTheDocument();
  });

  it("confirms before logging out to continue", async () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    try {
      api.mockResolvedValue({ ok: true, status: 204, data: null } as never);
      render(<InviteState locale="en" state={{ kind: "otherUser", name: "Salma" }} />);
      await userEvent.click(screen.getByRole("button", { name: /Log out and continue/ }));
      const dialog = await screen.findByRole("alertdialog", { name: "Log out as Salma?" });
      expect(api).not.toHaveBeenCalled();
      await userEvent.click(within(dialog).getByRole("button", { name: "Log out" }));
      expect(api).toHaveBeenCalledWith("/auth/logout", { method: "POST" });
      await waitFor(() => expect(reload).toHaveBeenCalled());
    } finally {
      vi.unstubAllGlobals(); // never leak the fake location into later tests
    }
  });

  it("Cancel on the invite logout sends nothing", async () => {
    render(<InviteState locale="en" state={{ kind: "otherUser", name: "Salma" }} />);
    await userEvent.click(screen.getByRole("button", { name: /Log out and continue/ }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
    expect(api).not.toHaveBeenCalled();
  });
});

describe("required markers (form-required-indicator)", () => {
  const marked = (id: string) => document.querySelector(`label[for="${id}"]`)?.getAttribute("data-required") === "true";
  const noLegend = () => expect(screen.queryByText(/^\* /)).toBeNull();

  it("Login marks identifier and password, no legend, names unchanged", () => {
    const { container } = render(<LoginForm locale="en" next="/" navigate={vi.fn()} />);
    expect(marked("identifier") && marked("password")).toBe(true);
    expect(screen.getByRole("textbox", { name: "Username or email" })).toBeRequired();
    noLegend();
    expectRequiredMarkersMatch(container);
  });

  it("Forgot marks the email", () => {
    const { container } = render(<ForgotForm locale="en" />);
    expect(marked("email")).toBe(true);
    noLegend();
    expectRequiredMarkersMatch(container);
  });

  it("Reset marks both password fields", () => {
    const { container } = render(<ResetForm locale="en" token="t" navigate={vi.fn()} />);
    expect(container.querySelectorAll('label[data-required="true"]')).toHaveLength(2);
    noLegend();
    expectRequiredMarkersMatch(container);
  });

  it("Accept invite marks both passwords, not the read-only username", () => {
    const info = { firstName: "Karim", username: "karim", invitedBy: "Rayhan", expiresAt: new Date(Date.now() + 3600_000).toISOString(), locale: "bn" as const };
    const { container } = render(<AcceptInviteForm locale="en" token="t" info={info} navigate={vi.fn()} />);
    expect(marked("invite-username")).toBe(false);
    expect(marked("invite-new") && marked("invite-repeat")).toBe(true);
    noLegend();
    expectRequiredMarkersMatch(container);
  });
});
