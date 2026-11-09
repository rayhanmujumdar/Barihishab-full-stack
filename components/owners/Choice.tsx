"use client";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

/** Labelled radio choice (design system segmented pickers: method, direction, owner type). */
export function Choice<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${id}-label`} className="text-xs font-semibold text-muted-foreground">
        {label}
      </span>
      <RadioGroup aria-labelledby={`${id}-label`} value={value} onValueChange={(v) => onChange(v as T)} className="flex flex-wrap gap-x-5 gap-y-1">
        {options.map((o) => (
          <div key={o.value} className="flex min-h-11 items-center gap-2">
            <RadioGroupItem value={o.value} id={`${id}-${o.value}`} />
            <Label htmlFor={`${id}-${o.value}`} className="text-sm font-semibold">
              {o.label}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}
