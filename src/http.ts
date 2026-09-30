export const PACKAGE_VERSION = "0.1.0";

export const DEFAULT_BASE_URL = "https://api.transmitmessage.com";
export const DEFAULT_V1_BASE_URL = "https://api.transmitsms.com";

const USER_AGENT = `ai-sdk-kudosity/${PACKAGE_VERSION}`;

export interface KudosityConfig {
  /**
   * Kudosity API key. Used as `x-api-key` on V2 calls and as the Basic
   * auth username on V1 calls. Falls back to the `KUDOSITY_API_KEY`
   * environment variable.
   */
  apiKey?: string;
  /**
   * Kudosity API secret — the Basic auth password for V1 endpoints
   * (account balance, contact lists, list sends). Falls back to the
   * `KUDOSITY_API_SECRET` environment variable. V2-only tools don't
   * need it.
   */
  apiSecret?: string;
  /**
   * Default sender used when the model does not supply one per send.
   * For SMS/MMS: a virtual number assigned to your account, or an
   * alphanumeric sender ID (max 11 chars). For RCS: a registered RCS
   * agent ID (never a phone number).
   */
  defaultSender?: string;
  /** Override the V2 API base URL. Defaults to Kudosity production. */
  baseUrl?: string;
  /** Override the V1 API base URL. Defaults to Kudosity production. */
  v1BaseUrl?: string;
}

export interface ResolvedConfig {
  apiKey: string;
  defaultSender?: string;
  baseUrl: string;
}

export interface ResolvedV1Config {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
}

export type KudosityResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; error: Record<string, unknown> };

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

export function hasV1Credentials(config: KudosityConfig = {}): boolean {
  const secret =
    config.apiSecret ??
    (typeof process !== "undefined"
      ? process.env?.KUDOSITY_API_SECRET
      : undefined);
  return Boolean(secret);
}

export function resolveV1Config(config: KudosityConfig = {}): ResolvedV1Config {
  const { apiKey } = resolveConfig(config);
  const apiSecret =
    config.apiSecret ??
    (typeof process !== "undefined"
      ? process.env?.KUDOSITY_API_SECRET
      : undefined);
  if (!apiSecret) {
    throw new Error(
      "Kudosity API secret not found. V1 endpoints (balance, contact lists, list sends) use HTTP Basic auth — pass `apiSecret` or set the KUDOSITY_API_SECRET environment variable."
    );
  }
  return {
    apiKey,
    apiSecret,
    baseUrl: config.v1BaseUrl ?? DEFAULT_V1_BASE_URL,
  };
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

/**
 * POST a JSON payload to a V2 path. Shared plumbing for all V2 tools:
 * auth, User-Agent attribution tag, envelope normalization (SMS/MMS respond
 * flat; RCS wraps in `data`), and RFC 9457 error surfacing as a structured
 * object the model can read.
 */
export async function post(
  config: ResolvedConfig,
  path: string,
  payload: Record<string, unknown>
): Promise<KudosityResult> {
  const res = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify(payload),
  });
  return toV2Result(res, await parseJson(res));
}

/** GET a V2 path with optional query parameters. */
export async function get(
  config: ResolvedConfig,
  path: string,
  query: Record<string, string | undefined> = {}
): Promise<KudosityResult> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, value);
  }
  const qs = params.size > 0 ? `?${params.toString()}` : "";
  const res = await fetch(`${config.baseUrl}${path}${qs}`, {
    method: "GET",
    headers: {
      "x-api-key": config.apiKey,
      "User-Agent": USER_AGENT,
    },
  });
  return toV2Result(res, await parseJson(res));
}

function toV2Result(
  res: Response,
  body: Record<string, unknown>
): KudosityResult {
  if (!res.ok) {
    // Kudosity V2 errors follow RFC 9457 Problem Details under an `error`
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

/**
 * Call a V1 endpoint (api.transmitsms.com). V1 speaks form-encoded requests
 * over HTTP Basic auth, and reports its outcome in-band: every response body
 * carries `error.code`, where "SUCCESS" means the call worked. Non-SUCCESS
 * codes are surfaced as structured errors; on success the redundant `error`
 * key is stripped so the model doesn't misread it.
 */
export async function requestV1(
  config: ResolvedV1Config,
  method: "GET" | "POST",
  path: string,
  params: Record<string, string | undefined> = {}
): Promise<KudosityResult> {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") form.set(key, value);
  }

  const auth = btoa(`${config.apiKey}:${config.apiSecret}`);
  const headers: Record<string, string> = {
    Authorization: `Basic ${auth}`,
    "User-Agent": USER_AGENT,
  };

  let url = `${config.baseUrl}${path}`;
  let body: string | undefined;
  if (method === "GET") {
    const qs = form.toString();
    if (qs) url += `?${qs}`;
  } else {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = form.toString();
  }

  const res = await fetch(url, { method, headers, body });
  const parsed = await parseJson(res);

  const v1Error = parsed.error as
    | { code?: string; description?: string }
    | undefined;
  if (!res.ok || (v1Error && v1Error.code && v1Error.code !== "SUCCESS")) {
    return {
      ok: false,
      error: {
        error: `Kudosity V1 API error (HTTP ${res.status})`,
        detail: v1Error ?? parsed,
      },
    };
  }

  const { error: _stripped, ...rest } = parsed;
  return { ok: true, body: rest };
}

export function missingSenderError(what: string): { error: string } {
  return {
    error: `No ${what} provided. Supply \`sender\` in the tool input, or configure \`defaultSender\` on the tool.`,
  };
}
