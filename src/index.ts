import { kudositySendMms } from "./mms.js";
import { kudositySendRcs } from "./rcs.js";
import { kudositySendSms } from "./sms.js";
import type { KudositySendRcsConfig } from "./rcs.js";

export { type KudosityConfig } from "./http.js";
export {
  kudositySendSms,
  type KudositySendSmsConfig,
  type KudositySmsResponse,
} from "./sms.js";
export { kudositySendMms, type KudositySendMmsConfig } from "./mms.js";
export { kudositySendRcs, type KudositySendRcsConfig } from "./rcs.js";

/**
 * All three Kudosity tools keyed by their tool names, ready to spread into
 * `generateText`/`streamText`:
 *
 * ```ts
 * const result = await generateText({
 *   model,
 *   tools: kudosityTools({ defaultSender: "61481074185" }),
 *   prompt: "...",
 * });
 * ```
 */
export function kudosityTools(config: KudositySendRcsConfig = {}) {
  return {
    kudosity_send_sms: kudositySendSms(config),
    kudosity_send_mms: kudositySendMms(config),
    kudosity_send_rcs: kudositySendRcs(config),
  };
}
