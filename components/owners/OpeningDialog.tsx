"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ErrorStrip } from "@/components/forms/error-strip";
import { RequiredLegend, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api/client";
import { translator, type Locale } from "@/lib/i18n";
import { parseAmount } from "@/lib/money";
import { Choice } from "./Choice";

/** Opening balance (F10): one entry per owner, editable until a month is closed. */
export function OpeningDialog({ locale, ownerId, onClose, onSaved }: { locale: Locale; ownerId: string; onClose: () => void; onSaved: () => void }) {
  const tr = translator(locale);
  const [sign, setSign] = useState<"plus" | "minus">("plus");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    const paisa = parseAmount(amount);
    if (!paisa) return setErr(tr("pay.err.amount"));
    setBusy(true);
    setError(null);
    const res = await apiFetch(`/owners/${ownerId}/opening`, { method: "PUT", body: { amountPaisa: sign === "plus" ? paisa : -paisa, note: note.trim() || null } });
    setBusy(false);
    if (!res.ok) return setError(res.status === 0 ? tr("common.network") : res.error.message);
    toast(tr("open.toast"));
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="gap-4 rounded-none sm:max-w-[480px]" lang={locale}>
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold">{tr("open.title")}</DialogTitle>
          <DialogDescription>{tr("open.body")}</DialogDescription>
        </DialogHeader>
        <form id="opening-form" className="form-stack" onSubmit={onSubmit} noValidate>
          <ErrorStrip message={error} />
          <RequiredLegend text={tr("common.required")} />
          <Choice
            id="open-sign"
            label={tr("open.direction")}
            value={sign}
            onChange={setSign}
            options={[
              { value: "plus", label: tr("open.owed") },
              { value: "minus", label: tr("open.advance") },
            ]}
          />
          <TextField
            id="open-amount"
            label={tr("open.amount")}
            required
            inputMode="decimal"
            autoComplete="off"
            className="[&_input]:amount-input"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setErr(null);
            }}
            error={err}
          />
          <TextField id="open-note" label={tr("open.note")} placeholder={tr("open.notePh")} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </form>
        <DialogFooter className="flex-row justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {tr("common.cancel")}
          </Button>
          <Button type="submit" form="opening-form" disabled={busy}>
            {tr("open.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
