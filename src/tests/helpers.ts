import { vi } from "vitest";

export function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

/**
 * Invoke an AI SDK tool's execute directly, the way the SDK would after a
 * model emits a tool call.
 */
export async function callTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  return tool.execute(input, { toolCallId: "test-call", messages: [] });
}
