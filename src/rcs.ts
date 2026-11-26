import { tool } from "ai";
import { missingSenderError, post, resolveConfig } from "./http.js";
import type { KudosityConfig } from "./http.js";
import { buildRcsRequest, rcsInputSchema } from "./rcs-request.js";

export interface KudositySendRcsConfig extends KudosityConfig {
  /**
   * SMS fallback sender: a number or alphanumeric sender ID that your
   * account can send SMS from. Kudosity doesn't send a fallback SMS without
   * a sender, so set this if you want fallback. When it isn't set, the tool
   * leaves the fallback out and returns a `warning`.
   */
  defaultFallbackSender?: string;
}

/**
 * Vercel AI SDK tool that sends an RCS message through the Kudosity platform
 * (POST https://api.transmitmessage.com/v2/rcs/messages): text, an image or
 * video, a rich card, or a carousel, with suggested replies and actions and
 * an optional SMS fallback.
 *
 * RCS sends from an **RCS agent ID**, not a phone number. You create, test
 * and launch the agent in the Kudosity app under RCS > RCS Agents. Until the
 * agent is launched, it can message its test devices only.
 */
export function kudositySendRcs(config: KudositySendRcsConfig = {}) {
  const resolved = resolveConfig(config);
  const defaultFallbackSender = config.defaultFallbackSender;

  return tool({
    description:
      "Send an RCS message to a phone number via the Kudosity messaging platform. " +
      "Send one of: text (`message`), an image or video on its own (`media_url`), or a rich card or carousel (`cards`: 1 card is a rich card, 2 to 10 are a carousel). " +
      "Add `suggestions` for tappable replies, links and call buttons. " +
      "Include `sms_fallback_message` on almost every send, so that recipients who can't receive RCS get an SMS. " +
      "The sender is an RCS agent ID, never a phone number. " +
      "Returns the message id. A returned id means the message was accepted, not delivered: delivery, read receipts and tapped suggestions arrive on webhooks.",
    inputSchema: rcsInputSchema,
    execute: async (input) => {
      const sender = input.sender ?? resolved.defaultSender;
      if (!sender) return missingSenderError("RCS agent ID");

      const request = buildRcsRequest(input, {
        sender,
        fallbackSender: defaultFallbackSender,
      });
      if (!request.ok) return request.error;

      const res = await post(resolved, "/v2/rcs/messages", request.payload);
      if (!res.ok) return res.error;

      // RCS responses are wrapped in a `data` envelope (unwrapped by post()).
      const rcs = res.body;
      return {
        id: rcs.id,
        recipient: rcs.recipient,
        sender: rcs.sender,
        content_type: rcs.content_type,
        created_at: rcs.created_at,
        message_ref: rcs.message_ref,
        ...(request.warning ? { warning: request.warning } : {}),
      };
    },
  });
}
