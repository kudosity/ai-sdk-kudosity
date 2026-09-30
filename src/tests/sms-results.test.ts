import { afterEach, describe, expect, it, vi } from "vitest";
import { kudosityGetSms, kudosityListSms } from "../sms.js";
import { callTool, mockFetch } from "./helpers.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("kudosityGetSms", () => {
  it("GETs /v2/sms/{id} with x-api-key and returns the message", async () => {
    const fetch = mockFetch(200, {
      id: "2d2c8fb6-e514-4f5f-9706-0672b0259218",
      status: "DELIVERED",
      recipient: "61491570156",
    });
    const out = await callTool(kudosityGetSms({ apiKey: "k" }), {
      id: "2d2c8fb6-e514-4f5f-9706-0672b0259218",
    });

    const [url, init] = fetch.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> }
    ];
    expect(url).toBe(
      "https://api.transmitmessage.com/v2/sms/2d2c8fb6-e514-4f5f-9706-0672b0259218"
    );
    expect(init.headers["x-api-key"]).toBe("k");
    expect(out.status).toBe("DELIVERED");
  });

  it("surfaces a 404 as a structured error", async () => {
    mockFetch(404, { error: "SMS not found" });
    const out = await callTool(kudosityGetSms({ apiKey: "k" }), { id: "nope" });
    expect(out.error).toMatch(/HTTP 404/);
  });
});

describe("kudosityListSms", () => {
  it("passes filters as query parameters, uppercasing the status", async () => {
    const fetch = mockFetch(200, { data: [], total: 0 });
    await callTool(kudosityListSms({ apiKey: "k" }), {
      limit: 10,
      // live API returns lowercase statuses but its filter demands uppercase
      status: "failed",
      start_date: "2026-09-01T00:00:00Z",
      message_ref: "order-42",
    });

    const url = new URL((fetch.mock.calls[0] as unknown as [string])[0]);
    expect(url.pathname).toBe("/v2/sms");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("status")).toBe("FAILED");
    expect(url.searchParams.get("start_date")).toBe("2026-09-01T00:00:00Z");
    expect(url.searchParams.get("message_ref")).toBe("order-42");
  });
});
