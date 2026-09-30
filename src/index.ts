import { kudosityGetBalance } from "./account.js";
import { hasV1Credentials } from "./http.js";
import {
  kudosityAddToList,
  kudosityCreateList,
  kudosityGetLists,
} from "./lists.js";
import { kudositySendMms } from "./mms.js";
import { kudositySendRcs } from "./rcs.js";
import { kudositySendSmsBatch } from "./send-batch.js";
import { kudosityGetSms, kudosityListSms, kudositySendSms } from "./sms.js";
import type { KudositySendRcsConfig } from "./rcs.js";

export { type KudosityConfig } from "./http.js";
export {
  kudositySendSms,
  kudosityGetSms,
  kudosityListSms,
  type KudositySendSmsConfig,
  type KudositySmsResponse,
} from "./sms.js";
export { kudositySendMms, type KudositySendMmsConfig } from "./mms.js";
export { kudositySendRcs, type KudositySendRcsConfig } from "./rcs.js";
export { kudosityGetBalance } from "./account.js";
export {
  kudosityCreateList,
  kudosityAddToList,
  kudosityGetLists,
} from "./lists.js";
export { kudositySendSmsBatch } from "./send-batch.js";

/**
 * Every Kudosity tool keyed by its tool name, ready to spread into
 * `generateText`/`streamText`:
 *
 * ```ts
 * const result = await generateText({
 *   model,
 *   tools: kudosityTools({ defaultSender: "61481074185" }),
 *   prompt: "...",
 * });
 * ```
 *
 * Always includes the V2 tools (send SMS/MMS/RCS, get SMS, list SMS).
 * The V1 tools (balance, contact lists, batch/scheduled sends) additionally
 * need an API secret — they are included when `apiSecret` or the
 * `KUDOSITY_API_SECRET` environment variable is set, and omitted otherwise.
 */
export function kudosityTools(config: KudositySendRcsConfig = {}) {
  const v2 = {
    kudosity_send_sms: kudositySendSms(config),
    kudosity_send_mms: kudositySendMms(config),
    kudosity_send_rcs: kudositySendRcs(config),
    kudosity_get_sms: kudosityGetSms(config),
    kudosity_list_sms: kudosityListSms(config),
  };
  if (!hasV1Credentials(config)) return v2;
  return {
    ...v2,
    kudosity_get_balance: kudosityGetBalance(config),
    kudosity_create_list: kudosityCreateList(config),
    kudosity_add_to_list: kudosityAddToList(config),
    kudosity_get_lists: kudosityGetLists(config),
    kudosity_send_sms_batch: kudositySendSmsBatch(config),
  };
}
