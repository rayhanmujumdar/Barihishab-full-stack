import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DateField, TextField } from "@/components/forms/fields";
import { expectRequiredMarkersMatch } from "../helpers/required";

// Loosely typed on purpose: the helper must also catch a required DateField
// rendered without requiredText (only possible by bypassing the prop types).
const date = (props: { required?: boolean; requiredText?: string }) => (
  <DateField id="d" label="Date" placeholder="Pick" clearLabel="Clear" locale="en" value="" onChange={() => {}} {...(props as { required: true; requiredText: string })} />
);

describe("expectRequiredMarkersMatch", () => {
  it("passes on a correctly marked form", () => {
    const { container } = render(
      <form>
        <TextField id="a" label="A" required />
        <TextField id="b" label="B" />
        {date({ required: true, requiredText: "Required" })}
      </form>
    );
    expect(() => expectRequiredMarkersMatch(container)).not.toThrow();
  });

  it("fails on a required input whose label has no marker", () => {
    const { container } = render(
      <form>
        <label htmlFor="x">X</label>
        <input id="x" required />
      </form>
    );
    expect(() => expectRequiredMarkersMatch(container)).toThrow(/#x .*no marker/);
  });

  it("fails on a marked label whose control is not required", () => {
    const { container } = render(
      <form>
        <label htmlFor="y" data-slot="field-label" data-required="true">
          Y
        </label>
        <input id="y" />
      </form>
    );
    expect(() => expectRequiredMarkersMatch(container)).toThrow(/#y .*not required/);
  });

  it("treats read-only / disabled controls as not required (browsers skip their validation)", () => {
    const { container } = render(
      <form>
        <label htmlFor="ro">RO</label>
        <input id="ro" required readOnly />
      </form>
    );
    expect(() => expectRequiredMarkersMatch(container)).not.toThrow();
    const marked = render(
      <form>
        <label htmlFor="ro2" data-slot="field-label" data-required="true">
          RO
        </label>
        <input id="ro2" required readOnly />
      </form>
    );
    expect(() => expectRequiredMarkersMatch(marked.container)).toThrow(/#ro2 .*not required/);
  });

  it("fails on a required DateField without its Required description text", () => {
    const { container } = render(<form>{date({ required: true })}</form>);
    expect(() => expectRequiredMarkersMatch(container)).toThrow(/#d .*empty "Required" description/);
  });

  it("fails on a marked DateField label without the Required description", () => {
    const { container } = render(
      <form>
        <label id="d-label" htmlFor="d" data-slot="field-label" data-required="true">
          Date
        </label>
        <button id="d" type="button" aria-labelledby="d-label">
          Pick
        </button>
      </form>
    );
    expect(() => expectRequiredMarkersMatch(container)).toThrow(/#d .*not required/);
  });

  it("fails when the form has no controls at all to check (guards against vacuous passes)", () => {
    const { container } = render(<div />);
    expect(() => expectRequiredMarkersMatch(container)).toThrow(/no form controls/);
  });
});
