"use client";

import { PlusIcon } from "@heroicons/react/24/outline";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { translator, type Locale } from "@/lib/i18n";
import type { EntryFormData, QuickActionsDto } from "./types";

// Loaded on first use so owners (who never see these) don't download them.
const EntryDrawer = dynamic(() => import("@/components/entries/EntryDrawer").then((m) => m.EntryDrawer));
const GenerateRentDialog = dynamic(() => import("@/components/entries/GenerateRentDialog").then((m) => m.GenerateRentDialog));

type Open = "INCOME" | "EXPENSE" | "RENT" | null;

function useEntryDialogs(locale: Locale, form: EntryFormData) {
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);
  // Home's blocks are server-rendered: a refresh re-streams every affected figure (F11).
  const saved = () => {
    setOpen(null);
    router.refresh();
  };
  const dialog =
    open === "RENT" ? (
      <GenerateRentDialog locale={locale} data={form} onClose={() => setOpen(null)} onSaved={saved} />
    ) : open ? (
      <EntryDrawer locale={locale} data={form} mode={{ kind: open }} onClose={() => setOpen(null)} onSaved={saved} />
    ) : null;
  return { setOpen, dialog };
}

/** Super Admin header buttons: Generate rent · + Income · + Expense, opened over Home (F1). */
export function QuickActions({ locale, actions, form }: { locale: Locale; actions: QuickActionsDto; form: EntryFormData }) {
  const tr = translator(locale);
  const { setOpen, dialog } = useEntryDialogs(locale, form);
  return (
    <div className="flex flex-wrap gap-2">
      {actions.generateRent ? (
        <Button variant="secondary" onClick={() => setOpen("RENT")}>
          {tr("home.qa.rent")}
        </Button>
      ) : null}
      <Button variant="secondary" onClick={() => setOpen("INCOME")}>
        <PlusIcon data-icon="inline-start" />
        {tr("home.qa.income")}
      </Button>
      <Button onClick={() => setOpen("EXPENSE")}>
        <PlusIcon data-icon="inline-start" />
        {tr("home.qa.expense")}
      </Button>
      {dialog}
    </div>
  );
}

/** The Rent status reminder's button (F6). */
export function RentButton({ locale, form }: { locale: Locale; form: EntryFormData }) {
  const { setOpen, dialog } = useEntryDialogs(locale, form);
  return (
    <>
      <Button onClick={() => setOpen("RENT")}>{translator(locale)("home.rem.generate")}</Button>
      {dialog}
    </>
  );
}
