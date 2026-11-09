import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ErrorStrip } from "./error-strip";
import { DateField, PasswordField, SelectField, TextField, parseIsoDate, toIsoDate } from "./fields";

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
