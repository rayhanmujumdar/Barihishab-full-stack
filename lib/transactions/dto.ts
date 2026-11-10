// The shapes in which income/expense entries leave the API (camelCase,
// money as number paisa, dates ISO, periods YYYY-MM).
import type { Prisma } from "@/lib/generated/prisma/client";
import { monthKey } from "@/lib/periods/month";

export const TXN_INCLUDE = {
  period: { select: { month: true, status: true } },
  referencePeriod: { select: { month: true } },
  category: { select: { code: true, nameEn: true, nameBn: true } },
  unit: { select: { name: true, tenantName: true } },
  fundAccount: { select: { name: true } },
} as const satisfies Prisma.HouseTransactionInclude;

export type TxnRow = Prisma.HouseTransactionGetPayload<{ include: typeof TXN_INCLUDE }>;

export type TxnDto = {
  id: string;
  period: string;
  periodStatus: "OPEN" | "CLOSED";
  kind: "INCOME" | "EXPENSE";
  categoryId: string;
  category: { code: string; nameEn: string; nameBn: string };
  unitId: string | null;
  unitName: string | null;
  amountPaisa: number;
  txnDate: string;
  fundAccountId: string;
  fundAccountName: string;
  vendor: string | null;
  description: string | null;
  fromReserve: boolean;
  referencePeriod: string | null;
  source: "MANUAL" | "GENERATED_RENT" | "ADJUSTMENT" | "LOAN_WRITE_OFF";
  isCorrected: boolean;
  voidedAt: string | null;
  voidReason: string | null;
  attachmentCount: number;
  createdAt: string;
};

export function toTxnDto(t: TxnRow, attachmentCount = 0): TxnDto {
  return {
    id: t.id,
    period: monthKey(t.period.month),
    periodStatus: t.period.status,
    kind: t.kind,
    categoryId: t.categoryId,
    category: t.category,
    unitId: t.unitId,
    unitName: t.unit?.name ?? null,
    amountPaisa: Number(t.amountPaisa),
    txnDate: t.txnDate.toISOString().slice(0, 10),
    fundAccountId: t.fundAccountId,
    fundAccountName: t.fundAccount.name,
    vendor: t.vendor,
    description: t.description,
    fromReserve: t.fromReserve,
    referencePeriod: t.referencePeriod ? monthKey(t.referencePeriod.month) : null,
    source: t.source,
    isCorrected: t.isCorrected,
    voidedAt: t.voidedAt?.toISOString() ?? null,
    voidReason: t.voidReason,
    attachmentCount,
    createdAt: t.createdAt.toISOString(),
  };
}

/** Fields compared for "changed fields only" audit rows. */
export function auditView(d: TxnDto) {
  return {
    period: d.period,
    categoryId: d.categoryId,
    unitId: d.unitId,
    amountPaisa: d.amountPaisa,
    txnDate: d.txnDate,
    fundAccountId: d.fundAccountId,
    vendor: d.vendor,
    description: d.description,
    fromReserve: d.fromReserve,
    referencePeriod: d.referencePeriod,
  };
}
