"use client";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

/**
 * Labelled radio choice (design system segmented pickers: method, direction, owner type).
 * `variant="seg"` renders the design-system segmented control: equal cells, 1px divider
 * separators, checked cell = ink fill + paper text. The radio itself stays in the DOM
 * (visually hidden) so arrow-key navigation and label association are unchanged.
 */
export function Choice<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  variant = "radio",
}: {
  id: string;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  variant?: "radio" | "seg";
}) {
  const seg = variant === "seg";
  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${id}-label`} className="text-xs font-semibold text-muted-foreground">
        {label}
      </span>
      <RadioGroup
        aria-labelledby={`${id}-label`}
        value={value}
        onValueChange={(v) => onChange(v as T)}
        className={seg ? "grid gap-0 border border-[var(--color-divider)]" : "flex flex-wrap gap-x-5 gap-y-1"}
        style={seg ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined}
      >
        {options.map((o) =>
          seg ? (
            <div key={o.value} className="relative flex border-[var(--color-divider)] not-first:border-l">
              <RadioGroupItem value={o.value} id={`${id}-${o.value}`} className="peer absolute size-px overflow-hidden opacity-0 after:hidden" />
              <Label
                htmlFor={`${id}-${o.value}`}
                className="flex min-h-11 w-full cursor-pointer items-center justify-center px-2 text-sm font-bold transition-colors peer-data-[state=unchecked]:hover:bg-[var(--color-neutral-200)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--color-text)] peer-data-[state=checked]:bg-[var(--color-text)] peer-data-[state=checked]:text-[var(--color-bg)]"
              >
                {o.label}
              </Label>
            </div>
          ) : (
            <div key={o.value} className="flex min-h-11 items-center gap-2">
              <RadioGroupItem value={o.value} id={`${id}-${o.value}`} />
              <Label htmlFor={`${id}-${o.value}`} className="text-sm font-semibold">
                {o.label}
              </Label>
            </div>
          ),
        )}
      </RadioGroup>
    </div>
  );
}
