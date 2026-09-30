import { afterEach, describe, expect, it, vi } from "vitest";
import { kudositySendSms } from "../sms.js";
import { callTool, mockFetch } from "./helpers.js";

const okResponse = {
  id: "2d2c8fb6-e514-4f5f-9706-0672b0259218",
  recipient: "61491570156",
  sender: "61481074185",
  message: "hello",
  status: "queued",
  sms_count: "1",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("kudositySendSms", () => {
  it("throws without an API key", () => {
    delete process.env.KUDOSITY_API_KEY;
    expect(() => kudositySendSms()).toThrow(/KUDOSITY_API_KEY/);
  });

  it("sends to /v2/sms with x-api-key, UA tag and the default sender", async () => {
    const fetch = mockFetch(200, okResponse);
    const sms = kudositySendSms({
      apiKey: "test-key",
      defaultSender: "61481074185",
    });
    const out = await callTool(sms, {
      recipient: "61491570156",
      message: "hello",
    });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string>; body: string }
    ];
    expect(url).toBe("https://api.transmitmessage.com/v2/sms");
    expect(init.headers["x-api-key"]).toBe("test-key");
    expect(init.headers["User-Agent"]).toMatch(/^ai-sdk-kudosity\/\d/);
    expect(JSON.parse(init.body)).toEqual({
      recipient: "61491570156",
      message: "hello",
      sender: "61481074185",
    });
    expect(out.id).toBe(okResponse.id);
    expect(out.status).toBe("queued");
  });

  it("lets per-call sender override the default", async () => {
    const fetch = mockFetch(200, okResponse);
    const sms = kudositySendSms({ apiKey: "k", defaultSender: "DefaultCo" });
    await callTool(sms, {
      recipient: "61491570156",
      message: "hi",
      sender: "OtherCo",
    });
    const body = JSON.parse(
      (fetch.mock.calls[0] as unknown as [string, { body: string }])[1].body
    );
    expect(body.sender).toBe("OtherCo");
  });

  it("returns a structured error when no sender is available", async () => {
    mockFetch(200, okResponse);
    const sms = kudositySendSms({ apiKey: "k" });
    const out = await callTool(sms, {
      recipient: "61491570156",
      message: "hi",
    });
    expect(out.error).toMatch(/sender/i);
  });

  it("surfaces RFC 9457 error details on non-2xx", async () => {
    mockFetch(400, {
      error: {
        title: "Invalid Request",
        status: 400,
        issues: [{ name: "recipient", message: "recipient is invalid" }],
      },
    });
    const sms = kudositySendSms({ apiKey: "k", defaultSender: "S" });
    const out = await callTool(sms, { recipient: "nope", message: "hi" });
    expect(out.error).toMatch(/HTTP 400/);
    expect(out.detail.issues[0].name).toBe("recipient");
  });
});
