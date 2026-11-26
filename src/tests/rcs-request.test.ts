import { describe, expect, it } from "vitest";
import {
  buildRcsRequest,
  MISSING_FALLBACK_SENDER_WARNING,
  rcsInputSchema,
} from "../rcs-request.js";

const options = { sender: "DemoSender", fallbackSender: "61481074185" };
const recipient = "61438333061";

function payload(input: Parameters<typeof buildRcsRequest>[0]) {
  const request = buildRcsRequest(input, options);
  if (!request.ok) throw new Error(JSON.stringify(request.error));
  return request.payload;
}

describe("buildRcsRequest", () => {
  it("builds a text message with suggested replies and a fallback", () => {
    expect(
      payload({
        recipient,
        message: "Your order 12345 is out for delivery.",
        suggestions: [
          { type: "reply", text: "Track order", postback_data: "order-12345:track" },
          { type: "reply", text: "Reschedule" },
        ],
        sms_fallback_message: "Your order 12345 is out for delivery.",
        message_ref: "order-12345",
      })
    ).toEqual({
      sender: "DemoSender",
      recipient,
      content_type: "text",
      content: {
        text: { message: "Your order 12345 is out for delivery." },
        suggestions: [
          { reply: { text: "Track order", postback_data: "order-12345:track" } },
          { reply: { text: "Reschedule" } },
        ],
      },
      sms_fallback: {
        message: "Your order 12345 is out for delivery.",
        sender: "61481074185",
      },
      message_ref: "order-12345",
    });
  });

  it("builds a media message", () => {
    expect(
      payload({ recipient, media_url: "https://cdn.example.com/a.jpg" })
    ).toEqual({
      sender: "DemoSender",
      recipient,
      content_type: "media",
      content: { media: { file_url: "https://cdn.example.com/a.jpg" } },
    });
  });

  it("builds a standalone rich card from one card", () => {
    expect(
      payload({
        recipient,
        cards: [
          {
            title: "Your table is booked",
            description: "Friday 7pm, table for two.",
            media_url: "https://cdn.example.com/table.jpg",
            suggestions: [
              { type: "open_url", text: "View booking", url: "https://example.com/b/1" },
              { type: "dial", text: "Call us", phone_number: "+61290000000" },
            ],
          },
        ],
      })
    ).toEqual({
      sender: "DemoSender",
      recipient,
      content_type: "rich_card",
      content: {
        rich_card: {
          standalone: {
            card_content: {
              title: "Your table is booked",
              description: "Friday 7pm, table for two.",
              media: { file_url: "https://cdn.example.com/table.jpg" },
              suggestions: [
                {
                  action: {
                    text: "View booking",
                    open_url_action: { url: "https://example.com/b/1" },
                  },
                },
                {
                  action: {
                    text: "Call us",
                    dial_action: { phone_number: "+61290000000" },
                  },
                },
              ],
            },
          },
        },
      },
    });
  });

  it("builds a carousel from two or more cards, with chips under it", () => {
    const body = payload({
      recipient,
      cards: [
        { title: "Classic tee", description: "$29" },
        { title: "Hoodie", description: "$59" },
      ],
      suggestions: [{ type: "reply", text: "See more", postback_data: "more" }],
    });
    expect(body.content_type).toBe("rich_card");
    expect(body.content).toEqual({
      rich_card: {
        carousel: {
          card_contents: [
            { title: "Classic tee", description: "$29" },
            { title: "Hoodie", description: "$59" },
          ],
        },
      },
      suggestions: [{ reply: { text: "See more", postback_data: "more" } }],
    });
  });

  it("leaves the fallback out and warns when no fallback sender is configured", () => {
    const request = buildRcsRequest(
      { recipient, message: "hi", sms_fallback_message: "hi by SMS" },
      { sender: "DemoSender" }
    );
    expect(request.ok).toBe(true);
    if (!request.ok) return;
    expect(request.payload).not.toHaveProperty("sms_fallback");
    expect(request.warning).toBe(MISSING_FALLBACK_SENDER_WARNING);
  });

  it("doesn't warn when no fallback was asked for", () => {
    const request = buildRcsRequest(
      { recipient, message: "hi" },
      { sender: "DemoSender" }
    );
    expect(request.ok && request.warning).toBeUndefined();
  });

  it("rejects input with no content, or with more than one kind", () => {
    for (const input of [
      { recipient },
      { recipient, message: "hi", media_url: "https://cdn.example.com/a.jpg" },
      { recipient, message: "hi", cards: [{ title: "A" }] },
    ]) {
      const request = buildRcsRequest(input, options);
      expect(request.ok).toBe(false);
      if (request.ok) continue;
      expect(request.error.issues[0]).toMatch(/exactly one of/);
    }
  });

  it("reports every incomplete card and suggestion at once", () => {
    const request = buildRcsRequest(
      {
        recipient,
        cards: [{ suggestions: [{ type: "open_url", text: "Open" }] }],
        suggestions: [{ type: "dial", text: "Call" }],
      },
      options
    );
    expect(request.ok).toBe(false);
    if (request.ok) return;
    expect(request.error.issues).toEqual([
      "cards[0]: a card needs at least one of `title`, `description` or `media_url`.",
      "cards[0].suggestions[0]: an 'open_url' suggestion needs `url`.",
      "suggestions[0]: a 'dial' suggestion needs `phone_number`.",
    ]);
  });
});

describe("rcsInputSchema", () => {
  it("enforces the API's limits on counts and label length", () => {
    const chip = { type: "reply" as const, text: "Yes" };
    const parse = (input: object) =>
      rcsInputSchema.safeParse({ recipient, ...input }).success;

    expect(parse({ message: "hi", suggestions: Array(11).fill(chip) })).toBe(true);
    expect(parse({ message: "hi", suggestions: Array(12).fill(chip) })).toBe(false);
    expect(parse({ cards: Array(11).fill({ title: "A" }) })).toBe(false);
    expect(
      parse({ cards: [{ title: "A", suggestions: Array(5).fill(chip) }] })
    ).toBe(false);
    expect(
      parse({ message: "hi", suggestions: [{ type: "reply", text: "x".repeat(26) }] })
    ).toBe(false);
  });
});
