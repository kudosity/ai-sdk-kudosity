import { afterEach, describe, expect, it, vi } from "vitest";
import { kudositySendMms } from "../mms.js";
import { kudositySendRcs } from "../rcs.js";
import { kudosityTools } from "../index.js";
import { callTool, mockFetch } from "./helpers.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("kudositySendMms", () => {
  it("sends media URLs and optional fields to /v2/mms", async () => {
    const fetch = mockFetch(200, {
      id: "mms-1",
      status: "pending",
      recipient: "61491570156",
      sender: "61481074185",
      content_urls: ["https://example.com/a.png"],
    });
    const mms = kudositySendMms({
      apiKey: "k",
      defaultSender: "61481074185",
    });
    const out = await callTool(mms, {
      recipient: "61491570156",
      content_urls: ["https://example.com/a.png"],
      message: "look at this",
      subject: "hello",
    });

    const [url, init] = fetch.mock.calls[0] as unknown as [
      string,
      { body: string }
    ];
    expect(url).toBe("https://api.transmitmessage.com/v2/mms");
    expect(JSON.parse(init.body)).toEqual({
      recipient: "61491570156",
      content_urls: ["https://example.com/a.png"],
      sender: "61481074185",
      message: "look at this",
      subject: "hello",
    });
    expect(out.id).toBe("mms-1");
    expect(out.status).toBe("pending");
  });
});

describe("kudositySendRcs", () => {
  it("wraps text content, unwraps the data envelope, and applies the fallback sender", async () => {
    const fetch = mockFetch(200, {
      data: {
        id: "rcs-1",
        recipient: "61491570156",
        sender: "DemoSender",
        created_at: "2026-09-30T00:00:00Z",
      },
    });
    const rcs = kudositySendRcs({
      apiKey: "k",
      defaultSender: "DemoSender",
      defaultFallbackSender: "61481074185",
    });
    const out = await callTool(rcs, {
      recipient: "61491570156",
      message: "rich hello",
      sms_fallback_message: "plain hello",
    });

    const [url, init] = fetch.mock.calls[0] as unknown as [
      string,
      { body: string }
    ];
    expect(url).toBe("https://api.transmitmessage.com/v2/rcs/messages");
    expect(JSON.parse(init.body)).toEqual({
      sender: "DemoSender",
      recipient: "61491570156",
      content_type: "text",
      content: { text: { message: "rich hello" } },
      sms_fallback: {
        message: "plain hello",
        sender: "61481074185",
      },
    });
    expect(out.id).toBe("rcs-1");
    expect(out.sender).toBe("DemoSender");
  });

  it("omits sms_fallback entirely when no fallback message is supplied", async () => {
    const fetch = mockFetch(200, { data: { id: "rcs-2" } });
    const rcs = kudositySendRcs({
      apiKey: "k",
      defaultSender: "DemoSender",
      defaultFallbackSender: "61481074185",
    });
    await callTool(rcs, { recipient: "61491570156", message: "hi" });
    const body = JSON.parse(
      (fetch.mock.calls[0] as unknown as [string, { body: string }])[1].body
    );
    expect(body.sms_fallback).toBeUndefined();
  });
});

describe("kudosityTools", () => {
  it("returns the V2 tools keyed by tool name", () => {
    delete process.env.KUDOSITY_API_SECRET;
    const tools = kudosityTools({ apiKey: "k", defaultSender: "S" });
    expect(Object.keys(tools).sort()).toEqual([
      "kudosity_get_sms",
      "kudosity_list_sms",
      "kudosity_send_mms",
      "kudosity_send_rcs",
      "kudosity_send_sms",
    ]);
  });
});
