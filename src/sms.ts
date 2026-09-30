import { tool } from "ai";
import { z } from "zod";
import { get, missingSenderError, post, resolveConfig } from "./http.js";
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

const STATUS_VALUES = [
  "PENDING",
  "SENT",
  "FAILED",
  "DELIVERED",
  "ACCEPTED",
] as const;

/**
 * Vercel AI SDK tool that retrieves a single sent SMS by id
 * (GET https://api.transmitmessage.com/v2/sms/{id}), including its current
 * delivery status.
 */
export function kudosityGetSms(config: KudosityConfig = {}) {
  const resolved = resolveConfig(config);

  return tool({
    description:
      "Get a sent SMS message by its id, including its current delivery status, " +
      "returned in lowercase: pending (queued), sent (submitted to provider), " +
      "delivered (confirmed on handset), accepted (provider accepted, delivery " +
      "unconfirmed), or failed. " +
      "Use the id returned by the send tools to check whether a message arrived.",
    inputSchema: z.object({
      id: z.string().describe("The message id returned when the SMS was sent."),
    }),
    execute: async (input) => {
      const res = await get(
        resolved,
        `/v2/sms/${encodeURIComponent(input.id)}`
      );
      return res.ok ? res.body : res.error;
    },
  });
}

/**
 * Vercel AI SDK tool that lists sent SMS messages with filters
 * (GET https://api.transmitmessage.com/v2/sms).
 */
export function kudosityListSms(config: KudosityConfig = {}) {
  const resolved = resolveConfig(config);

  return tool({
    description:
      "List sent SMS messages, filterable by date range, recipient, sender, " +
      "message_ref and delivery status. Use to review the results of recent sends — " +
      "e.g. all FAILED messages since a date, or every message sharing a message_ref.",
    inputSchema: z.object({
      limit: z
        .number()
        .int()
        .optional()
        .describe("Maximum number of messages to return. Defaults to 100."),
      page: z
        .number()
        .int()
        .optional()
        .describe("Page number, in combination with limit. Defaults to 1."),
      start_date: z
        .string()
        .optional()
        .describe(
          "Only messages created after this time, RFC3339 format, e.g. 2026-09-01T00:00:00Z"
        ),
      end_date: z
        .string()
        .optional()
        .describe("Only messages created before this time, RFC3339 format."),
      recipient: z.string().optional().describe("Filter by recipient number."),
      sender: z.string().optional().describe("Filter by sender."),
      message_ref: z
        .string()
        .optional()
        .describe("Filter by the message_ref supplied at send time."),
      // The API's filter demands uppercase while message objects report
      // status in lowercase — normalize so either casing works.
      status: z
        .preprocess(
          (v) => (typeof v === "string" ? v.toUpperCase() : v),
          z.enum(STATUS_VALUES)
        )
        .optional()
        .describe("Filter by delivery status, e.g. FAILED or DELIVERED."),
    }),
    execute: async (input) => {
      const res = await get(resolved, "/v2/sms", {
        limit: input.limit !== undefined ? String(input.limit) : undefined,
        page: input.page !== undefined ? String(input.page) : undefined,
        start_date: input.start_date,
        end_date: input.end_date,
        recipient: input.recipient,
        sender: input.sender,
        message_ref: input.message_ref,
        // normalized here as well as in the schema: direct execute() calls
        // bypass Zod parsing, and the API rejects lowercase
        status: input.status?.toUpperCase(),
      });
      return res.ok ? res.body : res.error;
    },
  });
}
