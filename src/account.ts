import { tool } from "ai";
import { z } from "zod";
import { requestV1, resolveV1Config } from "./http.js";
import type { KudosityConfig } from "./http.js";

/**
 * Vercel AI SDK tool that retrieves the Kudosity account balance
 * (GET https://api.transmitsms.com/get-balance.json — V1, Basic auth).
 */
export function kudosityGetBalance(config: KudosityConfig = {}) {
  const resolved = resolveV1Config(config);

  return tool({
    description:
      "Get the Kudosity account balance and currency. " +
      "Use to check the account can afford a send, or to report account status.",
    inputSchema: z.object({}),
    execute: async () => {
      const res = await requestV1(resolved, "GET", "/get-balance.json");
      return res.ok ? res.body : res.error;
    },
  });
}
