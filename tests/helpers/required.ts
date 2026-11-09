// Drift guard for the form-required-indicator contract: the visible "*" marker
// (a label with data-required="true") and the real required semantics
// (native `required`, or a "-required" aria-describedby text on controls that
// can't take it, like the DateField trigger button) must always match.

const CONTROLS = "input:not([type=hidden]), select, textarea, button[aria-labelledby]";

function requiredDescription(control: Element): HTMLElement | null {
  const ids = (control.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
  const id = ids.find((x) => x.endsWith("-required"));
  return id ? control.ownerDocument.getElementById(id) : null;
}

function isRequired(control: Element): boolean {
  const c = control as HTMLInputElement;
  // Browsers skip validation on read-only / disabled controls, so `required` there means nothing.
  if (c.required) return !c.readOnly && !c.disabled;
  return Boolean(requiredDescription(control)?.textContent?.trim());
}

function labelFor(control: Element): Element | null {
  const doc = control.ownerDocument;
  if (control.id) {
    const byFor = doc.querySelector(`label[for="${CSS.escape(control.id)}"]`);
    if (byFor) return byFor;
  }
  const labelledBy = control.getAttribute("aria-labelledby")?.split(/\s+/)[0];
  return labelledBy ? doc.getElementById(labelledBy) : control.closest("label");
}

function describe(el: Element): string {
  return el.id ? `#${el.id}` : `<${el.tagName.toLowerCase()} name="${el.getAttribute("name") ?? ""}">`;
}

/**
 * Throws, listing every mismatch, when a required control has no marked label
 * or a marked label belongs to a control that is not required.
 */
export function expectRequiredMarkersMatch(container: HTMLElement): void {
  const problems: string[] = [];
  const controls = [...container.querySelectorAll(CONTROLS)].filter((c) => labelFor(c));
  if (!controls.length) throw new Error("expectRequiredMarkersMatch: no form controls with labels found");

  for (const control of controls) {
    const desc = requiredDescription(control);
    if (desc && !desc.textContent?.trim()) problems.push(`${describe(control)} has an empty "Required" description`);
    const label = labelFor(control)!;
    const marked = label.getAttribute("data-required") === "true";
    const required = isRequired(control);
    if (required && !marked) problems.push(`${describe(control)} is required but its label has no marker`);
    if (marked && !required) problems.push(`${describe(control)} has a marked label but is not required`);
  }

  // Marked labels/legends that point at no checked control at all.
  for (const label of container.querySelectorAll('[data-required="true"]')) {
    if (label.tagName === "LEGEND") {
      const fieldset = label.closest("fieldset");
      const hasRequired = fieldset ? [...fieldset.querySelectorAll(CONTROLS)].some(isRequired) : false;
      if (!hasRequired) problems.push(`legend "${label.textContent}" is marked but its fieldset has no required control`);
      continue;
    }
    if (!controls.some((c) => labelFor(c) === label)) problems.push(`label "${label.textContent}" is marked but labels no control`);
  }

  if (problems.length) throw new Error(`Required marker mismatch:\n- ${problems.join("\n- ")}`);
}
