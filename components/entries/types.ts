// Plain, serialisable props the entries page hands to its client components.
import type { PeriodTotals } from "@/lib/accounting/totals";
import type { CategoryDto, FundAccountDto, UnitDto } from "@/lib/master-data/dto";
import type { PeriodDto } from "@/lib/periods/period-service";
import type { TxnDto } from "@/lib/transactions/dto";

export type Kind = "INCOME" | "EXPENSE";

export type SummaryChip = { id: string; kind: Kind; code: string; nameEn: string; nameBn: string; count: number; totalPaisa: number };

export type EntriesPerms = {
  create: boolean;
  update: boolean;
  void: boolean;
  adjust: boolean;
  superAdmin: boolean;
  /** `complaint.view`: show Questioned tags (Notices & Complaints C8). */
  complaints?: boolean;
  /** `complaint.create`: offer Raise an objection. */
  complain?: boolean;
};

export type EntriesData = {
  month: string;
  status: "OPEN" | "CLOSED" | null;
  periods: PeriodDto[];
  latestOpen: string | null;
  type: Kind;
  category: string;
  totals: PeriodTotals;
  chips: SummaryChip[];
  items: TxnDto[];
  nextCursor: string | null;
  totalPaisa: number;
  categories: CategoryDto[];
  units: UnitDto[];
  funds: FundAccountDto[];
  perms: EntriesPerms;
};

/** What the entry drawer and Generate-rent dialog need — Home opens them too (Home PRD F1). */
export type EntryFormData = Pick<EntriesData, "month" | "status" | "latestOpen" | "periods" | "categories" | "units" | "funds">;

export type { CategoryDto, FundAccountDto, PeriodDto, TxnDto, UnitDto };
