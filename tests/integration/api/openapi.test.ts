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
  ["get", "/attachments/{id}/file"],
];

describe("GET /api/v1/openapi.json — Income & Expenses", () => {
  it("documents all 25 periods, master-data, transactions and attachments operations", async () => {
    const doc = await (await GET()).json();
    expect(MONEY).toHaveLength(25);
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
    expect(doc.paths["/loans/{id}"]?.patch?.tags).toEqual(["Advances & loans"]);
    expect(doc.components.schemas.PayoutBody.properties).toHaveProperty("loanInstallmentPaisa");
    expect(doc.components.schemas.Loan.properties).toHaveProperty("installmentPaisa");
  });

  it("documents every Advances & Loans endpoint (Advances & Loans PRD)", async () => {
    const doc = await (await GET()).json();
    const LOANS: [string, string][] = [
      ["get", "/loans"],
      ["post", "/loans"],
      ["get", "/loans/{id}"],
      ["patch", "/loans/{id}"],
      ["post", "/loans/{id}/repayments"],
      ["post", "/loans/{id}/repayments/{repaymentId}/void"],
      ["post", "/loans/{id}/cancel"],
      ["post", "/loans/{id}/write-off"],
      ["get", "/advances"],
      ["get", "/advances/by-owner"],
      ["get", "/settings/advance-limit"],
      ["put", "/settings/advance-limit"],
    ];
    for (const [method, path] of LOANS) {
      expect(doc.paths[path]?.[method], `${method.toUpperCase()} ${path}`).toBeDefined();
      expect(doc.paths[path][method].tags, path).toEqual(["Advances & loans"]);
    }
    for (const name of ["LoanBody", "RepaymentBody", "LoanDetail", "LoanCard", "AdvanceRow", "AdvanceLimitSettings", "OwnerStanding"]) expect(doc.components.schemas, name).toHaveProperty(name);
    expect(doc.components.schemas.PatchLoanBody.required).toContain("reason");
    expect(doc.components.schemas.LoanStatus.enum).toContain("CANCELLED");
  });
});

describe("GET /api/v1/openapi.json — requests", () => {
  it("documents every Requests endpoint (Requests PRD)", async () => {
    const doc = await (await GET()).json();
    const REQUESTS: [string, string][] = [
      ["get", "/requests"],
      ["post", "/requests"],
      ["get", "/requests/form-context"],
      ["post", "/requests/seen"],
      ["get", "/requests/{id}"],
      ["patch", "/requests/{id}"],
      ["post", "/requests/{id}/cancel"],
      ["post", "/requests/{id}/approve"],
      ["post", "/requests/{id}/reject"],
      ["post", "/requests/{id}/withdraw"],
      ["post", "/requests/{id}/disburse"],
    ];
    for (const [method, path] of REQUESTS) {
      expect(doc.paths[path]?.[method], `${method.toUpperCase()} ${path}`).toBeDefined();
      expect(doc.paths[path][method].tags, path).toEqual(["Requests"]);
    }
    for (const name of ["MoneyRequest", "SubmitRequestBody", "EditRequestBody", "ApproveRequestBody", "RequestReasonBody", "DisburseRequestBody", "RequestDetail", "RequestFormContext"]) {
      expect(doc.components.schemas, name).toHaveProperty(name);
    }
    expect(doc.components.schemas.RequestStatus.enum).toContain("WITHDRAWN");
  });
});

describe("GET /api/v1/openapi.json — notices & complaints", () => {
  it("documents every Notices and Complaints endpoint (Notices & Complaints PRD)", async () => {
    const doc = await (await GET()).json();
    const NOTICES: [string, string][] = [
      ["get", "/notices"],
      ["post", "/notices"],
      ["patch", "/notices/{id}"],
      ["post", "/notices/{id}/archive"],
      ["post", "/notices/{id}/read"],
      ["post", "/notices/read-all"],
      ["get", "/notices/{id}/reads"],
      ["post", "/notices/{id}/remind"],
    ];
    const COMPLAINTS: [string, string][] = [
      ["get", "/complaints"],
      ["post", "/complaints"],
      ["get", "/complaints/{id}"],
      ["patch", "/complaints/{id}/status"],
      ["post", "/complaints/{id}/withdraw"],
      ["post", "/complaints/{id}/reopen"],
      ["post", "/complaints/{id}/publish"],
      ["post", "/complaints/{id}/seen"],
      ["post", "/complaints/{id}/comments"],
      ["patch", "/complaints/{id}/comments/{commentId}"],
      ["post", "/complaints/{id}/comments/{commentId}/hide"],
      ["get", "/complaints/links"],
      ["get", "/complaints/links/{type}/{id}"],
      ["get", "/complaints/questioned"],
    ];
    for (const [list, tag] of [[NOTICES, "Notices"], [COMPLAINTS, "Complaints"]] as const) {
      for (const [method, path] of list) {
        expect(doc.paths[path]?.[method], `${method.toUpperCase()} ${path}`).toBeDefined();
        expect(doc.paths[path][method].tags, path).toEqual([tag]);
      }
    }
    for (const name of ["Notice", "PublishNoticeBody", "EditNoticeBody", "Complaint", "ComplaintDetail", "RaiseComplaintBody", "SetComplaintStatusBody", "ComplaintLinkOption"]) {
      expect(doc.components.schemas, name).toHaveProperty(name);
    }
    expect(doc.components.schemas.ComplaintLinkType.enum).toEqual(["ENTRY", "MONTH", "LEDGER", "LOAN", "REQUEST", "SHARE_SET"]);
  });
});

describe("GET /api/v1/openapi.json — attachment viewing", () => {
  it("documents the same-origin file proxy and a metadata response without a signed URL", async () => {
    const doc = await (await GET()).json();
    const file = doc.paths["/attachments/{id}/file"]?.get;
    expect(file?.tags).toEqual(["Attachments"]);
    expect(Object.keys(file.responses)).toEqual(expect.arrayContaining(["200", "304", "401", "403", "404"]));
    expect(Object.keys(file.responses["200"].content)).toEqual(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
    expect((file.parameters ?? []).map((p: { name: string; in: string }) => `${p.in}:${p.name}`)).toEqual(expect.arrayContaining(["path:id", "query:download", "header:If-None-Match"]));
    const meta = doc.components.schemas.AttachmentUrl;
    expect(Object.keys(meta.properties).sort()).toEqual(["fileName", "mime", "url"]);
  });
});

describe("GET /api/v1/openapi.json — profile photo (add-profile-photo)", () => {
  it("documents the photo presign and avatarId/avatarUrl fields", async () => {
    const doc = await (await GET()).json();
    const op = doc.paths["/avatars/presign"]?.post;
    expect(op).toBeDefined();
    expect(Object.keys(op.responses)).toEqual(expect.arrayContaining(["201", "413", "422", "429"]));
    expect(doc.components.schemas.PublicUser.properties).toHaveProperty("avatarUrl");
    for (const body of ["PatchMeBody", "CreateUserBody", "PatchUserBody"]) {
      expect(doc.components.schemas[body].properties, body).toHaveProperty("avatarId");
    }
    expect(doc.components.schemas.AvatarPresignBody.properties.mime.enum).toEqual(["image/jpeg", "image/png", "image/webp"]);
  });
});

describe("GET /api/v1/openapi.json — Home (Home PRD, main PRD §9 GET /dashboard)", () => {
  it("documents the role-aware dashboard under the Home tag", async () => {
    const doc = await (await GET()).json();
    const op = doc.paths["/dashboard"]?.get;
    expect(op?.tags).toEqual(["Home"]);
    expect(Object.keys(op.responses)).toEqual(expect.arrayContaining(["200", "401"]));
    for (const name of ["Dashboard", "HomeMe", "HomeDesk", "HomeReconciliation", "HomeReminder", "HomeActivity", "HomeNotice", "HomeMyRequest"]) {
      expect(doc.components.schemas, name).toHaveProperty(name);
    }
  });
});

describe("GET /api/v1/openapi.json — Email delivery (fix-email-delivery)", () => {
  it("documents the outbox status endpoint and invite state on user list items", async () => {
    const doc = await (await GET()).json();
    const op = doc.paths["/email/outbox/status"]?.get;
    expect(op?.tags).toEqual(["Email"]);
    expect(Object.keys(op.responses)).toEqual(expect.arrayContaining(["200", "401", "403"]));
    expect(doc.components.schemas.OutboxStatus.properties).toHaveProperty("stalled");
    expect(doc.components.schemas.UserListItem.properties).toHaveProperty("inviteEmail");
    const invite = doc.components.schemas.UserListItem.properties.inviteEmail;
    expect(invite.properties.failureCode.enum).toEqual(expect.arrayContaining(["SENDER_NOT_VERIFIED", "RETRIES_EXHAUSTED"]));
    expect(invite.properties).not.toHaveProperty("lastError");
  });
});

describe("GET /api/v1/openapi.json — Reports (Reports PRD; main PRD §10 GET /reports/*)", () => {
  it("documents every report under the Reports tag, with CSV where offered", async () => {
    const doc = await (await GET()).json();
    for (const path of ["/reports/monthly", "/reports/yearly", "/reports/rent-roll", "/reports/expenses", "/reports/funds"]) {
      const op = doc.paths[path]?.get;
      expect(op?.tags, path).toEqual(["Reports"]);
      expect(Object.keys(op.responses), path).toEqual(expect.arrayContaining(["200", "401", "403", "422"]));
    }
    expect(Object.keys(doc.paths["/reports/monthly"].get.responses["200"].content)).toEqual(expect.arrayContaining(["application/json", "text/csv"]));
    expect(Object.keys(doc.paths["/reports/yearly"].get.responses["200"].content)).toEqual(expect.arrayContaining(["application/json", "text/csv"]));
    for (const name of ["MonthlyReport", "YearlyReport", "RentRoll", "ExpenseAnalysis", "FundsReport", "ReportCategory", "ReportMonthFigure"]) {
      expect(doc.components.schemas, name).toHaveProperty(name);
    }
  });
});
