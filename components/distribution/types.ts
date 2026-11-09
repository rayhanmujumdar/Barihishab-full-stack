// Data handed from the Distribution page (server) to its client views.
import type { ChangesDto, ClosePreviewDto, DistributionDto, DistributionResult } from "@/lib/distribution/distribution-service";
import type { FundLite } from "@/components/owners/types";

export type { ChangesDto, ClosePreviewDto, DistributionDto, DistributionResult, FundLite };
export type BoardRow = DistributionDto["rows"][number];
export type DistPerms = { close: boolean; reopen: boolean; override: boolean; pay: boolean; shares: boolean };
