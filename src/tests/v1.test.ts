import { afterEach, describe, expect, it, vi } from "vitest";
import { kudosityGetBalance } from "../account.js";
import {
  kudosityAddToList,
  kudosityCreateList,
  kudosityGetLists,
} from "../lists.js";
import { kudositySendSmsBatch } from "../send-batch.js";
import { kudosityTools } from "../index.js";
import { callTool, mockFetch } from "./helpers.js";

const creds = { apiKey: "key", apiSecret: "secret" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("V1 plumbing", () => {
  it("throws without an API secret", () => {
    delete process.env.KUDOSITY_API_SECRET;
    expect(() => kudosityGetBalance({ apiKey: "k" })).toThrow(
      /KUDOSITY_API_SECRET/
    );
  });

  it("sends Basic auth and the UA tag", async () => {
    const fetch = mockFetch(200, {
      balance: 100.5,
      currency: "AUD",
      error: { code: "SUCCESS", description: "OK" },
    });
    const out = await callTool(kudosityGetBalance(creds), {});

    const [url, init] = fetch.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> }
    ];
    expect(url).toBe("https://api.transmitsms.com/get-balance.json");
    expect(init.headers.Authorization).toBe(`Basic ${btoa("key:secret")}`);
    expect(init.headers["User-Agent"]).toMatch(/^ai-sdk-kudosity\/\d/);
    expect(out.balance).toBe(100.5);
    // the in-band SUCCESS marker is stripped from successful results
    expect(out.error).toBeUndefined();
  });

  it("surfaces a non-SUCCESS error code even on HTTP 200", async () => {
    mockFetch(200, {
      error: { code: "KEY_ERROR", description: "Invalid credentials" },
    });
    const out = await callTool(kudosityGetBalance(creds), {});
    expect(out.error).toMatch(/V1 API error/);
    expect(out.detail.code).toBe("KEY_ERROR");
  });
});

describe("kudosityCreateList", () => {
  it("posts form-encoded name and maps fields to field_N", async () => {
    const fetch = mockFetch(200, {
      id: 4213644,
      name: "My List",
      error: { code: "SUCCESS" },
    });
    const out = await callTool(kudosityCreateList(creds), {
      name: "My List",
      fields: ["email", "postcode"],
    });

    const [url, init] = fetch.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string>; body: string }
    ];
    expect(url).toBe("https://api.transmitsms.com/add-list.json");
    expect(init.headers["Content-Type"]).toBe(
      "application/x-www-form-urlencoded"
    );
    expect(init.body).toBe("name=My+List&field_1=email&field_2=postcode");
    expect(out.id).toBe(4213644);
  });
});

describe("kudosityAddToList", () => {
  it("posts contact details with countrycode", async () => {
    const fetch = mockFetch(200, { error: { code: "SUCCESS" } });
    await callTool(kudosityAddToList(creds), {
      list_id: 4213644,
      msisdn: "0491570156",
      countrycode: "AU",
      first_name: "John",
    });
    const body = (
      fetch.mock.calls[0] as unknown as [string, { body: string }]
    )[1].body;
    expect(body).toBe(
      "list_id=4213644&msisdn=0491570156&countrycode=AU&first_name=John"
    );
  });
});

describe("kudosityGetLists", () => {
  it("GETs with paging as query params", async () => {
    const fetch = mockFetch(200, { lists: [], error: { code: "SUCCESS" } });
    await callTool(kudosityGetLists(creds), { page: 2, max: 50 });
    const url = (fetch.mock.calls[0] as unknown as [string])[0];
    expect(url).toBe("https://api.transmitsms.com/get-lists.json?page=2&max=50");
  });
});

describe("kudositySendSmsBatch", () => {
  it("sends to a list with the default sender", async () => {
    const fetch = mockFetch(200, {
      message_id: 987,
      error: { code: "SUCCESS" },
    });
    const batch = kudositySendSmsBatch({
      ...creds,
      defaultSender: "61481074185",
    });
    const out = await callTool(batch, {
      message: "Sale starts tomorrow!",
      list_id: 4213644,
    });

    const [url, init] = fetch.mock.calls[0] as unknown as [
      string,
      { body: string }
    ];
    expect(url).toBe("https://api.transmitsms.com/send-sms.json");
    const params = new URLSearchParams(init.body);
    expect(params.get("message")).toBe("Sale starts tomorrow!");
    expect(params.get("list_id")).toBe("4213644");
    expect(params.get("from")).toBe("61481074185");
    expect(out.message_id).toBe(987);
  });

  it("rejects when neither or both of list_id and to are given", async () => {
    mockFetch(200, { error: { code: "SUCCESS" } });
    const batch = kudositySendSmsBatch(creds);
    const neither = await callTool(batch, { message: "hi" });
    expect(neither.error).toMatch(/list_id.*to/);
    const both = await callTool(batch, {
      message: "hi",
      list_id: 1,
      to: "61491570156",
    });
    expect(both.error).toMatch(/only one/i);
  });
});

describe("kudosityTools", () => {
  it("includes V1 tools only when an API secret is configured", () => {
    delete process.env.KUDOSITY_API_SECRET;
    const v2Only = kudosityTools({ apiKey: "k" });
    expect(Object.keys(v2Only).sort()).toEqual([
      "kudosity_get_sms",
      "kudosity_list_sms",
      "kudosity_send_mms",
      "kudosity_send_rcs",
      "kudosity_send_sms",
    ]);

    const full = kudosityTools(creds);
    expect(Object.keys(full).sort()).toEqual([
      "kudosity_add_to_list",
      "kudosity_create_list",
      "kudosity_get_balance",
      "kudosity_get_lists",
      "kudosity_get_sms",
      "kudosity_list_sms",
      "kudosity_send_mms",
      "kudosity_send_rcs",
      "kudosity_send_sms",
      "kudosity_send_sms_batch",
    ]);
  });
});
