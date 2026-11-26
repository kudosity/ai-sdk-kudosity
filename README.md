# ai-sdk-kudosity

[Vercel AI SDK](https://ai-sdk.dev) tools for [Kudosity](https://kudosity.com) — give AI agents the full messaging loop on the Kudosity platform: check the account, build contact lists, send **SMS, MMS and RCS**, and read back delivery results.

| Tool | What it does | API |
|---|---|---|
| `kudosityGetBalance` | Account balance and currency | V1 |
| `kudosityCreateList` | Create a contact list (with custom fields) | V1 |
| `kudosityAddToList` | Add a contact to a list | V1 |
| `kudosityGetLists` | List the account's contact lists and ids | V1 |
| `kudositySendSms` | Send an SMS to one recipient | V2 |
| `kudositySendSmsBatch` | Send to a whole list or up to 500 numbers, with scheduling | V1 |
| `kudositySendMms` | Send media (image/GIF/video/audio) by public URL | V2 |
| `kudositySendRcs` | Send RCS: text, media, rich cards and carousels, with suggested replies, buttons and SMS fallback | V2 |
| `kudosityGetSms` | Get one sent message and its delivery status | V2 |
| `kudosityListSms` | Query sent messages by date, recipient, status, message_ref | V2 |

```bash
npm install ai-sdk-kudosity ai
```

## Setup

Get your credentials from the Kudosity dashboard under **Developers → API Settings**:

```bash
export KUDOSITY_API_KEY="your-api-key"
export KUDOSITY_API_SECRET="your-api-secret"
```

Kudosity has two API generations and the tools span both. The key alone covers the V2 tools (single sends, message results). The secret additionally unlocks the V1 tools (balance, contact lists, batch and scheduled sends).

## Usage

Register everything at once — the agent gets the end-to-end loop:

```ts
import { generateText } from "ai";
import { kudosityTools } from "ai-sdk-kudosity";

const result = await generateText({
  model, // any AI SDK model
  tools: kudosityTools({ defaultSender: "61481074185" }),
  prompt:
    "Create a list called 'VIP customers', add 61491570156 to it, " +
    "text the list that the sale starts tomorrow, then confirm the send went out.",
});
```

`kudosityTools()` always includes the V2 tools; the V1 tools are included when an API secret is configured and omitted otherwise.

Or pick individual tools:

```ts
import { kudositySendSms, kudosityGetSms } from "ai-sdk-kudosity";

const tools = {
  kudosity_send_sms: kudositySendSms({ defaultSender: "61481074185" }),
  kudosity_get_sms: kudosityGetSms(),
};
```

## RCS

`kudositySendRcs` sends text, an image or video, a rich card, or a carousel. Register it with your RCS agent ID and an SMS sender for the fallback:

```ts
import { kudositySendRcs } from "ai-sdk-kudosity";

const tools = {
  kudosity_send_rcs: kudositySendRcs({
    defaultSender: "YourAgentId", // your RCS agent ID, not a phone number
    defaultFallbackSender: "61481074185", // without it, no fallback is sent
  }),
};
```

The model sets exactly one of `message`, `media_url` or `cards`. A rich card with a button and a suggested reply looks like this as tool input:

```ts
{
  recipient: "61491570156",
  cards: [
    {
      title: "Your order is out for delivery",
      description: "Order 12345 arrives today between 2pm and 4pm.",
      media_url: "https://example.com/images/van.jpg",
      suggestions: [
        { type: "open_url", text: "Track order", url: "https://example.com/track/12345" },
      ],
    },
  ],
  suggestions: [
    { type: "reply", text: "Reschedule", postback_data: "order-12345:reschedule" },
  ],
  sms_fallback_message:
    "Your order 12345 arrives today 2-4pm. Track: https://example.com/track/12345",
  message_ref: "order-12345",
}
```

| Field | Notes |
|---|---|
| `recipient` | E.164 international format, such as `61491570156`. Local format is rejected. |
| `message` | A text message, up to 3072 characters |
| `media_url` | One image or video on its own, by public `https` URL |
| `cards` | 1 card sends a rich card; 2 to 10 send a carousel. Each card takes `title`, `description`, `media_url` and up to 4 `suggestions` |
| `suggestions` | Up to 11 chips under the message. Each is a `reply`, an `open_url` or a `dial`, with an optional `postback_data` |
| `sms_fallback_message` | Plain text sent by SMS when the RCS message can't be delivered |
| `sender` | Overrides `defaultSender` for one send |
| `message_ref` | Echoed in delivery webhooks |

Things to get right:

- **The sender is your RCS agent ID, not a phone number.** You create, test and launch the agent in the Kudosity app under **RCS → RCS Agents**. Until it's launched, it can message its test devices only. See [RCS onboarding](https://developers.kudosity.com/docs/rcs-onboarding).
- **An SMS fallback needs a sender.** Kudosity doesn't send a fallback SMS without one, so set `defaultFallbackSender` to a number or sender ID that your account can send SMS from. If the model supplies a fallback message and no fallback sender is configured, the tool sends the RCS message without a fallback and returns a `warning`.
- **A returned `id` means accepted, not delivered.** Delivery and read receipts arrive on the `RCS_STATUS` webhook. A message that falls back to SMS reports on `SMS_STATUS` with the same `id`. See [Track an RCS message that falls back to SMS](https://developers.kudosity.com/docs/rcs-sms-fallback).
- **A tapped suggestion arrives as an `RCS_INBOUND` webhook event** with `mo.content_type` set to `SUGGESTION` and your `postback_data`. Route on `postback_data`, not on the label.
- **Media URLs must be public `https` URLs that don't redirect.** Kudosity fetches each file when you send, and a file it can't fetch fails the request.

The [RCS Message Guide](https://developers.kudosity.com/docs/rcs-message-guide) has the full rules for each format.

## Closing the loop on delivery

Every send tool returns a message `id`. The agent can check outcomes two ways:

- **Poll:** `kudosity_get_sms` returns the current status — `PENDING`, `SENT`, `ACCEPTED`, `DELIVERED` or `FAILED` — and `kudosity_list_sms` queries in bulk (for example, every `FAILED` message since a date, or all messages sharing a `message_ref`).
- **Push:** pass `message_ref` at send time and match it in [delivery webhooks](https://developers.kudosity.com/).

A `PENDING` or `queued` result from a send means the message was accepted, not delivered — delivery confirmation comes from the status tools or webhooks.

## Configuration

Every factory accepts:

| Option | Description |
|---|---|
| `apiKey` | Kudosity API key. Defaults to the `KUDOSITY_API_KEY` environment variable. |
| `apiSecret` | Kudosity API secret, for V1 tools. Defaults to `KUDOSITY_API_SECRET`. |
| `defaultSender` | Sender used when the model doesn't supply one per send. |
| `baseUrl` / `v1BaseUrl` | Override the API base URLs. Default to Kudosity production. |

`kudositySendRcs` and `kudosityTools` also accept `defaultFallbackSender` — the
SMS sender for the RCS fallback. Without it, no fallback SMS is sent.

## Behavior

- Tool results are structured objects: the message `id` (for matching delivery
  webhooks), `status`, and echo fields like `message_ref`.
- API errors are returned to the model as structured error objects rather than
  thrown — V2 errors carry RFC 9457 Problem Details (including `issues[]` per
  failed field), and V1 in-band error codes are surfaced the same way — so the
  agent can read what failed and correct its next call.

## License

MIT
