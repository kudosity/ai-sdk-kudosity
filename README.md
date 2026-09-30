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
| `kudositySendRcs` | Send rich, branded RCS with SMS fallback | V2 |
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

> **RCS note:** the RCS `sender` is a **registered RCS agent ID** provisioned by
> Kudosity — talk to your Kudosity contact to get one. When you register the RCS
> tool on its own, set `defaultSender` to the agent ID, not a phone number. The
> tool prompts the model to include `sms_fallback_message` so non-RCS handsets
> still get the message as SMS.

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
SMS sender used when the model supplies an RCS fallback message.

## Behavior

- Tool results are structured objects: the message `id` (for matching delivery
  webhooks), `status`, and echo fields like `message_ref`.
- API errors are returned to the model as structured error objects rather than
  thrown — V2 errors carry RFC 9457 Problem Details (including `issues[]` per
  failed field), and V1 in-band error codes are surfaced the same way — so the
  agent can read what failed and correct its next call.

## License

MIT
