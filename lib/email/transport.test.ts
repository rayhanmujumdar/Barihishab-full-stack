import { describe, expect, it } from "vitest";
import { EmailSendError } from "./errors";
import { ResendTransport, type ResendLike } from "./transport";

const msg = { to: "karim@example.com", subject: "s", html: "<p>h</p>", text: "t" };
const client = (send: ResendLike["emails"]["send"]): ResendLike => ({ emails: { send } });

describe("ResendTransport", () => {
  it("returns the provider id and passes the configured sender", async () => {
    let from = "";
    const t = new ResendTransport("re_key", "BariHisab <onboarding@resend.dev>", client(async (p) => {
      from = p.from;
      return { data: { id: "abc" }, error: null };
    }));
    await expect(t.send(msg)).resolves.toEqual({ id: "abc" });
    expect(from).toBe("BariHisab <onboarding@resend.dev>");
  });

  it("throws a permanent EmailSendError for an unverified sender", async () => {
    const t = new ResendTransport("re_key", "x@gmail.com", client(async () => ({
      data: null,
      error: { name: "validation_error", message: "The gmail.com domain is not verified.", statusCode: 403 },
    })));
    const err = await t.send(msg).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EmailSendError);
    expect(err).toMatchObject({ code: "SENDER_NOT_VERIFIED", permanent: true, statusCode: 403 });
  });

  it("treats a thrown network error as transient", async () => {
    const t = new ResendTransport("re_key", "a@b.com", client(async () => {
      throw new TypeError("fetch failed");
    }));
    await expect(t.send(msg)).rejects.toMatchObject({ code: "TRANSIENT", permanent: false });
  });
});
