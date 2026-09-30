import { tool } from "ai";
import { z } from "zod";
import { requestV1, resolveV1Config } from "./http.js";
import type { KudosityConfig } from "./http.js";

/**
 * Vercel AI SDK tool that sends an SMS to a contact list or multiple numbers
 * (POST https://api.transmitsms.com/send-sms.json — V1, Basic auth), with
 * optional scheduling.
 *
 * For a simple single-recipient send, prefer `kudositySendSms` (V2).
 */
export function kudositySendSmsBatch(config: KudosityConfig = {}) {
  const resolved = resolveV1Config(config);
  const defaultSender = config.defaultSender;

  return tool({
    description:
      "Send an SMS to a whole Kudosity contact list, or to up to 500 comma-separated numbers, " +
      "optionally scheduled for a future time. Provide exactly one of `list_id` or `to`. " +
      "For a single recipient sent now, use kudosity_send_sms instead. " +
      "Returns the send id and cost details.",
    inputSchema: z.object({
      message: z
        .string()
        .max(612)
        .describe("The SMS body to send (up to 612 alphanumeric characters)."),
      list_id: z
        .number()
        .int()
        .optional()
        .describe("ID of the contact list to send to. Omit when using `to`."),
      to: z
        .string()
        .optional()
        .describe(
          "Up to 500 comma-separated destination numbers. Omit when using `list_id`."
        ),
      from: z
        .string()
        .optional()
        .describe(
          "Sender: a virtual number, short code, or alphanumeric sender ID (max 11 chars). Omit to use the tool's configured default sender."
        ),
      countrycode: z
        .string()
        .length(2)
        .optional()
        .describe("2-letter ISO country code to auto-format local numbers."),
      send_at: z
        .string()
        .optional()
        .describe(
          "Schedule the send: UTC time formatted YYYY-MM-DD HH:MM:SS. Omit to send immediately."
        ),
    }),
    execute: async (input) => {
      if (!input.list_id && !input.to) {
        return {
          error:
            "Provide exactly one of `list_id` (send to a contact list) or `to` (comma-separated numbers).",
        };
      }
      if (input.list_id && input.to) {
        return {
          error: "Provide only one of `list_id` or `to`, not both.",
        };
      }

      const res = await requestV1(resolved, "POST", "/send-sms.json", {
        message: input.message,
        list_id:
          input.list_id !== undefined ? String(input.list_id) : undefined,
        to: input.to,
        from: input.from ?? defaultSender,
        countrycode: input.countrycode,
        send_at: input.send_at,
      });
      return res.ok ? res.body : res.error;
    },
  });
}
