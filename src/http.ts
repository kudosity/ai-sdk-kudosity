export const PACKAGE_VERSION = "0.1.0";

export const DEFAULT_BASE_URL = "https://api.transmitmessage.com";

export interface KudosityConfig {
  /**
   * Kudosity V2 API key (`x-api-key`). Falls back to the
   * `KUDOSITY_API_KEY` environment variable.
   */
  apiKey?: string;
  /**
   * Default sender used when the model does not supply one per send.
   * For SMS/MMS: a virtual number assigned to your account, or an
   * alphanumeric sender ID (max 11 chars). For RCS: a registered RCS
   * agent ID (never a phone number).
   */
  defaultSender?: string;
  /** Override the API base URL. Defaults to Kudosity production. */
  baseUrl?: string;
}

export interface ResolvedConfig {
  apiKey: string;
  defaultSender?: string;
  baseUrl: string;
}

export function resolveConfig(config: KudosityConfig = {}): ResolvedConfig {
  const apiKey =
    config.apiKey ??
    (typeof process !== "undefined"
      ? process.env?.KUDOSITY_API_KEY
      : undefined);
  if (!apiKey) {
    throw new Error(
      "Kudosity API key not found. Pass `apiKey` or set the KUDOSITY_API_KEY environment variable (Kudosity dashboard → Developers → API Settings)."
    );
  }
  return {
    apiKey,
    defaultSender: config.defaultSender,
    baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
  };
}

/**
 * POST a JSON payload to a V2 path. Shared plumbing for all Kudosity tools:
 * auth, User-Agent attribution tag, envelope normalization (SMS/MMS respond
 * flat; RCS wraps in `data`), and RFC 9457 error surfacing as a structured
 * object the model can read.
 */
export async function post(
  config: ResolvedConfig,
  path: string,
  payload: Record<string, unknown>
): Promise<
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; error: Record<string, unknown> }
> {
  const res = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey,
      "Content-Type": "application/json",
      "User-Agent": `ai-sdk-kudosity/${PACKAGE_VERSION}`,
    },
    body: JSON.stringify(payload),
  });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    // Kudosity errors follow RFC 9457 Problem Details under an `error`
    // key; `error.issues[]` lists every failed field at once.
    return {
      ok: false,
      error: {
        error: `Kudosity API error (HTTP ${res.status})`,
        detail: body.error ?? body,
      },
    };
  }

  return {
    ok: true,
    body: ((body as { data?: unknown }).data ?? body) as Record<
      string,
      unknown
    >,
  };
}

export function missingSenderError(what: string): { error: string } {
  return {
    error: `No ${what} provided. Supply \`sender\` in the tool input, or configure \`defaultSender\` on the tool.`,
  };
}
