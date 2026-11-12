import { describe, expect, it } from "vitest";
import {
  canEditComment,
  canPublish,
  canReopen,
  canSee,
  COMPLAINT_STATUSES,
  isLive,
  isUnseen,
  nextStatus,
  prefillTitle,
  resolutionAudience,
  type ComplaintAction,
} from "./rules";

const at = (iso: string) => new Date(iso);

describe("nextStatus", () => {
  const allowed: Record<string, Partial<Record<ComplaintAction, string>>> = {
    OPEN: { IN_REVIEW: "IN_REVIEW", RESOLVE: "RESOLVED", REJECT: "REJECTED", WITHDRAW: "WITHDRAWN" },
    IN_REVIEW: { RESOLVE: "RESOLVED", REJECT: "REJECTED", WITHDRAW: "WITHDRAWN" },
    RESOLVED: { REOPEN: "OPEN" },
    REJECTED: { REOPEN: "OPEN" },
    WITHDRAWN: {},
  };
  const actions: ComplaintAction[] = ["IN_REVIEW", "RESOLVE", "REJECT", "WITHDRAW", "REOPEN"];

  it("allows exactly the §4 lifecycle moves", () => {
    for (const status of COMPLAINT_STATUSES) {
      for (const action of actions) {
        expect(nextStatus(status, action), `${status} × ${action}`).toBe(allowed[status][action] ?? null);
      }
    }
  });
});

describe("isLive", () => {
  it("is true only for Open and In review", () => {
    expect(COMPLAINT_STATUSES.filter(isLive)).toEqual(["OPEN", "IN_REVIEW"]);
  });
});

describe("canSee", () => {
  const farzana = { userId: "farzana", viewAll: false };
  const rayhan = { userId: "rayhan", viewAll: true };
  const tanvir = { userId: "tanvir", viewAll: false };

  it("shows Everyone complaints to every member", () => {
    expect(canSee({ visibility: "ALL", createdById: "tanvir" }, farzana)).toBe(true);
  });

  it("shows Admin-only complaints to the author and view.all holders only (G18)", () => {
    const priv = { visibility: "ADMIN" as const, createdById: "tanvir" };
    expect(canSee(priv, tanvir)).toBe(true);
    expect(canSee(priv, rayhan)).toBe(true);
    expect(canSee(priv, farzana)).toBe(false);
  });
});

describe("canPublish", () => {
  it("only goes Admin only → Everyone, by the author", () => {
    expect(canPublish({ visibility: "ADMIN", createdById: "tanvir" }, "tanvir")).toBe(null);
    expect(canPublish({ visibility: "ADMIN", createdById: "tanvir" }, "rayhan")).toBe("FORBIDDEN");
    expect(canPublish({ visibility: "ALL", createdById: "tanvir" }, "tanvir")).toBe("INVALID_COMPLAINT_STATUS");
  });
});

describe("canReopen", () => {
  const closed = { status: "RESOLVED" as const, reopened: false, closedAt: at("2026-10-05T06:00:00Z") };

  it("allows the 14th day and refuses the 15th", () => {
    expect(canReopen(closed, at("2026-10-19T06:00:00Z"))).toBe(null);
    expect(canReopen(closed, at("2026-10-19T06:00:01Z"))).toBe("REOPEN_WINDOW_PASSED");
  });

  it("allows Rejected, refuses a second reopen and non-closed statuses", () => {
    expect(canReopen({ ...closed, status: "REJECTED" }, at("2026-10-06T00:00:00Z"))).toBe(null);
    expect(canReopen({ ...closed, reopened: true }, at("2026-10-06T00:00:00Z"))).toBe("INVALID_COMPLAINT_STATUS");
    expect(canReopen({ ...closed, status: "WITHDRAWN" }, at("2026-10-06T00:00:00Z"))).toBe("INVALID_COMPLAINT_STATUS");
    expect(canReopen({ status: "OPEN", reopened: false, closedAt: null }, at("2026-10-06T00:00:00Z"))).toBe("INVALID_COMPLAINT_STATUS");
  });
});

describe("canEditComment", () => {
  const c = { authorId: "tanvir", createdAt: at("2026-10-05T06:00:00Z"), hiddenAt: null };

  it("lets the author edit for 15 minutes", () => {
    expect(canEditComment(c, "tanvir", at("2026-10-05T06:14:59Z"))).toBe(null);
    expect(canEditComment(c, "tanvir", at("2026-10-05T06:15:00Z"))).toBe(null);
    expect(canEditComment(c, "tanvir", at("2026-10-05T06:15:01Z"))).toBe("EDIT_WINDOW_PASSED");
  });

  it("refuses other people and hidden comments", () => {
    expect(canEditComment(c, "farzana", at("2026-10-05T06:01:00Z"))).toBe("FORBIDDEN");
    expect(canEditComment({ ...c, hiddenAt: at("2026-10-05T06:02:00Z") }, "tanvir", at("2026-10-05T06:03:00Z"))).toBe("FORBIDDEN");
  });
});

describe("prefillTitle", () => {
  it("reads 'Question about {item} · {month}' in each language", () => {
    expect(prefillTitle("en", "Electricity", "September 2026")).toBe("Question about Electricity · September 2026");
    expect(prefillTitle("bn", "বিদ্যুৎ", "সেপ্টেম্বর ২০২৬")).toBe("বিদ্যুৎ · সেপ্টেম্বর ২০২৬ নিয়ে প্রশ্ন");
  });

  it("drops the month when there is none", () => {
    expect(prefillTitle("en", "Loan L2", null)).toBe("Question about Loan L2");
    expect(prefillTitle("bn", "ঋণ L2", null)).toBe("ঋণ L2 নিয়ে প্রশ্ন");
  });
});

describe("isUnseen", () => {
  const created = at("2026-10-04T00:00:00Z");

  it("is false for someone who doesn't take part", () => {
    expect(isUnseen({ isAuthor: false, createdAt: created, lastSeenAt: null, ownLastCommentAt: null }, [at("2026-10-05T00:00:00Z")])).toBe(false);
  });

  it("flags the author for a comment they haven't seen", () => {
    expect(isUnseen({ isAuthor: true, createdAt: created, lastSeenAt: null, ownLastCommentAt: null }, [at("2026-10-05T00:00:00Z")])).toBe(true);
    expect(isUnseen({ isAuthor: true, createdAt: created, lastSeenAt: at("2026-10-06T00:00:00Z"), ownLastCommentAt: null }, [at("2026-10-05T00:00:00Z")])).toBe(false);
  });

  it("counts a commenter's own later comment as seeing the thread", () => {
    expect(isUnseen({ isAuthor: false, createdAt: created, lastSeenAt: null, ownLastCommentAt: at("2026-10-06T00:00:00Z") }, [at("2026-10-05T00:00:00Z")])).toBe(false);
    expect(isUnseen({ isAuthor: false, createdAt: created, lastSeenAt: null, ownLastCommentAt: at("2026-10-04T12:00:00Z") }, [at("2026-10-05T00:00:00Z")])).toBe(true);
  });

  it("is false with no other comments", () => {
    expect(isUnseen({ isAuthor: true, createdAt: created, lastSeenAt: null, ownLastCommentAt: null }, [])).toBe(false);
  });
});

describe("resolutionAudience", () => {
  it("tells all members for Everyone complaints or ones about the Admin's own entry (Rule 13)", () => {
    expect(resolutionAudience({ visibility: "ALL", aboutAdmin: false })).toBe("ALL_MEMBERS");
    expect(resolutionAudience({ visibility: "ADMIN", aboutAdmin: true })).toBe("ALL_MEMBERS");
    expect(resolutionAudience({ visibility: "ADMIN", aboutAdmin: false })).toBe("COMPLAINANT");
  });
});
