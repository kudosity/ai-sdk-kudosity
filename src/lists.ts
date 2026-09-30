import { tool } from "ai";
import { z } from "zod";
import { requestV1, resolveV1Config } from "./http.js";
import type { KudosityConfig } from "./http.js";

/**
 * Vercel AI SDK tool that creates a contact list
 * (POST https://api.transmitsms.com/add-list.json — V1, Basic auth).
 */
export function kudosityCreateList(config: KudosityConfig = {}) {
  const resolved = resolveV1Config(config);

  return tool({
    description:
      "Create a new Kudosity contact list. Returns the list id — keep it: " +
      "adding contacts and sending to the list both need it. " +
      "`firstname` and `lastname` fields exist on every list by default.",
    inputSchema: z.object({
      name: z.string().describe("A unique name for the list."),
      fields: z
        .array(z.string())
        .max(10)
        .optional()
        .describe(
          "Optional custom field names (up to 10), e.g. ['email', 'postcode']. Mapped to field_1…field_10 in order."
        ),
    }),
    execute: async (input) => {
      const params: Record<string, string | undefined> = { name: input.name };
      input.fields?.forEach((field, i) => {
        params[`field_${i + 1}`] = field;
      });
      const res = await requestV1(resolved, "POST", "/add-list.json", params);
      return res.ok ? res.body : res.error;
    },
  });
}

/**
 * Vercel AI SDK tool that adds a single contact to a contact list
 * (POST https://api.transmitsms.com/add-to-list.json — V1, Basic auth).
 */
export function kudosityAddToList(config: KudosityConfig = {}) {
  const resolved = resolveV1Config(config);

  return tool({
    description:
      "Add one contact to an existing Kudosity contact list. " +
      "If the number is already on the list it is ignored, not updated. " +
      "Pass `countrycode` rather than reformatting local numbers yourself.",
    inputSchema: z.object({
      list_id: z.number().int().describe("ID of the list to add the contact to."),
      msisdn: z
        .string()
        .describe(
          "The contact's mobile number — E.164 international format, or local format with `countrycode` set."
        ),
      countrycode: z
        .string()
        .length(2)
        .optional()
        .describe(
          "2-letter ISO country code, e.g. AU — auto-formats local numbers to international."
        ),
      first_name: z.string().optional().describe("Contact first name."),
      last_name: z.string().optional().describe("Contact last name."),
      fields: z
        .array(z.string())
        .max(10)
        .optional()
        .describe(
          "Optional values for the list's custom fields, mapped to field_1…field_10 in order."
        ),
    }),
    execute: async (input) => {
      const params: Record<string, string | undefined> = {
        list_id: String(input.list_id),
        msisdn: input.msisdn,
        countrycode: input.countrycode,
        first_name: input.first_name,
        last_name: input.last_name,
      };
      input.fields?.forEach((value, i) => {
        params[`field_${i + 1}`] = value;
      });
      const res = await requestV1(
        resolved,
        "POST",
        "/add-to-list.json",
        params
      );
      return res.ok ? res.body : res.error;
    },
  });
}

/**
 * Vercel AI SDK tool that retrieves the account's contact lists
 * (GET https://api.transmitsms.com/get-lists.json — V1, Basic auth).
 */
export function kudosityGetLists(config: KudosityConfig = {}) {
  const resolved = resolveV1Config(config);

  return tool({
    description:
      "Get the Kudosity account's contact lists with their ids, names and member counts. " +
      "Use to find a list id before adding contacts or sending to a list.",
    inputSchema: z.object({
      page: z
        .number()
        .int()
        .optional()
        .describe("Page number, for accounts with many lists."),
      max: z
        .number()
        .int()
        .optional()
        .describe("Maximum number of lists per page."),
    }),
    execute: async (input) => {
      const res = await requestV1(resolved, "GET", "/get-lists.json", {
        page: input.page !== undefined ? String(input.page) : undefined,
        max: input.max !== undefined ? String(input.max) : undefined,
      });
      return res.ok ? res.body : res.error;
    },
  });
}
