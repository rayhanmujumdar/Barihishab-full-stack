"use client";

// Labelled form fields composed from shadcn/ui primitives (Field, Input,
// NativeSelect, Button). Hint and error are linked via aria-describedby
// (Auth PRD §8 Accessibility).
import { CalendarDaysIcon, EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import { cn } from "cn";
import { useState, type ComponentProps, type ReactNode } from "react";
import { bn as bnDayPicker, enGB as enDayPicker } from "react-day-picker/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { todayIsoInDhaka } from "@/lib/clock";
import type { Locale } from "@/lib/i18n";

type Common = { id: string; label: ReactNode; hint?: ReactNode; error?: string | null; className?: string };

function describedBy(id: string, hint?: ReactNode, error?: string | null, required = false) {
  const ids = [required ? `${id}-required` : null, hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

/**
 * Required marker contract (form-required-indicator): a label with
 * `data-required="true"` gets a CSS `::after` "*" whose alt text is empty, so
 * the star is visible but never part of the accessible name. Spread onto a
 * shadcn `FieldLabel` / `FieldLegend` for fields not built from these helpers.
 */
export function requiredProps(required: boolean | undefined): { "data-required"?: "true" } {
  return required ? { "data-required": "true" } : {};
}

/** Browsers skip constraint validation on read-only and disabled controls, so those never count as required. */
function isEnforced(c: { required?: boolean; readOnly?: boolean; disabled?: boolean }): boolean {
  return Boolean(c.required && !c.readOnly && !c.disabled);
}

/** "* Required" note for forms that mix required and optional fields. Hidden from AT: each field already announces "required". */
export function RequiredLegend({ text }: { text: string }) {
  return (
    <p aria-hidden="true" className="m-0 text-xs text-muted-foreground">
      * {text}
    </p>
  );
}

const labelClass = "text-xs font-semibold text-muted-foreground";

function Messages({ id, hint, error }: { id: string; hint?: ReactNode; error?: string | null }) {
  return (
    <>
      {hint ? (
        <FieldDescription id={`${id}-hint`} className="text-xs">
          {hint}
        </FieldDescription>
      ) : null}
      {error ? (
        <FieldError id={`${id}-error`} className="text-xs font-semibold">
          {error}
        </FieldError>
      ) : null}
    </>
  );
}

export function TextField({ id, label, hint, error, className, ...input }: Common & Omit<ComponentProps<"input">, "id">) {
  return (
    <Field className={className}>
      <FieldLabel htmlFor={id} className={labelClass} {...requiredProps(isEnforced(input))}>
        {label}
      </FieldLabel>
      <Input id={id} name={input.name ?? id} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...input} />
      <Messages id={id} hint={hint} error={error} />
    </Field>
  );
}

export function PasswordField({
  id,
  label,
  hint,
  error,
  showLabel,
  hideLabel,
  className,
  ...input
}: Common & Omit<ComponentProps<"input">, "id"> & { showLabel: string; hideLabel: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <Field className={className}>
      <FieldLabel htmlFor={id} className={labelClass} {...requiredProps(isEnforced(input))}>
        {label}
      </FieldLabel>
      <div className="relative">
        <Input
          id={id}
          name={input.name ?? id}
          type={visible ? "text" : "password"}
          className="pr-12"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          {...input}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute inset-y-0 right-0"
          aria-label={visible ? hideLabel : showLabel}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeSlashIcon /> : <EyeIcon />}
        </Button>
      </div>
      <Messages id={id} hint={hint} error={error} />
    </Field>
  );
}

export function SelectField({
  id,
  label,
  hint,
  error,
  options,
  className,
  ...select
}: Common & Omit<ComponentProps<"select">, "id" | "size"> & { options: { value: string; label: string }[] }) {
  return (
    <Field className={className}>
      <FieldLabel htmlFor={id} className={labelClass} {...requiredProps(isEnforced(select))}>
        {label}
      </FieldLabel>
      <NativeSelect id={id} name={select.name ?? id} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...select}>
        {options.map((o) => (
          <NativeSelectOption key={o.value} value={o.value}>
            {o.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <Messages id={id} hint={hint} error={error} />
    </Field>
  );
}

/** "YYYY-MM-DD" → local-midnight Date (no UTC shift); `undefined` when empty or not a real date. */
export function parseIsoDate(value: string | null | undefined): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 ? d : undefined;
}

/** Local Date → "YYYY-MM-DD" (avoids toISOString's UTC day shift in Asia/Dhaka). */
export function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatLongDate(locale: Locale, d: Date): string {
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "long", year: "numeric" }).format(d);
}

type DateFieldProps = Common & {
  /** ISO "YYYY-MM-DD"; "" = no date. */
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  locale: Locale;
  clearLabel: string;
  disabled?: boolean;
  /** Block dates after today in Asia/Dhaka (same rule as the server, e.g. birthdays). */
  disableFuture?: boolean;
  /** Earliest year in the year dropdown. */
  fromYear?: number;
} & (
  | {
      /** Must have a value: marks the label and describes the trigger with `requiredText` (a button can't take `required`/`aria-required`). */
      required: true;
      /** Localized "Required" announced via aria-describedby. */
      requiredText: string;
    }
  | { required?: false; requiredText?: never }
);

/**
 * Date picker built from shadcn Popover + Calendar (replaces the native
 * <input type="date"> so the picker matches the design system and speaks bn).
 */
export function DateField({
  id,
  label,
  hint,
  error,
  className,
  value,
  onChange,
  placeholder,
  locale,
  disabled,
  required = false,
  requiredText,
  ...picker
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const enforced = isEnforced({ required, disabled });
  const selected = parseIsoDate(value);
  const display = selected ? formatLongDate(locale, selected) : null;

  return (
    <Field className={className}>
      <FieldLabel id={`${id}-label`} htmlFor={id} className={labelClass} {...requiredProps(enforced)}>
        {label}
      </FieldLabel>
      {enforced ? (
        <span id={`${id}-required`} className="sr-only">
          {requiredText}
        </span>
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            // Name = label + current value/placeholder ("Birthday, 15 May 2000").
            aria-labelledby={`${id}-label ${id}-value`}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(id, hint, error, enforced)}
            className={cn(
              "h-11 w-full justify-between border-input bg-card px-3 text-[15px] font-normal hover:bg-card focus-visible:border-foreground aria-invalid:border-destructive md:text-sm",
              !display && "text-muted-foreground"
            )}
          >
            <span id={`${id}-value`} className="truncate">
              {display ?? placeholder}
            </span>
            <CalendarDaysIcon aria-hidden className="size-4.5 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          collisionPadding={12}
          className="max-h-(--radix-popover-content-available-height) w-auto overflow-y-auto p-0"
        >
          <DatePickerPanel
            {...picker}
            locale={locale}
            selected={selected}
            onPick={(next) => {
              onChange(next);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      <Messages id={id} hint={hint} error={error} />
    </Field>
  );
}

function DatePickerPanel({
  locale,
  selected,
  onPick,
  clearLabel,
  disableFuture = false,
  fromYear = 1900,
}: Pick<DateFieldProps, "locale" | "clearLabel" | "disableFuture" | "fromYear"> & {
  selected: Date | undefined;
  onPick: (value: string) => void;
}) {
  const today = parseIsoDate(todayIsoInDhaka())!;
  return (
    <>
      <Calendar
        mode="single"
        captionLayout="dropdown"
        locale={locale === "bn" ? bnDayPicker : enDayPicker}
        numerals={locale === "bn" ? "beng" : "latn"}
        weekStartsOn={0}
        today={today}
        selected={selected}
        defaultMonth={selected ?? today}
        startMonth={new Date(fromYear, 0)}
        endMonth={disableFuture ? today : new Date(today.getFullYear() + 10, 11)}
        disabled={disableFuture ? { after: today } : undefined}
        onSelect={(d) => onPick(d ? toIsoDate(d) : "")}
        autoFocus
      />
      {selected ? (
        <div className="flex justify-start border-t border-border px-3 py-2">
          <Button type="button" variant="ghost" className="pl-0" onClick={() => onPick("")}>
            {clearLabel}
          </Button>
        </div>
      ) : null}
    </>
  );
}
