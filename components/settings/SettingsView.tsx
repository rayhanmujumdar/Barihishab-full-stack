"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowRightIcon, PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { categoryName } from "@/components/entries/format";
import { ErrorStrip } from "@/components/forms/error-strip";
import { DateField, RequiredLegend, SelectField, TextField } from "@/components/forms/fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { apiFetch, fieldErrors, type ApiResult } from "@/lib/api/client";
import { qk, useApiMutation } from "@/lib/api/query";
import { todayIsoInDhaka } from "@/lib/clock";
import { translator, type Locale, type MessageKey } from "@/lib/i18n";
import type { CategoryDto, FundAccountDto, UnitDto } from "@/lib/master-data/dto";
import { formatMoney, paisaToInput, parseAmount } from "@/lib/money";
import type { ReserveSettings as ReserveRule } from "@/lib/distribution/reserve-service";
import { ReserveSettings } from "./ReserveSettings";

type Can = { units: boolean; funds: boolean; categories: boolean };
type Kind = "INCOME" | "EXPENSE";
type Editing =
  | { type: "unit"; item: UnitDto | null }
  | { type: "fund"; item: FundAccountDto | null }
  | { type: "category"; kind: Kind; item: CategoryDto | null }
  | null;
type Deactivating = { path: string; name: string } | null;

const ERROR_KEY: Record<string, MessageKey> = {
  FUND_NOT_EMPTY: "settings.err.fundNotEmpty",
  NAME_TAKEN: "settings.err.nameTaken",
  CATEGORY_LOCKED: "settings.err.locked",
};

/** "0" / "" → 0, "-2,300" → −230000, else positive paisa (opening balances may be 0 or negative). */
function parseSigned(v: string): number | null {
  const s = v.trim();
  if (s === "" || /^[0০]+([.,][0০]*)?$/.test(s)) return 0;
  if (s.startsWith("-") || s.startsWith("−")) {
    const p = parseAmount(s.slice(1));
    return p === null ? null : -p;
  }
  return parseAmount(s);
}

/** Settings › master data (Income & Expenses PRD §6.6). Every change is re-checked by the API. */
export function SettingsView({
  locale,
  units,
  funds,
  categories,
  can,
  reserve = null,
}: {
  locale: Locale;
  units: UnitDto[];
  funds: FundAccountDto[];
  categories: CategoryDto[];
  can: Can;
  /** Reserve rule + balance, for users with `settings.manage` (Distribution PRD F9). */
  reserve?: { rule: ReserveRule; balancePaisa: number } | null;
}) {
  const tr = translator(locale);
  const router = useRouter();
  const toggleActive = useApiMutation(["master-data", "set-active"], (v: { path: string; isActive: boolean }) => apiFetch(v.path, { method: "PATCH", body: { isActive: v.isActive } }), { invalidate: [qk.transactions.all] });
  const [editing, setEditing] = useState<Editing>(null);
  const [deactivating, setDeactivating] = useState<Deactivating>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const message = (res: ApiResult<unknown>) =>
    res.ok ? null : res.status === 0 ? tr("common.network") : ERROR_KEY[res.error.code] ? tr(ERROR_KEY[res.error.code]) : res.error.message;

  async function setActive(path: string, isActive: boolean) {
    setBusy(true);
    setError(null);
    const res = await toggleActive.run({ path, isActive });
    setBusy(false);
    setDeactivating(null);
    if (!res.ok) return setError(message(res));
    toast(tr("settings.saved"));
    router.refresh();
  }

  const fundName = (id: string | null) => funds.find((f) => f.id === id)?.name;

  const actions = (name: string, path: string, active: boolean, onEdit: () => void) => (
    <div className="flex shrink-0 gap-1">
      <Button variant="ghost" onClick={onEdit} aria-label={tr("settings.edit", { name })}>
        {tr("settings.editShort")}
      </Button>
      {active ? (
        <Button variant="ghost" className="text-destructive" onClick={() => setDeactivating({ path, name })}>
          {tr("settings.deactivate")}
        </Button>
      ) : (
        <Button variant="ghost" onClick={() => setActive(path, true)} disabled={busy}>
          {tr("settings.activate")}
        </Button>
      )}
    </div>
  );

  return (
    <div className="page-stack" lang={locale}>
      <div>
        <p className="kicker">{tr("settings.kicker")}</p>
        <h1 className="page-title">{tr("settings.title")}</h1>
      </div>
      <ErrorStrip message={error} />

      {reserve ? <ReserveSettings locale={locale} rule={reserve.rule} balancePaisa={reserve.balancePaisa} /> : null}

      {can.units ? (
        <Section id="units" title={tr("settings.units")} addLabel={tr("settings.add")} onAdd={() => setEditing({ type: "unit", item: null })} empty={!units.length} emptyText={tr("settings.empty")}>
          {units.map((u) => (
            <Row key={u.id} name={u.name} inactive={!u.isActive} inactiveLabel={tr("settings.inactive")}>
              <span className="muted">
                {[u.tenantName, tr("settings.perMonth", { amount: formatMoney(locale, u.rentPaisa) }), fundName(u.defaultFundAccountId)].filter(Boolean).join(" · ")}
              </span>
              {actions(u.name, `/units/${u.id}`, u.isActive, () => setEditing({ type: "unit", item: u }))}
            </Row>
          ))}
        </Section>
      ) : null}

      {can.funds ? (
        <Section id="funds" title={tr("settings.funds")} addLabel={tr("settings.add")} onAdd={() => setEditing({ type: "fund", item: null })} empty={!funds.length} emptyText={tr("settings.empty")}>
          {funds.map((f) => (
            <Row key={f.id} name={f.name} inactive={!f.isActive} inactiveLabel={tr("settings.inactive")}>
              <span className="muted">
                {tr(`fund.type.${f.type}` as MessageKey)} · {tr("fund.balance")} <strong className={f.balancePaisa < 0 ? "text-destructive" : "text-foreground"}>{formatMoney(locale, f.balancePaisa)}</strong>
              </span>
              {actions(f.name, `/fund-accounts/${f.id}`, f.isActive, () => setEditing({ type: "fund", item: f }))}
            </Row>
          ))}
        </Section>
      ) : null}

      {can.categories
        ? (["INCOME", "EXPENSE"] as const).map((kind) => {
            const list = categories.filter((c) => c.kind === kind);
            return (
              <Section
                key={kind}
                id={`cat-${kind}`}
                title={tr(kind === "INCOME" ? "settings.incomeCats" : "settings.expenseCats")}
                addLabel={tr("settings.add")}
                onAdd={() => setEditing({ type: "category", kind, item: null })}
                empty={!list.length}
                emptyText={tr("settings.empty")}
              >
                {list.map((c) => (
                  <Row key={c.id} name={categoryName(locale, c)} inactive={!c.isActive} inactiveLabel={tr("settings.inactive")}>
                    <span className="muted">{locale === "bn" ? c.nameEn : c.nameBn}</span>
                    {c.isSystem ? <Badge variant="neutral">{tr("settings.system")}</Badge> : actions(categoryName(locale, c), `/categories/${c.id}`, c.isActive, () => setEditing({ type: "category", kind, item: c }))}
                  </Row>
                ))}
              </Section>
            );
          })
        : null}

      {editing ? (
        <EditSheet
          key={`${editing.type}-${editing.item?.id ?? "new"}`}
          locale={locale}
          editing={editing}
          funds={funds}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast(tr("settings.saved"));
            router.refresh();
          }}
          errorText={message}
        />
      ) : null}

      {deactivating ? (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeactivating(null)}
          title={tr("settings.confirm.title", { name: deactivating.name })}
          description={tr("settings.confirm.body")}
          confirmLabel={tr("settings.deactivate")}
          cancelLabel={tr("common.cancel")}
          busy={busy}
          onConfirm={() => setActive(deactivating.path, false)}
        />
      ) : null}
    </div>
  );
}

function Section({ id, title, addLabel, onAdd, empty, emptyText, children }: { id: string; title: string; addLabel: string; onAdd: () => void; empty: boolean; emptyText: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`}>
      <div className="section-head">
        <h2 id={`${id}-title`}>{title}</h2>
        <Button variant="outline" onClick={onAdd}>
          <PlusIcon data-icon="inline-start" />
          {addLabel}
        </Button>
      </div>
      {empty ? <p className="muted">{emptyText}</p> : <ul className="m-0 list-none p-0">{children}</ul>}
    </section>
  );
}

function Row({ name, inactive, inactiveLabel, children }: { name: string; inactive: boolean; inactiveLabel: string; children: ReactNode }) {
  const [detail, action] = Array.isArray(children) ? children : [children, null];
  return (
    <li className="list-row flex-wrap" aria-label={name}>
      <div className="flex min-w-0 flex-col">
        <span className={inactive ? "font-bold text-[var(--color-neutral-600)]" : "font-bold"}>
          {name} {inactive ? <Badge variant="neutral">{inactiveLabel}</Badge> : null}
        </span>
        {detail}
      </div>
      {action}
    </li>
  );
}

function EditSheet({
  locale,
  editing,
  funds,
  onClose,
  onSaved,
  errorText,
}: {
  locale: Locale;
  editing: NonNullable<Editing>;
  funds: FundAccountDto[];
  onClose: () => void;
  onSaved: () => void;
  errorText: (res: ApiResult<unknown>) => string | null;
}) {
  const tr = translator(locale);
  const unit = editing.type === "unit" ? editing.item : null;
  const fund = editing.type === "fund" ? editing.item : null;
  const cat = editing.type === "category" ? editing.item : null;
  const [f, setF] = useState({
    name: unit?.name ?? fund?.name ?? "",
    tenantName: unit?.tenantName ?? "",
    rent: unit ? paisaToInput(unit.rentPaisa) : "",
    defaultFundAccountId: unit?.defaultFundAccountId ?? "",
    type: fund?.type ?? "CASH",
    opening: fund ? (fund.openingBalancePaisa < 0 ? `-${paisaToInput(-fund.openingBalancePaisa)}` : paisaToInput(fund.openingBalancePaisa)) : "0",
    openingDate: fund?.openingDate ?? todayIsoInDhaka(),
    nameEn: cat?.nameEn ?? "",
    nameBn: cat?.nameBn ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Cached transaction lists/details embed category, fund and unit names.
  const saveMaster = useApiMutation(["master-data", "save"], (v: { path: string; method: string; body: Record<string, unknown> }) => apiFetch(v.path, { method: v.method, body: v.body }), { invalidate: [qk.transactions.all] });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const required = tr("settings.err.required");

  function build(): { path: string; method: string; body: Record<string, unknown> } | Record<string, string> {
    if (editing.type === "unit") {
      const rentPaisa = parseSigned(f.rent || "0");
      const e: Record<string, string> = {};
      if (!f.name.trim()) e.name = required;
      if (rentPaisa === null || rentPaisa < 0) e.rentPaisa = tr("settings.err.amount");
      if (Object.keys(e).length) return e;
      const body = { name: f.name.trim(), tenantName: f.tenantName.trim() || null, rentPaisa, defaultFundAccountId: f.defaultFundAccountId || null };
      return unit ? { path: `/units/${unit.id}`, method: "PATCH", body } : { path: "/units", method: "POST", body };
    }
    if (editing.type === "fund") {
      const openingBalancePaisa = parseSigned(f.opening);
      const e: Record<string, string> = {};
      if (!f.name.trim()) e.name = required;
      if (openingBalancePaisa === null) e.openingBalancePaisa = tr("settings.err.amount");
      if (!f.openingDate) e.openingDate = required;
      if (Object.keys(e).length) return e;
      const body = { name: f.name.trim(), type: f.type, openingBalancePaisa, openingDate: f.openingDate };
      return fund ? { path: `/fund-accounts/${fund.id}`, method: "PATCH", body } : { path: "/fund-accounts", method: "POST", body };
    }
    const e: Record<string, string> = {};
    if (!f.nameEn.trim()) e.nameEn = required;
    if (!f.nameBn.trim()) e.nameBn = required;
    if (Object.keys(e).length) return e;
    const names = { nameEn: f.nameEn.trim(), nameBn: f.nameBn.trim() };
    return cat ? { path: `/categories/${cat.id}`, method: "PATCH", body: names } : { path: "/categories", method: "POST", body: { kind: editing.kind, ...names } };
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    const req = build();
    if (!("path" in req)) return setErrors(req as Record<string, string>);
    setErrors({});
    setPending(true);
    setError(null);
    const res = await saveMaster.run({ path: req.path as string, method: req.method as string, body: req.body as Record<string, unknown> });
    setPending(false);
    if (!res.ok) {
      const fields = fieldErrors(res);
      if (Object.keys(fields).length) setErrors(Object.fromEntries(Object.keys(fields).map((k) => [k, tr(k === "rentPaisa" || k === "openingBalancePaisa" ? "settings.err.amount" : "settings.err.required")])));
      else setError(errorText(res));
      return;
    }
    onSaved();
  }

  const title =
    editing.type === "unit"
      ? unit ? tr("settings.edit", { name: unit.name }) : tr("settings.new.unit")
      : editing.type === "fund"
        ? fund ? tr("settings.edit", { name: fund.name }) : tr("settings.new.fund")
        : cat ? tr("settings.edit", { name: cat.nameEn }) : tr("settings.new.category");
  const formId = "master-form";

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" showCloseButton={false} aria-describedby={undefined} className="w-full gap-0 border-l-2 border-foreground bg-background p-0 sm:max-w-[540px]">
        <SheetHeader className="flex-row items-center justify-between gap-3 border-b-2 border-foreground px-5 py-4">
          <SheetTitle className="text-[22px] font-extrabold tracking-[-0.015em]">{title}</SheetTitle>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" aria-label={tr("common.close")}>
              <XMarkIcon />
            </Button>
          </SheetClose>
        </SheetHeader>
        <form id={formId} className="form-stack flex-1 overflow-y-auto p-5" onSubmit={onSubmit} noValidate lang={locale}>
          <ErrorStrip message={error} />
          {editing.type === "unit" ? (
            <>
              <RequiredLegend text={tr("common.required")} />
              <TextField id="m-name" label={tr("unit.name")} placeholder={tr("unit.ph.name")} maxLength={60} value={f.name} onChange={(e) => set("name", e.target.value)} error={errors.name} required />
              <TextField id="m-tenant" label={tr("unit.tenant")} placeholder={tr("unit.ph.tenant")} maxLength={100} value={f.tenantName} onChange={(e) => set("tenantName", e.target.value)} />
              <TextField id="m-rent" label={tr("unit.rent")} inputMode="decimal" value={f.rent} onChange={(e) => set("rent", e.target.value)} error={errors.rentPaisa} />
              <SelectField
                id="m-fund"
                label={tr("unit.fund")}
                value={f.defaultFundAccountId}
                onChange={(e) => set("defaultFundAccountId", e.target.value)}
                options={[{ value: "", label: tr("unit.none") }, ...funds.filter((x) => x.isActive).map((x) => ({ value: x.id, label: x.name }))]}
              />
            </>
          ) : editing.type === "fund" ? (
            <>
              <RequiredLegend text={tr("common.required")} />
              <TextField id="m-name" label={tr("fund.name")} placeholder={tr("fund.ph.name")} maxLength={60} value={f.name} onChange={(e) => set("name", e.target.value)} error={errors.name} required />
              <SelectField
                id="m-type"
                label={tr("fund.type")}
                required
                value={f.type}
                onChange={(e) => set("type", e.target.value)}
                options={(["CASH", "BANK", "WALLET"] as const).map((t) => ({ value: t, label: tr(`fund.type.${t}`) }))}
              />
              <div className="grid-2">
                <TextField id="m-opening" label={tr("fund.opening")} inputMode="decimal" value={f.opening} onChange={(e) => set("opening", e.target.value)} error={errors.openingBalancePaisa} />
                <DateField id="m-opening-date" label={tr("fund.openingDate")} placeholder={tr("entry.ph.date")} clearLabel={tr("common.clear")} locale={locale} fromYear={2000} required requiredText={tr("common.required")} value={f.openingDate} onChange={(v) => set("openingDate", v)} error={errors.openingDate} />
              </div>
            </>
          ) : (
            <>
              <TextField id="m-name-en" label={tr("cat.nameEn")} maxLength={60} value={f.nameEn} onChange={(e) => set("nameEn", e.target.value)} error={errors.nameEn} required />
              <TextField id="m-name-bn" label={tr("cat.nameBn")} maxLength={60} value={f.nameBn} onChange={(e) => set("nameBn", e.target.value)} error={errors.nameBn} required lang="bn" />
            </>
          )}
        </form>
        <SheetFooter className="flex-row justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose}>
            {tr("common.cancel")}
          </Button>
          <Button type="submit" form={formId} disabled={pending}>
            {tr("common.save")}
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
