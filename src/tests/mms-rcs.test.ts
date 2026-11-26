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

  it("sends a carousel and returns the content type", async () => {
    const fetch = mockFetch(200, {
      data: { id: "rcs-3", content_type: "rich_card" },
    });
    const rcs = kudositySendRcs({ apiKey: "k", defaultSender: "DemoSender" });
    const out = await callTool(rcs, {
      recipient: "61491570156",
      cards: [{ title: "Classic tee" }, { title: "Hoodie" }],
      suggestions: [{ type: "reply", text: "See more", postback_data: "more" }],
    });
    const body = JSON.parse(
      (fetch.mock.calls[0] as unknown as [string, { body: string }])[1].body
    );
    expect(body.content_type).toBe("rich_card");
    expect(body.content).toEqual({
      rich_card: {
        carousel: {
          card_contents: [{ title: "Classic tee" }, { title: "Hoodie" }],
        },
      },
      suggestions: [{ reply: { text: "See more", postback_data: "more" } }],
    });
    expect(out.content_type).toBe("rich_card");
  });

  it("sends without a fallback and warns when no fallback sender is configured", async () => {
    const fetch = mockFetch(200, { data: { id: "rcs-4" } });
    const rcs = kudositySendRcs({ apiKey: "k", defaultSender: "DemoSender" });
    const out = await callTool(rcs, {
      recipient: "61491570156",
      message: "hi",
      sms_fallback_message: "hi by SMS",
    });
    const body = JSON.parse(
      (fetch.mock.calls[0] as unknown as [string, { body: string }])[1].body
    );
    expect(body.sms_fallback).toBeUndefined();
    expect(out.id).toBe("rcs-4");
    expect(out.warning).toMatch(/fallback was NOT included/);
  });

  it("returns a readable error without calling the API when the content is invalid", async () => {
    const fetch = mockFetch(200, { data: { id: "x" } });
    const rcs = kudositySendRcs({ apiKey: "k", defaultSender: "DemoSender" });
    const out = await callTool(rcs, { recipient: "61491570156" });
    expect(fetch).not.toHaveBeenCalled();
    expect(out.issues[0]).toMatch(/exactly one of/);
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
