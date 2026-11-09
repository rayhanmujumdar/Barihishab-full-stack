import { z } from "zod";
import { ApiErrorSchema, apiSuccessSchema, jsonResponse } from "@/lib/api/openapi";
import { ActiveQuery, idParam, IsoDateSchema, NameSchema, readErrors, writeErrors } from "@/lib/api/money-schemas";
import { cookieAuth, cookieAuthRead } from "@/lib/api/schemas";
import { MAX_AMOUNT_PAISA } from "@/lib/money";
import { registry } from "../registry";

const FundTypeSchema = z.enum(["CASH", "BANK", "WALLET"]).meta({ id: "FundType" });

export const FundAccountSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    type: FundTypeSchema,
    openingBalancePaisa: z.number().int(),
    openingDate: IsoDateSchema,
    isActive: z.boolean(),
    balancePaisa: z.number().int().meta({ description: "opening + Σ income − Σ expense (non-voided)" }),
  })
  .meta({ id: "FundAccount" });

const fields = {
  name: NameSchema,
  type: FundTypeSchema,
  openingBalancePaisa: z.number().int().min(-MAX_AMOUNT_PAISA).max(MAX_AMOUNT_PAISA),
  openingDate: IsoDateSchema,
};

export const CreateFundBodySchema = z.object(fields).strict().meta({ id: "CreateFundAccountBody" });
export const PatchFundBodySchema = z
  .object({
    name: fields.name.optional(),
    type: fields.type.optional(),
    openingBalancePaisa: fields.openingBalancePaisa.optional(),
    openingDate: fields.openingDate.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .meta({ id: "PatchFundAccountBody" });
export const ListFundsQuerySchema = z.object({ active: ActiveQuery });
export const FundEnvelopeSchema = z.object({ fundAccount: FundAccountSchema }).meta({ id: "FundAccountEnvelope" });

registry.registerPath({
  method: "get",
  path: "/fund-accounts",
  tags: ["Master data"],
  summary: "List fund accounts with live balances",
  description: "Permission `transaction.view`.",
  security: cookieAuthRead,
  request: { query: ListFundsQuerySchema },
  responses: {
    200: jsonResponse("Fund accounts", apiSuccessSchema("FundAccountListResponse", z.object({ items: z.array(FundAccountSchema) }))),
    ...readErrors,
  },
});

registry.registerPath({
  method: "post",
  path: "/fund-accounts",
  tags: ["Master data"],
  summary: "Add a fund account (Cash / Bank / Wallet)",
  description: "Permission `fund.manage`.",
  security: cookieAuth,
  request: { body: { content: { "application/json": { schema: CreateFundBodySchema } } } },
  responses: { 201: jsonResponse("Created", apiSuccessSchema("CreateFundAccountResponse", FundEnvelopeSchema)), ...writeErrors },
});

registry.registerPath({
  method: "patch",
  path: "/fund-accounts/{id}",
  tags: ["Master data"],
  summary: "Edit or deactivate a fund account (deactivate only at zero balance)",
  description: "Permission `fund.manage`.",
  security: cookieAuth,
  request: { params: idParam, body: { content: { "application/json": { schema: PatchFundBodySchema } } } },
  responses: {
    200: jsonResponse("Updated", apiSuccessSchema("PatchFundAccountResponse", FundEnvelopeSchema)),
    ...writeErrors,
    404: jsonResponse("NOT_FOUND", ApiErrorSchema),
    409: jsonResponse("FUND_NOT_EMPTY", ApiErrorSchema),
  },
});
