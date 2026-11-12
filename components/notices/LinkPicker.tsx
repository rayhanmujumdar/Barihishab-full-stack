"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { apiGet, queryErrorMessage } from "@/lib/api/query";
import { LINK_TYPES } from "@/lib/complaints/link-types";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { translator, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { linkCard } from "./format";
import type { LinkOption, LinkType } from "./types";

/** G9: type buttons Entry · Month · Payment/Advance · Loan · Request · Share change, searchable (debounced), or nothing specific. */
export function LinkPicker({
  locale,
  id,
  label,
  value,
  onChange,
}: {
  locale: Locale;
  id: string;
  label: string;
  value: LinkOption | null;
  onChange: (v: LinkOption | null) => void;
}) {
  const tr = translator(locale);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<LinkType>("ENTRY");
  const [q, setQ] = useState("");
  const query = useDebouncedValue(q.trim());
  const options = useQuery({
    queryKey: ["complaints", "links", type, query, locale],
    enabled: open,
    queryFn: () => apiGet<{ items: LinkOption[] }>(`/complaints/links?type=${type}&locale=${locale}${query ? `&q=${encodeURIComponent(query)}` : ""}`),
  });
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" aria-describedby={`${id}-value`}>
      <legend className="mb-1.5 text-xs font-semibold text-muted-foreground">{label}</legend>
      <div className="flex min-h-11 items-center justify-between gap-2 bg-[var(--color-surface)] px-3">
        <span id={`${id}-value`} className="text-sm font-semibold">
          {value ? linkCard(locale, value) : tr("nc.cf.nothing")}
        </span>
        <span className="flex gap-1">
          {value ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              {tr("nc.cf.nothing")}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="sm" aria-expanded={open} aria-controls={`${id}-panel`} onClick={() => setOpen((o) => !o)}>
            {tr("nc.cf.change")}
          </Button>
        </span>
      </div>
      {open ? (
        <div id={`${id}-panel`} className="flex flex-col gap-2 border-t-2 border-foreground pt-2">
          <div role="group" aria-label={tr("nc.cf.linkTypes")} className="flex flex-wrap gap-1">
            {LINK_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={type === t}
                onClick={() => setType(t)}
                className={cn("min-h-11 border border-[var(--color-divider)] px-3 text-sm font-semibold text-foreground", type === t ? "bg-foreground text-background" : "bg-transparent hover:bg-[var(--color-neutral-200)]")}
              >
                {tr(`nc.link.${t}`)}
              </button>
            ))}
          </div>
          <TextField id={`${id}-q`} label={tr("nc.cf.search")} type="search" value={q} onChange={(e) => setQ(e.target.value)} />
          {options.isFetching ? (
            <p role="status" className="muted m-0 text-sm">
              {tr("nc.cf.searching")}
            </p>
          ) : null}
          {options.isError ? <p className="m-0 text-sm font-semibold text-destructive">{queryErrorMessage(options.error, tr("common.network"))}</p> : null}
          {options.data ? (
            options.data.items.length ? (
              <ul className="m-0 flex max-h-64 list-none flex-col overflow-y-auto p-0">
                {options.data.items.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(o);
                        setOpen(false);
                      }}
                      className={cn("min-h-11 w-full border-b border-[var(--color-divider)] bg-transparent px-2 text-left text-sm text-foreground hover:bg-[var(--color-neutral-100)]", value?.id === o.id && "font-extrabold")}
                    >
                      {linkCard(locale, o)}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted m-0 text-sm">{tr("nc.cf.noResults")}</p>
            )
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}
