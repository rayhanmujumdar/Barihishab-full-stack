import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/v1/openapi.json/route";

const EXPECTED: [string, string][] = [
  ["post", "/auth/login"],
  ["post", "/auth/logout"],
  ["post", "/auth/logout-all"],
  ["post", "/auth/refresh"],
  ["get", "/auth/session"],
  ["post", "/auth/forgot"],
  ["get", "/auth/reset/{token}"],
  ["post", "/auth/reset"],
  ["get", "/auth/invite/{token}"],
  ["post", "/auth/accept-invite"],
  ["get", "/me"],
  ["patch", "/me"],
  ["post", "/me/password"],
  ["get", "/me/sessions"],
  ["delete", "/me/sessions/{id}"],
  ["get", "/users"],
  ["post", "/users"],
  ["get", "/users/{id}"],
  ["patch", "/users/{id}"],
  ["put", "/users/{id}/roles"],
  ["post", "/users/{id}/deactivate"],
  ["post", "/users/{id}/reactivate"],
  ["post", "/users/{id}/resend-invite"],
  ["post", "/users/{id}/revoke-invite"],
  ["post", "/users/{id}/revoke-sessions"],
  ["get", "/audit"],
];

describe("GET /api/v1/openapi.json", () => {
  it("documents all 26 auth, me, users and audit operations", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(EXPECTED).toHaveLength(26);
    for (const [method, path] of EXPECTED) {
      expect(doc.paths[path]?.[method], `${method.toUpperCase()} ${path}`).toBeDefined();
    }
    expect(doc.components.securitySchemes).toHaveProperty("cookieAuth");
    expect(doc.components.securitySchemes).toHaveProperty("csrfHeader");
    expect(doc.components.schemas).toHaveProperty("PublicUser");
  });
});

const MONEY: [string, string][] = [
  ["get", "/periods"],
  ["get", "/units"],
  ["post", "/units"],
  ["patch", "/units/{id}"],
  ["get", "/fund-accounts"],
  ["post", "/fund-accounts"],
  ["patch", "/fund-accounts/{id}"],
  ["get", "/categories"],
  ["post", "/categories"],
  ["patch", "/categories/{id}"],
  ["get", "/transactions"],
  ["post", "/transactions"],
  ["get", "/transactions/summary"],
  ["get", "/transactions/vendors"],
  ["post", "/transactions/adjustments"],
  ["post", "/transactions/generate-rent/preview"],
  ["post", "/transactions/generate-rent"],
  ["get", "/transactions/{id}"],
  ["patch", "/transactions/{id}"],
  ["post", "/transactions/{id}/void"],
  ["post", "/transactions/{id}/attachments"],
  ["delete", "/transactions/{id}/attachments/{attId}"],
  ["post", "/attachments/presign"],
  ["get", "/attachments/{id}"],
];

describe("GET /api/v1/openapi.json — Income & Expenses", () => {
  it("documents all 24 periods, master-data, transactions and attachments operations", async () => {
    const doc = await (await GET()).json();
    expect(MONEY).toHaveLength(24);
    for (const [method, path] of MONEY) {
      expect(doc.paths[path]?.[method], `${method.toUpperCase()} ${path}`).toBeDefined();
    }
  });

  it("declares the Idempotency-Key header on every money-creating POST", async () => {
    const doc = await (await GET()).json();
    for (const path of ["/transactions", "/transactions/adjustments", "/transactions/generate-rent"]) {
      const names = (doc.paths[path].post.parameters ?? []).map((p: { name: string; in: string }) => `${p.in}:${p.name}`);
      expect(names, path).toContain("header:idempotency-key");
    }
  });
});

const OWNERS: [string, string][] = [
  ["get", "/owners"],
  ["post", "/owners"],
  ["get", "/owners/{id}"],
  ["patch", "/owners/{id}"],
  ["put", "/owners/{id}/opening"],
  ["get", "/owners/{id}/statement"],
  ["get", "/owners/shares"],
  ["post", "/owners/shares"],
  ["post", "/payouts"],
  ["post", "/advances"],
  ["post", "/adjustments"],
  ["post", "/ledger/{id}/void"],
];

describe("GET /api/v1/openapi.json — Owners", () => {
  it("documents all 12 owners, shares and ledger operations under the Owners tag", async () => {
    const doc = await (await GET()).json();
    for (const [method, path] of OWNERS) {
      expect(doc.paths[path]?.[method], `${method.toUpperCase()} ${path}`).toBeDefined();
      expect(doc.paths[path][method].tags).toEqual(["Owners"]);
    }
    expect(doc.components.schemas).toHaveProperty("LedgerEntry");
  });

  it("declares the Idempotency-Key header on owner money POSTs", async () => {
    const doc = await (await GET()).json();
    for (const path of ["/payouts", "/advances", "/adjustments", "/owners/shares"]) {
      const names = (doc.paths[path].post.parameters ?? []).map((p: { name: string; in: string }) => `${p.in}:${p.name}`);
      expect(names, path).toContain("header:idempotency-key");
    }
  });
});

const DISTRIBUTION: [string, string][] = [
  ["get", "/distribution"],
  ["get", "/periods/{month}/close-preview"],
  ["post", "/periods/{month}/close"],
  ["post", "/periods/{month}/reopen"],
  ["put", "/periods/{month}/reserve"],
  ["get", "/settings/reserve"],
  ["put", "/settings/reserve"],
];

describe("GET /api/v1/openapi.json — Distribution", () => {
  it("documents all 7 distribution, close, reopen and reserve operations under the Distribution tag", async () => {
    const doc = await (await GET()).json();
    for (const [method, path] of DISTRIBUTION) {
      expect(doc.paths[path]?.[method], `${method.toUpperCase()} ${path}`).toBeDefined();
      expect(doc.paths[path][method].tags).toEqual(["Distribution"]);
    }
    expect(doc.components.schemas).toHaveProperty("Distribution");
    expect(doc.components.schemas).toHaveProperty("ClosePreview");
  });

  it("documents the loan instalment endpoint and the payout instalment field", async () => {
    const doc = await (await GET()).json();
    expect(doc.paths["/loans/{id}"]?.patch?.tags).toEqual(["Owners"]);
    expect(doc.components.schemas.PayoutBody.properties).toHaveProperty("loanInstallmentPaisa");
    expect(doc.components.schemas.Loan.properties).toHaveProperty("installmentPaisa");
  });
});
