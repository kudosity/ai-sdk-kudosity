import { tool } from "ai";
import { z } from "zod";
import { missingSenderError, post, resolveConfig } from "./http.js";
import type { KudosityConfig } from "./http.js";

export interface KudositySendRcsConfig extends KudosityConfig {
  /**
   * Default SMS fallback sender (a number or alphanumeric sender ID on
   * your account) used when the model supplies a fallback message but no
   * fallback sender.
   */
  defaultFallbackSender?: string;
}

const inputSchema = z.object({
  recipient: z
    .string()
    .describe(
      "Destination phone number, local or E.164 international format, e.g. 61491570156"
    ),
  message: z
    .string()
    .max(3072)
    .describe("The RCS message text to send (up to 3072 characters)."),
  sender: z
    .string()
    .optional()
    .describe(
      "The registered RCS agent ID to send from (e.g. 'DemoSender') — NOT a phone number. Omit to use the tool's configured default sender."
    ),
  sms_fallback_message: z
    .string()
    .optional()
    .describe(
      "STRONGLY RECOMMENDED: a shorter plain-text version sent as a regular SMS when the recipient's device can't receive RCS. Without it, non-RCS handsets get nothing."
    ),
  message_ref: z
    .string()
    .max(500)
    .optional()
    .describe(
      "Optional reference echoed back in delivery webhooks — use an ID you can join on."
    ),
});

/**
 * Vercel AI SDK tool that sends an RCS (rich, branded) message through the
 * Kudosity platform (POST https://api.transmitmessage.com/v2/rcs/messages),
 * with optional automatic SMS fallback for non-RCS devices.
 *
 * RCS sends from a **registered RCS agent ID**, not a phone number — the
 * agent must be provisioned by Kudosity and launched on the destination
 * carrier before it will deliver.
 */
export function kudositySendRcs(config: KudositySendRcsConfig = {}) {
  const resolved = resolveConfig(config);
  const defaultFallbackSender = config.defaultFallbackSender;

  return tool({
    description:
      "Send an RCS (rich, branded) message to a phone number via the Kudosity messaging platform, " +
      "with optional SMS fallback for devices that can't receive RCS — include the fallback on almost every send. " +
      "The sender is a registered RCS agent ID, never a phone number. " +
      "Returns the message id (for matching delivery webhooks, including READ receipts).",
    inputSchema,
    execute: async (input) => {
      const sender = input.sender ?? resolved.defaultSender;
      if (!sender) return missingSenderError("RCS agent ID");

      const fallbackSender =
        defaultFallbackSender && input.sms_fallback_message
          ? defaultFallbackSender
          : undefined;

      const res = await post(resolved, "/v2/rcs/messages", {
        sender,
        recipient: input.recipient,
        content_type: "text",
        content: { text: { message: input.message } },
        ...(input.sms_fallback_message
          ? {
              sms_fallback: {
                message: input.sms_fallback_message,
                ...(fallbackSender ? { sender: fallbackSender } : {}),
              },
            }
          : {}),
        ...(input.message_ref ? { message_ref: input.message_ref } : {}),
      });
      if (!res.ok) return res.error;

      // RCS responses are wrapped in a `data` envelope (unwrapped by post()).
      const rcs = res.body;
      return {
        id: rcs.id,
        recipient: rcs.recipient,
        sender: rcs.sender,
        created_at: rcs.created_at,
        message_ref: rcs.message_ref,
      };
    },
  });
}
