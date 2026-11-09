import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ErrorStrip } from "./error-strip";
import { DateField, PasswordField, RequiredLegend, SelectField, TextField, parseIsoDate, requiredProps, toIsoDate } from "./fields";

describe("TextField (shadcn Field + Input)", () => {
  it("has a real label and links hint + error via aria-describedby", () => {
    render(<TextField id="email" label="Email" hint="Work email" error="Enter a valid email" />);
    const input = screen.getByLabelText("Email");
    expect(input.tagName).toBe("INPUT");
    expect(input).toHaveAttribute("data-slot", "input");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const describedBy = input.getAttribute("aria-describedby")!.split(" ");
    expect(describedBy.map((id) => document.getElementById(id)?.textContent)).toEqual(["Work email", "Enter a valid email"]);
  });

  it("is not marked invalid without an error and meets the 44px target", () => {
    render(<TextField id="x" label="Name" />);
    const input = screen.getByLabelText("Name");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input.className).toContain("h-11");
  });
});

describe("PasswordField", () => {
  it("toggles visibility with an accessible shadcn button", async () => {
    render(<PasswordField id="pw" label="Password" showLabel="Show password" hideLabel="Hide password" />);
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");
    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("data-slot", "button");
  });
});

describe("SelectField", () => {
  it("renders a labelled native select (shadcn NativeSelect)", () => {
    render(<SelectField id="role" label="Role" options={[{ value: "OWNER", label: "Owner" }]} />);
    const select = screen.getByLabelText("Role");
    expect(select.tagName).toBe("SELECT");
    expect(select).toHaveAttribute("data-slot", "native-select");
  });
});

describe("ErrorStrip (shadcn Alert)", () => {
  it("is an alert that takes focus when it appears", () => {
    render(<ErrorStrip message="Username/email or password is wrong." />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Username/email or password is wrong.");
    expect(alert).toHaveAttribute("data-slot", "alert");
    expect(alert).toHaveFocus();
  });

  it("renders nothing without a message", () => {
    const { container } = render(<ErrorStrip message={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("DateField (shadcn Popover + Calendar)", () => {
  function Harness({ initial = "", onChange }: { initial?: string; onChange?: (v: string) => void }) {
    const [value, setValue] = useState(initial);
    return (
      <DateField
        id="bday"
        label="Birthday"
        placeholder="Pick a date"
        clearLabel="Clear date"
        locale="en"
        disableFuture
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange?.(v);
        }}
      />
    );
  }

  it("round-trips ISO dates without a UTC day shift", () => {
    expect(toIsoDate(parseIsoDate("2000-05-15")!)).toBe("2000-05-15");
    expect(parseIsoDate("")).toBeUndefined();
    expect(parseIsoDate("2001-02-30")).toBeUndefined();
  });

  it("shows the placeholder and is not a native date input", () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: /Birthday/ });
    expect(trigger).toHaveTextContent("Pick a date");
    expect(document.querySelector('input[type="date"]')).toBeNull();
  });

  it("opens a calendar, selects a day and can clear it", async () => {
    const onChange = vi.fn();
    render(<Harness initial="2000-05-15" onChange={onChange} />);
    const trigger = screen.getByRole("button", { name: /Birthday/ });
    expect(trigger).toHaveAccessibleName("Birthday 15 May 2000");

    await userEvent.click(trigger);
    const grid = await screen.findByRole("grid");
    await userEvent.click(within(grid).getByRole("button", { name: /20 May 2000/ }));
    expect(onChange).toHaveBeenLastCalledWith("2000-05-20");
    expect(screen.getByRole("button", { name: /Birthday/ })).toHaveTextContent("20 May 2000");

    await userEvent.click(screen.getByRole("button", { name: /Birthday/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Clear date" }));
    expect(onChange).toHaveBeenLastCalledWith("");
    expect(screen.getByRole("button", { name: /Birthday/ })).toHaveTextContent("Pick a date");
  });
});

describe("required marker (form-required-indicator)", () => {
  const label = (id: string) => document.querySelector(`label[for="${id}"]`)!;

  it("TextField marks the label, forwards required and keeps the accessible name", () => {
    render(<TextField id="email" label="Email" required />);
    const input = screen.getByRole("textbox", { name: "Email" });
    expect(input).toBeRequired();
    expect(label("email")).toHaveAttribute("data-required", "true");
    expect(label("email").textContent).toBe("Email");
  });

  it("TextField without required has no marker", () => {
    render(<TextField id="tenant" label="Tenant" />);
    expect(screen.getByRole("textbox", { name: "Tenant" })).not.toBeRequired();
    expect(label("tenant")).not.toHaveAttribute("data-required");
  });

  it("PasswordField marks the label and forwards required", () => {
    render(<PasswordField id="pw" label="Password" showLabel="Show" hideLabel="Hide" required />);
    expect(screen.getByLabelText("Password")).toBeRequired();
    expect(label("pw")).toHaveAttribute("data-required", "true");
  });

  it("SelectField marks the label and forwards required", () => {
    render(<SelectField id="role" label="Role" required options={[{ value: "OWNER", label: "Owner" }]} />);
    expect(screen.getByRole("combobox", { name: "Role" })).toBeRequired();
    expect(label("role")).toHaveAttribute("data-required", "true");
  });

  function DateHarness({ required, hint, error }: { required?: boolean; hint?: string; error?: string }) {
    const common = { id: "d", label: "Date", placeholder: "Pick", clearLabel: "Clear", locale: "en" as const, value: "", onChange: () => {}, hint, error };
    return required ? <DateField {...common} required requiredText="Required" /> : <DateField {...common} />;
  }

  it("required DateField is described as Required and its label is marked", () => {
    render(<DateHarness required hint="Hint" error="Bad" />);
    const trigger = screen.getByRole("button", { name: /Date/ });
    const ids = trigger.getAttribute("aria-describedby")!.split(" ");
    expect(ids).toEqual(["d-required", "d-hint", "d-error"]);
    expect(document.getElementById("d-required")).toHaveTextContent("Required");
    expect(trigger).toHaveAccessibleName("Date Pick");
    expect(document.getElementById("d-label")).toHaveAttribute("data-required", "true");
  });

  it("optional DateField has no Required description or marker", () => {
    render(<DateHarness />);
    const trigger = screen.getByRole("button", { name: /Date/ });
    expect(trigger).not.toHaveAttribute("aria-describedby");
    expect(document.getElementById("d-required")).toBeNull();
    expect(document.getElementById("d-label")).not.toHaveAttribute("data-required");
  });

  it("read-only or disabled fields never show the marker, even with required", () => {
    render(
      <>
        <TextField id="ro" label="Read only" required readOnly />
        <PasswordField id="dis" label="Disabled" showLabel="Show" hideLabel="Hide" required disabled />
        <SelectField id="sel" label="Locked" required disabled options={[{ value: "a", label: "A" }]} />
      </>
    );
    for (const id of ["ro", "dis", "sel"]) expect(label(id), id).not.toHaveAttribute("data-required");
  });

  it("disabled DateField shows no marker and no Required description", () => {
    render(<DateField id="dd" label="Date" placeholder="Pick" clearLabel="Clear" locale="en" value="" onChange={() => {}} required requiredText="Required" disabled />);
    expect(document.getElementById("dd-label")).not.toHaveAttribute("data-required");
    expect(document.getElementById("dd-required")).toBeNull();
  });

  it("DateField type demands requiredText whenever required is set", () => {
    // @ts-expect-error requiredText is mandatory with required
    const el = <DateField id="t" label="T" placeholder="P" clearLabel="C" locale="en" value="" onChange={() => {}} required />;
    expect(el).toBeTruthy();
  });

  it("RequiredLegend renders '* text' hidden from assistive tech", () => {
    const { container } = render(<RequiredLegend text="Required" />);
    const p = container.querySelector("p")!;
    expect(p).toHaveTextContent("* Required");
    expect(p).toHaveAttribute("aria-hidden", "true");
    expect(p.className).toContain("text-xs");
  });

  it("requiredProps returns the data attribute only when required", () => {
    expect(requiredProps(true)).toEqual({ "data-required": "true" });
    expect(requiredProps(false)).toEqual({});
    expect(requiredProps(undefined)).toEqual({});
  });
});
