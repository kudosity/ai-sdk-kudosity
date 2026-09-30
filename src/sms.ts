import { tool } from "ai";
import { z } from "zod";
import { missingSenderError, post, resolveConfig } from "./http.js";
import type { KudosityConfig } from "./http.js";

export type KudositySendSmsConfig = KudosityConfig;

/** Flat response returned by POST /v2/sms (no `data` envelope). */
export interface KudositySmsResponse {
  id: string;
  recipient: string;
  sender: string;
  message: string;
  status: string;
  message_ref?: string;
  /** NOTE: the API returns this as a string, e.g. "1". */
  sms_count?: string;
  created_at?: string;
  [key: string]: unknown;
}

const inputSchema = z.object({
  recipient: z
    .string()
    .describe(
      "Destination phone number, local or E.164 international format, e.g. 61491570156"
    ),
  message: z.string().describe("The SMS body text to send."),
  sender: z
    .string()
    .optional()
    .describe(
      "Sender: a virtual number assigned to the Kudosity account or an alphanumeric sender ID (max 11 chars). Omit to use the tool's configured default sender."
    ),
  message_ref: z
    .string()
    .max(500)
    .optional()
    .describe(
      "Optional reference echoed back in delivery webhooks — use an ID you can join on, like an order number."
    ),
});

/**
 * Vercel AI SDK tool that sends an SMS through the Kudosity platform
 * (POST https://api.transmitmessage.com/v2/sms).
 *
 * ```ts
 * import { kudositySendSms } from "ai-sdk-kudosity";
 *
 * const result = await generateText({
 *   model,
 *   tools: { kudosity_send_sms: kudositySendSms({ defaultSender: "61481074185" }) },
 *   prompt: "Text 61491570156 that their order has shipped.",
 * });
 * ```
 */
export function kudositySendSms(config: KudositySendSmsConfig = {}) {
  const resolved = resolveConfig(config);

  return tool({
    description:
      "Send an SMS text message to a phone number via the Kudosity messaging platform. " +
      "Use for notifications, reminders, alerts and follow-ups. " +
      "Returns the message id (for matching delivery webhooks) and status.",
    inputSchema,
    execute: async (input) => {
      const sender = input.sender ?? resolved.defaultSender;
      if (!sender) return missingSenderError("sender");

      const res = await post(resolved, "/v2/sms", {
        recipient: input.recipient,
        message: input.message,
        sender,
        ...(input.message_ref ? { message_ref: input.message_ref } : {}),
      });
      if (!res.ok) return res.error;

      const sms = res.body as unknown as KudositySmsResponse;
      return {
        id: sms.id,
        status: sms.status,
        recipient: sms.recipient,
        sender: sms.sender,
        sms_count: sms.sms_count,
        message_ref: sms.message_ref,
      };
    },
  });
}
