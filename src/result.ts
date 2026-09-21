/**
 * Shared tool-result helpers. The text result shape is a durable contract:
 * every tool returns either a JSON payload or an isError message.
 */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Tool results carry the payload twice: as pretty-printed JSON text (unchanged,
 * the durable contract) and as `structuredContent` for clients that read it,
 * which is also what the declared output schemas validate against. Error results
 * are exempt from output validation by the SDK, so `err` stays text-only.
 */
export function ok(data: unknown): CallToolResult {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const result: CallToolResult = { content: [{ type: 'text', text }] };
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    result.structuredContent = data as Record<string, unknown>;
  }
  return result;
}

export function err(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/** Wrap a raw handler so thrown errors become isError results instead of crashing the server. */
export function wrap<A>(handler: (args: A) => CallToolResult | Promise<CallToolResult>) {
  return async (args: A): Promise<CallToolResult> => {
    try {
      return await handler(args);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  };
}

/**
 * Every tool but `record_set` is the same kind of operation: a pure read over the
 * bundled Showdown dataset and the curated regulation data. No network, no auth,
 * and the same arguments always produce the same result — so the annotations are
 * identical across that surface and live here once.
 */
export const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/**
 * `record_set` is the one tool that writes: it appends to the per-user recorded-set
 * file (`GETCOMPETITIVE_STORE`, or `~/.getcompetitive/sets.jsonl`). Nothing is
 * overwritten and re-recording an identical set is a no-op, so it is idempotent
 * and non-destructive — but it is not a read, and saying so is the point.
 */
export const WRITE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/** Resolve a name against a Dex table; throw a helpful error listing near-matches. */
export function requireExists<T extends { exists: boolean; name: string }>(
  found: T,
  kind: string,
  query: string,
  suggestions: string[] = [],
): T {
  if (found.exists) return found;
  const hint = suggestions.length
    ? ` Did you mean: ${suggestions.slice(0, 5).join(', ')}?`
    : '';
  throw new Error(`Unknown ${kind} "${query}".${hint}`);
}
