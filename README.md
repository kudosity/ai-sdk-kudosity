# ai-sdk-kudosity

[Vercel AI SDK](https://ai-sdk.dev) tools for [Kudosity](https://kudosity.com) — let AI agents send **SMS, MMS and RCS** through the Kudosity messaging platform.

| Tool | Channel | Endpoint |
|---|---|---|
| `kudositySendSms` | SMS | `POST /v2/sms` |
| `kudositySendMms` | MMS — image/GIF/video/audio by public URL | `POST /v2/mms` |
| `kudositySendRcs` | RCS — rich, branded messaging with SMS fallback | `POST /v2/rcs/messages` |

```bash
npm install ai-sdk-kudosity ai
```

## Setup

Get your API key from the Kudosity dashboard under **Developers → API Settings** and set it in the environment:

```bash
export KUDOSITY_API_KEY="your-api-key"
```

## Usage

Each tool is a factory that takes your account defaults and returns a standard AI SDK tool:

```ts
import { generateText } from "ai";
import { kudositySendSms } from "ai-sdk-kudosity";

const result = await generateText({
  model, // any AI SDK model
  tools: {
    kudosity_send_sms: kudositySendSms({
      // a virtual number on your account, or an alphanumeric sender ID (max 11 chars)
      defaultSender: "61481074185",
    }),
  },
  prompt: "Text 61491570156 that their appointment is tomorrow at 10am.",
});
```

Or register all three channels at once:

```ts
import { kudosityTools } from "ai-sdk-kudosity";

const result = await generateText({
  model,
  tools: kudosityTools({
    defaultSender: "61481074185",
    // used by the RCS tool when the model adds an SMS fallback
    defaultFallbackSender: "61481074185",
  }),
  prompt: "...",
});
```

> **RCS note:** the RCS `sender` is a **registered RCS agent ID** provisioned by
> Kudosity — talk to your Kudosity contact to get one. When you register the RCS
> tool on its own, set `defaultSender` to the agent ID, not a phone number. The
> tool prompts the model to include `sms_fallback_message` so non-RCS handsets
> still get the message as SMS.

## Configuration

Every factory accepts:

| Option | Description |
|---|---|
| `apiKey` | Kudosity V2 API key. Defaults to the `KUDOSITY_API_KEY` environment variable. |
| `defaultSender` | Sender used when the model doesn't supply one per send. |
| `baseUrl` | Override the API base URL. Defaults to Kudosity production. |

`kudositySendRcs` and `kudosityTools` also accept `defaultFallbackSender` — the
SMS sender used when the model supplies a fallback message.

## Behavior

- Tool results are structured objects: the message `id` (for matching delivery
  webhooks), `status`, and echo fields like `message_ref`.
- API errors (RFC 9457 Problem Details) are returned to the model as structured
  error objects rather than thrown, so the agent can read the failed fields and
  correct its next call.
- A `pending` or `queued` status means the message was accepted; real delivery
  outcomes arrive via [webhooks](https://developers.kudosity.com/).

## License

MIT
