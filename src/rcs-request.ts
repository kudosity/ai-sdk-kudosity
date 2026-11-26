import { z } from "zod";

const suggestionSchema = z.object({
  type: z
    .enum(["reply", "open_url", "dial"])
    .describe(
      "'reply' sends the label back to you as a message when tapped. 'open_url' opens a link. 'dial' starts a phone call."
    ),
  text: z
    .string()
    .min(1)
    .max(25)
    .describe("The label on the chip or button, 1 to 25 characters."),
  url: z
    .string()
    .max(2048)
    .optional()
    .describe("Required for 'open_url': an absolute https URL."),
  phone_number: z
    .string()
    .optional()
    .describe(
      "Required for 'dial': the number to call, in E.164 international format, e.g. +61290000000."
    ),
  postback_data: z
    .string()
    .max(2048)
    .optional()
    .describe(
      "Optional value of your own, returned in the RCS_INBOUND webhook when the suggestion is tapped, e.g. 'order-12345:track'. Route on this, not on the label."
    ),
});

const cardSchema = z.object({
  title: z
    .string()
    .max(200)
    .optional()
    .describe("The card's title, up to 200 characters."),
  description: z
    .string()
    .max(2000)
    .optional()
    .describe("The card's body text, up to 2000 characters."),
  media_url: z
    .string()
    .max(2048)
    .optional()
    .describe(
      "Public https URL of the card's image or video. The URL must not redirect."
    ),
  suggestions: z
    .array(suggestionSchema)
    .max(4)
    .optional()
    .describe("Up to 4 buttons shown on this card."),
});

/**
 * Tool input for an RCS send. The input is flat so that any model can fill
 * it in: set exactly one of `message`, `media_url` or `cards`.
 */
export const rcsInputSchema = z.object({
  recipient: z
    .string()
    .describe(
      "Destination phone number in E.164 international format, e.g. 61491570156. Local format, such as 0491 570 156, is rejected."
    ),
  message: z
    .string()
    .max(3072)
    .optional()
    .describe(
      "For a text message: the text to send, up to 3072 characters. Set exactly one of `message`, `media_url` or `cards`."
    ),
  media_url: z
    .string()
    .max(2048)
    .optional()
    .describe(
      "For an image or video on its own: its public https URL. A media message has no text; to send text with an image, use `cards`."
    ),
  cards: z
    .array(cardSchema)
    .max(10)
    .optional()
    .describe(
      "For a rich card or carousel: 1 card sends a standalone rich card, 2 to 10 cards send a carousel. Each card needs at least one of `title`, `description` or `media_url`."
    ),
  suggestions: z
    .array(suggestionSchema)
    .max(11)
    .optional()
    .describe(
      "Up to 11 suggested replies or actions shown as chips under the message. They work with text, media and cards."
    ),
  sender: z
    .string()
    .optional()
    .describe(
      "The RCS agent ID to send from (e.g. 'DemoSender') — NOT a phone number. Omit to use the tool's configured default sender."
    ),
  sms_fallback_message: z
    .string()
    .optional()
    .describe(
      "STRONGLY RECOMMENDED: plain text sent as a regular SMS when the RCS message can't be delivered, for example because the device doesn't support RCS. Images, cards and buttons aren't carried over, so write it to make sense on its own. Without it, those recipients get nothing."
    ),
  message_ref: z
    .string()
    .max(500)
    .optional()
    .describe(
      "Optional reference echoed back in delivery webhooks — use an ID you can join on."
    ),
});

export type RcsInput = z.infer<typeof rcsInputSchema>;
type Suggestion = z.infer<typeof suggestionSchema>;

export type RcsRequest =
  | { ok: true; payload: Record<string, unknown>; warning?: string }
  | { ok: false; error: { error: string; issues: string[] } };

export const MISSING_FALLBACK_SENDER_WARNING =
  "The SMS fallback was NOT included, because no fallback sender is configured. " +
  "Kudosity doesn't send a fallback SMS without a sender. Set `defaultFallbackSender` " +
  "on the tool to a number or sender ID that your account can send SMS from. " +
  "Recipients who can't receive RCS will not get this message.";

function toSuggestion(
  s: Suggestion,
  where: string,
  issues: string[]
): Record<string, unknown> {
  const postback = s.postback_data ? { postback_data: s.postback_data } : {};
  if (s.type === "reply") return { reply: { text: s.text, ...postback } };
  if (s.type === "open_url") {
    if (!s.url) issues.push(`${where}: an 'open_url' suggestion needs \`url\`.`);
    return {
      action: { text: s.text, open_url_action: { url: s.url }, ...postback },
    };
  }
  if (!s.phone_number)
    issues.push(`${where}: a 'dial' suggestion needs \`phone_number\`.`);
  return {
    action: {
      text: s.text,
      dial_action: { phone_number: s.phone_number },
      ...postback,
    },
  };
}

/**
 * Turn the flat tool input into a `POST /v2/rcs/messages` request body.
 *
 * Problems the API would reject are returned as a structured error the
 * model can read and correct, without a network call.
 *
 * A fallback SMS is only sent when it has a sender. If the model supplies
 * a fallback message and no fallback sender is configured, the fallback is
 * left out and a `warning` says so.
 */
export function buildRcsRequest(
  input: RcsInput,
  options: { sender: string; fallbackSender?: string }
): RcsRequest {
  const issues: string[] = [];
  const cards = input.cards ?? [];
  const kinds = [
    input.message ? "message" : undefined,
    input.media_url ? "media_url" : undefined,
    cards.length ? "cards" : undefined,
  ].filter(Boolean);

  if (kinds.length !== 1) {
    issues.push(
      "Set exactly one of `message` (text), `media_url` (an image or video on its own) or `cards` (a rich card or carousel). " +
        "To send text with an image, use `cards` with one card."
    );
  }

  const toCard = (card: (typeof cards)[number], index: number) => {
    if (!card.title && !card.description && !card.media_url) {
      issues.push(
        `cards[${index}]: a card needs at least one of \`title\`, \`description\` or \`media_url\`.`
      );
    }
    return {
      ...(card.title ? { title: card.title } : {}),
      ...(card.description ? { description: card.description } : {}),
      ...(card.media_url ? { media: { file_url: card.media_url } } : {}),
      ...(card.suggestions?.length
        ? {
            suggestions: card.suggestions.map((s, i) =>
              toSuggestion(s, `cards[${index}].suggestions[${i}]`, issues)
            ),
          }
        : {}),
    };
  };

  let contentType: "text" | "media" | "rich_card";
  let content: Record<string, unknown>;
  if (cards.length === 1) {
    contentType = "rich_card";
    content = {
      rich_card: { standalone: { card_content: toCard(cards[0], 0) } },
    };
  } else if (cards.length > 1) {
    contentType = "rich_card";
    content = { rich_card: { carousel: { card_contents: cards.map(toCard) } } };
  } else if (input.media_url) {
    contentType = "media";
    content = { media: { file_url: input.media_url } };
  } else {
    contentType = "text";
    content = { text: { message: input.message } };
  }

  if (input.suggestions?.length) {
    content.suggestions = input.suggestions.map((s, i) =>
      toSuggestion(s, `suggestions[${i}]`, issues)
    );
  }

  if (issues.length) {
    return {
      ok: false,
      error: { error: "Invalid RCS message. Nothing was sent.", issues },
    };
  }

  const wantsFallback = Boolean(input.sms_fallback_message);
  const sendsFallback = wantsFallback && Boolean(options.fallbackSender);

  return {
    ok: true,
    payload: {
      sender: options.sender,
      recipient: input.recipient,
      content_type: contentType,
      content,
      ...(sendsFallback
        ? {
            sms_fallback: {
              message: input.sms_fallback_message,
              sender: options.fallbackSender,
            },
          }
        : {}),
      ...(input.message_ref ? { message_ref: input.message_ref } : {}),
    },
    ...(wantsFallback && !sendsFallback
      ? { warning: MISSING_FALLBACK_SENDER_WARNING }
      : {}),
  };
}
