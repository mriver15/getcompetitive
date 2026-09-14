/**
 * Shared tool-result helpers. The text result shape is a durable contract:
 * every tool returns either a JSON payload or an isError message.
 */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function ok(data: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
  };
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
