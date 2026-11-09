import { describe, expect, it } from "vitest";
import { describeUserAgent } from "./user-agent";

describe("describeUserAgent", () => {
  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1", "iOS", "Safari"],
    ["Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36", "Android", "Chrome"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Gecko/20100101 Firefox/121.0", "Mac", "Firefox"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36 Edg/120.0", "Windows", "Edge"],
    ["Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0 Safari/537.36 OPR/106.0", "Linux", "Opera"],
    ["curl/8.4.0", "Unknown device", "Unknown browser"],
  ])("%s", (ua, device, browser) => {
    expect(describeUserAgent(ua)).toEqual({ device, browser });
  });

  it("handles a missing user agent", () => {
    expect(describeUserAgent(null)).toEqual({ device: "Unknown device", browser: "Unknown browser" });
  });
});
